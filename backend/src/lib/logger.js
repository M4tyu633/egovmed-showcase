'use strict';

const levels = { error: 0, warn: 1, info: 2, debug: 3 };
const threshold = levels[(process.env.LOG_LEVEL || 'info').toLowerCase()] ?? levels.info;

function emit(level, msg, meta) {
  if (levels[level] > threshold) return;
  const line = { t: new Date().toISOString(), level, msg };
  if (meta && Object.keys(meta).length) line.meta = meta;
  const out = level === 'error' || level === 'warn' ? console.error : console.log;
  out(JSON.stringify(line));
}

const logger = {
  error: (msg, meta) => emit('error', msg, meta),
  warn: (msg, meta) => emit('warn', msg, meta),
  info: (msg, meta) => emit('info', msg, meta),
  debug: (msg, meta) => emit('debug', msg, meta),
};

module.exports = logger;
