'use strict';
const app = require('./app');
const { env } = require('./config/env');
const logger = require('./lib/logger');
const { seedDemoData } = require('./store');

app.listen(env.port, async () => {
  logger.info(`eGovMed backend listening on http://localhost:${env.port}`, { mode: env.globalMode });
  // Local dev convenience: seed the demo patient + cross-hospital lab into the in-memory store so
  // the app has real data to read (login links to it by egovSub). Not for the serverless entry.
  if (env.store.driver === 'memory' || require('./config/env').bool(process.env.SEED_ON_START)) {
    try {
      await seedDemoData();
      logger.info('demo data seeded on startup');
    } catch (e) {
      logger.warn('startup seed failed', { err: e.message });
    }
  }
});
