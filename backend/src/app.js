'use strict';
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { env, warnIfMisconfigured } = require('./config/env');
const logger = require('./lib/logger');
const routes = require('./routes');
const { secureHeaders, jsonComplexity, rateLimit, errorHandler, notFoundHandler } = require('./middleware');

warnIfMisconfigured(logger);

const app = express();
app.disable('x-powered-by');
// Vercel terminates TLS at its edge and forwards the real client in X-Forwarded-For. Trust
// exactly one hop so req.ip resolves to the citizen's address (not the proxy's) — every per-user
// and per-IP rate limit, and the PHI-access/consent audit trail, otherwise records the same
// internal address for every request. A larger value would let a client spoof its own IP by
// prepending entries to the header.
app.set('trust proxy', 1);
app.use(secureHeaders);

// Never pair a reflected/wildcard origin with credentials (that lets any site make credentialed calls).
const corsOrigin = env.appUrl === '*' ? true : env.appUrl.split(',').map((s) => s.trim());
app.use(cors({ origin: corsOrigin, credentials: corsOrigin !== true }));
app.use(express.json({ limit: '256kb', strict: true }));
app.use(jsonComplexity);
if (!env.isProd) {
  morgan.token('safe-url', (req) => String(req.originalUrl || req.url).split('?')[0]);
  app.use(morgan(':method :safe-url :status :response-time ms - :res[content-length]'));
}

// Broad abuse ceiling; sensitive/costly routes apply tighter limits below.
app.use(rateLimit({ scope: 'api', max: 300, windowMs: 60_000 }));

app.use('/', routes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
