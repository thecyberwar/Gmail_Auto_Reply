/**
 * =============================================================================
 *  CUSTOM ERROR TYPE (src/errors/index.js)
 * =============================================================================
 *  AppError carries an HTTP status code so controllers can simply
 *  `throw new AppError('message', 400)` and the global error middleware
 *  will turn it into:   HTTP 400  { "error": "message" }
 *
 *  Usage:
 *    const { AppError } = require('../errors');
 *    throw new AppError('Valid "to" email required', 400);
 * =============================================================================
 */

class AppError extends Error {
  /**
   * @param {string} message   Human-readable error (sent to the API client)
   * @param {number} statusCode HTTP status code (default 500 = server error)
   */
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    // Keeps `instanceof AppError` working correctly when transpiled.
    this.name = 'AppError';
  }
}

module.exports = { AppError };
