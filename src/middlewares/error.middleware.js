/**
 * =============================================================================
 *  GLOBAL ERROR MIDDLEWARE (src/middlewares/error.middleware.js)
 * =============================================================================
 *  Terminal handler for every error in the request pipeline.
 *  Express detects it by its 4-argument signature and by being registered
 *  LAST in app.js.
 *
 *  Any handler can simply  throw new AppError('msg', 400)  (or call
 *  next(err)) and this middleware formats the response:
 *
 *      HTTP <statusCode>   { "error": "<message>" }
 *
 *  - 4xx errors (client mistakes) are logged as warnings
 *  - 5xx errors (server faults) are logged with their full stack trace
 * =============================================================================
 */

const logger = require('../utils/logger');

function errorHandler(err, req, res, next) {
  const status = err.statusCode || 500;

  if (status >= 500) logger.error(err.stack || err.message);
  else logger.warn(status + ' — ' + err.message);

  res.status(status).json({ error: err.message || 'Internal Server Error' });
}

module.exports = errorHandler;
