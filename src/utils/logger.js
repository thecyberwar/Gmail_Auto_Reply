/**
 * =============================================================================
 *  LOGGER (src/utils/logger.js)
 * =============================================================================
 *  Thin wrapper around console with ISO timestamps and severity prefixes:
 *
 *    [2026-10-25T19:08:43.201Z] INFO  Inbox loop STARTED
 *
 *  Levels:
 *    info  -> normal operational events (start, send, poll)
 *    warn  -> recoverable issues (reconnect, template fallback)
 *    error -> failures (poll errors, IMAP errors)
 *    debug -> verbose diagnostics, ONLY printed when DEBUG=true in .env
 *
 *  Why a wrapper: swapping in a file/shipper logger later only requires
 *  changing this one file.
 * =============================================================================
 */

function ts() {
  return new Date().toISOString();
}

module.exports = {
  info: (...a) => console.log(`[${ts()}] INFO `, ...a),
  warn: (...a) => console.warn(`[${ts()}] WARN `, ...a),
  error: (...a) => console.error(`[${ts()}] ERROR`, ...a),
  // Debug output is opt-in to keep production logs clean.
  debug: (...a) => {
    if (process.env.DEBUG === 'true') console.log(`[${ts()}] DEBUG`, ...a);
  },
};
