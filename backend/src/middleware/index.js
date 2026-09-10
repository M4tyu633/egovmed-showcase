'use strict';
const { verify } = require('../lib/jwt');
const { AppError, unauthorized, forbidden, badRequest } = require('../lib/errors');
const { env } = require('../config/env');
const logger = require('../lib/logger');
const crypto = require('crypto');

function secureHeaders(_req, res, next) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  if (env.isProd) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
}

function jsonComplexity(req, _res, next) {
  if (req.body === undefined || req.body === null || typeof req.body !== 'object') return next();
  const stack = [{ value: req.body, depth: 0 }];
  let nodes = 0;
  while (stack.length) {
    const { value, depth } = stack.pop();
    nodes += 1;
    if (depth > 32 || nodes > 10_000) return next(badRequest('JSON payload is too complex'));
    for (const [key, child] of Object.entries(value)) {
      if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
        return next(badRequest('Unsafe object key'));
      }
      if (child && typeof child === 'object') stack.push({ value: child, depth: depth + 1 });
    }
  }
  next();
}

// Single implementation, shared with otpService's code check — see lib/crypto.js.
const sameSecret = require('../lib/crypto').timingSafeEqualStr;

/** Attaches req.user from the Bearer session JWT, else 401. Header-only (never from the query string — avoids token leakage into logs). */
function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(unauthorized('Missing session token'));
  try {
    req.user = verify(token);
  } catch (e) {
    return next(e);
  }
  const { getStore, COLLECTIONS } = require('../store');
  getStore().findById(COLLECTIONS.PATIENTS, req.user.sub)
    .then((patient) => {
      if (!patient) return next(unauthorized('Session subject no longer exists'));
      req.patient = patient;
      next();
    })
    .catch(next);
}

/**
 * Gate for operational/admin routes (escalation sweeps, cross-tenant insights).
 * Requires an `x-admin-key` header matching ADMIN_KEY. Denies if ADMIN_KEY is unset.
 */
function requireAdmin(req, _res, next) {
  if (!env.adminKey || !sameSecret(req.headers['x-admin-key'], env.adminKey)) {
    return next(forbidden('Admin access required'));
  }
  next();
}

/** Fixed-window limiter backed by the configured store (shared across serverless instances in KV mode). */
const rateLimit = ({ scope, max, windowMs = 60_000, key = (req) => req.user?.sub || req.ip }) =>
  asyncHandler(async (req, res, next) => {
    const { getStore } = require('../store');
    const rawKey = String(key(req) || 'unknown');
    const digest = crypto.createHash('sha256').update(rawKey).digest('hex').slice(0, 24);
    const bucket = Math.floor(Date.now() / windowMs);
    const result = await getStore().fixedWindowIncrement(`${scope}:${bucket}:${digest}`, windowMs);
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - result.count)));
    res.setHeader('RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)));
    if (result.count > max) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000))));
      throw new AppError('Too many requests', 429, 'rate_limited');
    }
    next();
  });

/** Validates req[source] against a zod schema and replaces it with the parsed value. */
const validate = (schema, source = 'body') => (req, _res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    return next(badRequest('Validation failed', result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))));
  }
  req[source] = result.data;
  next();
};

/** Wrap async handlers so thrown errors reach the error middleware. */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* eslint-disable no-unused-vars */
function errorHandler(err, req, res, _next) {
  const isJsonParseError = err instanceof SyntaxError && err?.type === 'entity.parse.failed';
  const status = err instanceof AppError ? err.status
    : err?.type === 'entity.too.large' ? 413
      : isJsonParseError ? 400
        : 500;
  if (status >= 500) logger.error('unhandled error', { path: req.path, err: err.message, stack: err.stack });
  // Only body-parser-level failures (actual malformed JSON) get the generic message — the raw
  // parser error can leak input snippets. AppError-derived 400s (validation, badRequest, etc.)
  // carry their own developer-authored, already-safe message and should surface it as-is so
  // clients/logs can tell "bad JSON" apart from "bad request for reason X".
  const safeMessage = status === 413 ? 'Request body too large'
    : isJsonParseError ? 'Malformed JSON request body'
      : status >= 500 && env.isProd ? 'Internal server error'
        : err.message;
  res.status(status).json({
    error: {
      code: err.code || 'internal_error',
      message: safeMessage,
      details: status < 500 ? err.details : undefined,
    },
  });
}

function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: 'not_found', message: `No route for ${req.method} ${req.path}` } });
}

module.exports = { secureHeaders, jsonComplexity, rateLimit, requireAuth, requireAdmin, validate, asyncHandler, errorHandler, notFoundHandler };
