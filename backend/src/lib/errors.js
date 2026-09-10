'use strict';

class AppError extends Error {
  constructor(message, status = 500, code = 'internal_error', details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const badRequest = (m, d) => new AppError(m || 'Bad request', 400, 'bad_request', d);
const unauthorized = (m) => new AppError(m || 'Unauthorized', 401, 'unauthorized');
const forbidden = (m) => new AppError(m || 'Forbidden', 403, 'forbidden');
const notFound = (m) => new AppError(m || 'Not found', 404, 'not_found');
const conflict = (m) => new AppError(m || 'Conflict', 409, 'conflict');
const upstream = (m, d) => new AppError(m || 'Upstream service error', 502, 'upstream_error', d);

module.exports = { AppError, badRequest, unauthorized, forbidden, notFound, conflict, upstream };
