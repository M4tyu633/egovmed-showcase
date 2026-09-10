'use strict';
// Vercel routes every request here (see vercel.json rewrites).
// Express apps are (req, res) handlers, so exporting the app works as a serverless function.
const app = require('../src/app');
const { env, bool } = require('../src/config/env');
const { seedDemoData } = require('../src/store');
const logger = require('../src/lib/logger');

// Seed the demo patient + a verified cross-hospital lab on cold start when we're mock-mode-only.
// Idempotent (skips if already present) so replays across cold starts don't stomp on real activity.
// Skipped in true live production unless SEED_ON_START=true is explicitly set.
const shouldSeed = env.globalMode === 'mock' || bool(process.env.SEED_ON_START);
const seedReady = shouldSeed
  ? seedDemoData().catch((err) => { logger.warn('cold-start demo seed failed', { err: err.message }); })
  : Promise.resolve();

module.exports = async (req, res) => {
  await seedReady; // first request waits for seed; subsequent requests are no-op fast
  return app(req, res);
};
