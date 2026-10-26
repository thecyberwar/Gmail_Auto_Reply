/**
 * =============================================================================
 *  ENTRY POINT — gmail-auto-reply-backend
 * =============================================================================
 *  Run with:  npm start      (starts API server + inbox polling loop)
 *
 *  Boot sequence:
 *    1. Load & validate environment configuration from .env
 *    2. Register event hooks  (email:new  ->  send auto reply)
 *    3. Start the Express HTTP API server (health + control endpoints)
 *    4. Start the inbox polling loop       (if AUTO_START=true)
 *    5. Register graceful shutdown handlers (SIGINT / SIGTERM)
 *
 *  Architecture overview:
 *
 *    [Gmail INBOX]
 *          ^  (IMAP poll every N seconds)
 *          |
 *      loops/inboxLoop.js  ---- emits "email:new" event ---->  hooks/onNewEmail.js
 *          |                                                        |
 *          |                                                   services/autoReply.service.js
 *          |                                                        |
 *          v                                                        v
 *    models/state.model.js (dedupe)                    services/gmail.service.js (SMTP send)
 * =============================================================================
 */

const config = require('./config');
const logger = require('./utils/logger');
const app = require('./app');
const onNewEmail = require('./hooks/onNewEmail');
const loops = require('./loops');
const gmail = require('./services/gmail.service');

// ---------------------------------------------------------------------------
// STEP 1 — Register the "email:new" hook.
//          The inbox loop fires this event for every newly discovered mail.
//          The hook calls autoReply.service.replyTo() to send the reply.
// ---------------------------------------------------------------------------
onNewEmail.register();

// ---------------------------------------------------------------------------
// STEP 2 — Start the HTTP API server.
//          Routes exposed by app.js:
//            GET  /health                    -> liveness probe (no auth)
//            GET  /api/automation/status     -> loop stats   (API key)
//            POST /api/automation/start      -> start loop   (API key)
//            POST /api/automation/stop       -> stop loop    (API key)
//            POST /api/mail/send             -> send a mail  (API key)
// ---------------------------------------------------------------------------
const server = app.listen(config.port, () => {
  logger.info('API listening -> http://localhost:' + config.port);
  logger.info('Health check  -> GET  /health');
  logger.info('Status        -> GET  /api/automation/status (x-api-key header)');
});

// ---------------------------------------------------------------------------
// STEP 3 — Auto-start the polling loop (configurable via AUTO_START in .env).
//          If disabled, the operator can start it at runtime via the API.
// ---------------------------------------------------------------------------
if (config.autoStart) {
  loops.start();
} else {
  logger.info('AUTO_START=false — start manually: POST /api/automation/start');
}

if (config.dryRun) {
  logger.warn('DRY_RUN=true — replies will only be logged, NOT sent');
}

// ---------------------------------------------------------------------------
// STEP 4 — Graceful shutdown.
//          Stop the loop first (no new polls), close the HTTP server,
//          logout of IMAP, then exit. Hard-exit after 5s as a safety net.
// ---------------------------------------------------------------------------
function shutdown(signal) {
  logger.info(signal + ' received — shutting down...');
  loops.stop();

  server.close(async () => {
    await gmail.disconnect().catch(() => {});
    process.exit(0);
  });

  // Safety timeout: force exit if something hangs during cleanup.
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));   // Ctrl+C
process.on('SIGTERM', () => shutdown('SIGTERM')); // deploy/kill signal
