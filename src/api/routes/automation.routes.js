/**
 * =============================================================================
 *  AUTOMATION ROUTES (src/api/routes/automation.routes.js)
 * =============================================================================
 *  Exposes runtime control of the inbox polling loop.
 *
 *  Method  Path                       Body  Description
 *  ------  --------------------------  ----  -------------------------------
 *  GET     /api/automation/status      -     Loop statistics (running?, polls,
 *                                             replied, lastError, ...)
 *  POST    /api/automation/start       -     Start the loop (no-op if running)
 *  POST    /api/automation/stop        -     Stop the loop  (no-op if stopped)
 *
 *  Authentication: every route passes through auth.middleware (x-api-key).
 *  Handlers live in controllers/automation.controller.js.
 * =============================================================================
 */

const router = require('express').Router();
const auth = require('../../middlewares/auth.middleware');
const ctrl = require('../../controllers/automation.controller');

router.get('/status', auth, ctrl.status); // read-only status snapshot
router.post('/start', auth, ctrl.start); // loops.start()
router.post('/stop', auth, ctrl.stop); // loops.stop()

module.exports = router;
