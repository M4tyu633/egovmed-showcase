'use strict';
const jwt = require('jsonwebtoken');
const { env } = require('../config/env');
const { unauthorized } = require('./errors');

function sign(payload) {
  return jwt.sign(payload, env.jwtSecret, {
    algorithm: 'HS256', expiresIn: env.sessionTtl, issuer: 'egovmed', audience: 'egovmed-api',
  });
}

function verify(token) {
  try {
    const payload = jwt.verify(token, env.jwtSecret, {
      algorithms: ['HS256'], issuer: 'egovmed', audience: 'egovmed-api',
    });
    if (!payload || typeof payload.sub !== 'string' || !payload.sub.startsWith('pat_')) {
      throw new Error('invalid subject');
    }
    return payload;
  } catch (e) {
    throw unauthorized('Invalid or expired session token');
  }
}

module.exports = { sign, verify };
