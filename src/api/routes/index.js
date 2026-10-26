/**
 * =============================================================================
 *  ROUTES INDEX (src/api/routes/index.js)
 * =============================================================================
 *  Mounts every API router under /api.
 *
 *  Endpoint map (all require header:  x-api-key: <API_KEY>):
 *    GET   /api/automation/status   -> loop statistics
 *    POST  /api/automation/start    -> start the polling loop
 *    POST  /api/automation/stop     -> stop the polling loop
 *    POST  /api/mail/send           -> send an arbitrary email via SMTP
 *
 *  Note: GET /health is registered directly in app.js (no auth needed).
 * =============================================================================
 */

const router = require('express').Router();

// /api/automation/* -> loop control endpoints
router.use('/automation', require('./automation.routes'));

// /api/mail/* -> outbound mail endpoints
router.use('/mail', require('./mail.routes'));

module.exports = router;
