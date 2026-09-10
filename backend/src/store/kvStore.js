'use strict';
const { Redis } = require('@upstash/redis');
const { env } = require('../config/env');

/**
 * Upstash Redis store (HTTP-based → no connection pooling issues on serverless).
 * Layout (P = env.store.keyPrefix, empty in production):
 *   {P}doc:{collection}:{id}   -> JSON document
 *   {P}idx:{collection}        -> Set of ids in the collection
 *   {P}ctr:{key}               -> monotonic counters (queue numbers)
 *   {P}rl:{key}                -> rate-limit windows
 * findAll/findOne read the index set then MGET; filtering is done in-process
 * (fine at hackathon/demo scale).
 *
 * ALL FOUR namespaces take the prefix. Staging shares production's database, so prefixing only
 * the documents would still let staging hand out production's next queue number and consume
 * production's rate-limit budget.
 */
function createKvStore() {
  const redis = new Redis({ url: env.store.upstashUrl, token: env.store.upstashToken });
  const P = env.store.keyPrefix; // '' in production → keys keep their original shape
  const docKey = (c, id) => `${P}doc:${c}:${id}`;
  const idxKey = (c) => `${P}idx:${c}`;

  async function loadAll(collection) {
    const ids = await redis.smembers(idxKey(collection));
    if (!ids || ids.length === 0) return [];
    const keys = ids.map((id) => docKey(collection, id));
    const vals = await redis.mget(...keys);
    return vals.filter(Boolean).map((v) => (typeof v === 'string' ? JSON.parse(v) : v));
  }

  return {
    driver: 'kv',
    // Atomic monotonic counter via Redis INCR — safe across concurrent serverless invocations.
    async incr(key) {
      return await redis.incr(`${P}ctr:${key}`);
    },
    async fixedWindowIncrement(key, windowMs) {
      const redisKey = `${P}rl:${key}`;
      const count = await redis.incr(redisKey);
      // Set expiry only for a new window. Redis INCR is atomic; a duplicate expiry is harmless.
      if (count === 1) await redis.expire(redisKey, Math.max(1, Math.ceil(windowMs / 1000)));
      return { count, resetAt: Date.now() + windowMs };
    },
    async create(collection, doc) {
      await redis.set(docKey(collection, doc.id), JSON.stringify(doc));
      await redis.sadd(idxKey(collection), doc.id);
      return doc;
    },
    async findById(collection, id) {
      const v = await redis.get(docKey(collection, id));
      return v == null ? null : typeof v === 'string' ? JSON.parse(v) : v;
    },
    async findAll(collection, filter) {
      const all = await loadAll(collection);
      return filter ? all.filter(filter) : all;
    },
    async findOne(collection, filter) {
      const all = await loadAll(collection);
      return all.find(filter) || null;
    },
    async update(collection, id, patch) {
      const cur = await this.findById(collection, id);
      if (!cur) return null;
      const next = { ...cur, ...patch, id, updatedAt: new Date().toISOString() };
      await redis.set(docKey(collection, id), JSON.stringify(next));
      return next;
    },
    async claimStatus(collection, id, expectedStatus, patch) {
      const nextPatch = { ...patch, updatedAt: new Date().toISOString() };
      const script = `
        local raw = redis.call('GET', KEYS[1])
        if not raw then return nil end
        local doc = cjson.decode(raw)
        if doc.status ~= ARGV[1] then return nil end
        local patch = cjson.decode(ARGV[2])
        for k, v in pairs(patch) do doc[k] = v end
        local encoded = cjson.encode(doc)
        redis.call('SET', KEYS[1], encoded)
        return encoded
      `;
      const value = await redis.eval(script, [docKey(collection, id)], [expectedStatus, JSON.stringify(nextPatch)]);
      if (!value) return null;
      return typeof value === 'string' ? JSON.parse(value) : value;
    },
    async remove(collection, id) {
      await redis.del(docKey(collection, id));
      await redis.srem(idxKey(collection), id);
      return true;
    },
    async reset() {
      // No-op safeguard; intentionally not flushing the whole Redis instance.
    },
  };
}

module.exports = { createKvStore };
