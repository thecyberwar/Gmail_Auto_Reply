/**
 * =============================================================================
 *  EXPRESS APPLICATION (src/app.js)
 * =============================================================================
 *  Assembles the HTTP layer:
 *
 *    1. express.json()        -> parses JSON request bodies
 *    2. GET  /health          -> public liveness probe (load balancers, uptime)
 *    3. /api/*                -> protected routes (mounted from api/routes)
 *    4. 404 handler           -> any unmatched URL -> AppError(404)
 *    5. errorHandler          -> converts thrown errors -> JSON error response
 *
 *  NOTE: This file never talks to Gmail directly. Business logic lives in
 *        controllers -> services.
 * =============================================================================
 */

const express = require('express');
const routes = require('./api/routes');
const errorHandler = require('./middlewares/error.middleware');
const { AppError } = require('./errors');

const app = express();

// Parse incoming JSON payloads (limit 1mb to avoid abuse).
app.use(express.json({ limit: '1mb' }));

// ---------------------------------------------------------------------------
// Public health check — used by hosting platforms / monitoring.
// Deliberately requires NO authentication.
// ---------------------------------------------------------------------------
app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'gmail-auto-reply-backend', time: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// Protected API surface. Every route under /api enforces the API key
// via middlewares/auth.middleware.js (except /health which is above).
// ---------------------------------------------------------------------------
app.use('/api', routes);

// ---------------------------------------------------------------------------
// Catch-all for unknown routes -> forwards a 404 AppError to the error
// handler below so all failures share one response shape:
//   { "error": "<message>" }
// ---------------------------------------------------------------------------
app.use((req, res, next) => {
  next(new AppError('Not Found: ' + req.originalUrl, 404));
});

// Global error handler — MUST be registered last and keep the 4-arg signature.
app.use(errorHandler);

module.exports = app;
