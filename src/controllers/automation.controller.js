/**
 * =============================================================================
 *  AUTOMATION CONTROLLER (src/controllers/automation.controller.js)
 * =============================================================================
 *  Thin HTTP layer over the polling loop. Each handler translates an API
 *  request into a loop operation and returns a JSON snapshot.
 *
 *  Routes wired to these handlers (see api/routes/automation.routes.js):
 *    GET  /api/automation/status  ->  status()
 *    POST /api/automation/start   ->  start()
 *    POST /api/automation/stop    ->  stop()
 *
 *  All handlers are synchronous — the loop is in-process, so no awaits here.
 * =============================================================================
 */

const loops = require('../loops');

/**
 * GET /api/automation/status
 * Returns loop health + counters, e.g.:
 *   { running: true, polls: 12, replied: 1, lastError: null, ... }
 */
exports.status = (req, res) => {
  res.json(loops.status());
};

/**
 * POST /api/automation/start
 * Starts the polling loop (idempotent) and returns the fresh status.
 */
exports.start = (req, res) => {
  loops.start();
  res.json({ ok: true, ...loops.status() });
};

/**
 * POST /api/automation/stop
 * Stops the polling loop (idempotent) and returns the fresh status.
 */
exports.stop = (req, res) => {
  loops.stop();
  res.json({ ok: true, ...loops.status() });
};
