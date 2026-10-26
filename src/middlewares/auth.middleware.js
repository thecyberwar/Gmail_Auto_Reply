/**
 * =============================================================================
 *  API KEY AUTHENTICATION MIDDLEWARE (src/middlewares/auth.middleware.js)
 * =============================================================================
 *  Guards every /api/* route. Clients must send the key in one of:
 *
 *      Header:   x-api-key: <your-api-key>
 *      Query:    ?api_key=<your-api-key>   (fallback for quick browser tests)
 *
 *  Behaviour:
 *    - API_KEY missing on the server -> 503 (misconfiguration, fail closed)
 *    - key absent / mismatched       -> 401
 *    - key matches                   -> next() (request continues)
 *
 *  The key itself lives in .env and is never logged.
 * =============================================================================
 */

const config = require('../config');
const { AppError } = require('../errors');

function apiKeyAuth(req, res, next) {
  // Server-side misconfiguration: refuse everything rather than run open.
  if (!config.apiKey) {
    return next(new AppError('API_KEY is not configured on the server (set it in .env)', 503));
  }

  const key = req.header('x-api-key') || req.query.api_key;
  if (key !== config.apiKey) {
    return next(new AppError('Invalid or missing API key', 401));
  }

  next(); // authenticated — continue to the route handler
}

module.exports = apiKeyAuth;
