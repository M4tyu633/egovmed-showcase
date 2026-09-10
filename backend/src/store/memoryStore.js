'use strict';

/**
 * In-process store. Zero-config, great for local dev and tests.
 * WARNING: does not persist across serverless invocations — use the KV store on Vercel.
 */
function createMemoryStore() {
  const db = new Map(); // collection -> Map(id -> doc)
  const counters = new Map(); // key -> number
  const rateLimits = new Map(); // key -> { count, expiresAt }
  const col = (name) => {
    if (!db.has(name)) db.set(name, new Map());
    return db.get(name);
  };
  const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

  return {
    driver: 'memory',
    // Atomic monotonic counter (read-modify-write is synchronous here → no interleaving).
    async incr(key) {
      const n = (counters.get(key) || 0) + 1;
      counters.set(key, n);
      return n;
    },
    async fixedWindowIncrement(key, windowMs) {
      const now = Date.now();
      const current = rateLimits.get(key);
      const entry = !current || current.expiresAt <= now
        ? { count: 1, expiresAt: now + windowMs }
        : { count: current.count + 1, expiresAt: current.expiresAt };
      rateLimits.set(key, entry);
      return { count: entry.count, resetAt: entry.expiresAt };
    },
    async create(collection, doc) {
      col(collection).set(doc.id, clone(doc));
      return clone(doc);
    },
    async findById(collection, id) {
      return clone(col(collection).get(id) || null);
    },
    async findAll(collection, filter) {
      const all = Array.from(col(collection).values()).map(clone);
      return filter ? all.filter(filter) : all;
    },
    async findOne(collection, filter) {
      for (const doc of col(collection).values()) if (filter(doc)) return clone(doc);
      return null;
    },
    async update(collection, id, patch) {
      const cur = col(collection).get(id);
      if (!cur) return null;
      const next = { ...cur, ...patch, id, updatedAt: new Date().toISOString() };
      col(collection).set(id, next);
      return clone(next);
    },
    async claimStatus(collection, id, expectedStatus, patch) {
      const cur = col(collection).get(id);
      if (!cur || cur.status !== expectedStatus) return null;
      const next = { ...cur, ...patch, id, updatedAt: new Date().toISOString() };
      col(collection).set(id, next);
      return clone(next);
    },
    async remove(collection, id) {
      return col(collection).delete(id);
    },
    async reset() {
      db.clear();
      counters.clear();
      rateLimits.clear();
    },
  };
}

module.exports = { createMemoryStore };
