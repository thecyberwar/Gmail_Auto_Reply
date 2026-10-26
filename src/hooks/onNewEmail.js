/**
 * =============================================================================
 *  HOOK: NEW EMAIL -> AUTO REPLY (src/hooks/onNewEmail.js)
 * =============================================================================
 *  Subscribes to the "email:new" event fired by the inbox loop.
 *
 *  For every new mail it:
 *    1. calls autoReply.service.replyTo(parsedMail)
 *       (which filters, builds and sends the reply)
 *    2. logs the outcome  ->  {"sent":true,...} / {"skipped":"reason",...}
 *    3. returns the result so the loop can update its statistics
 *
 *  Errors are caught here (never re-thrown) so one broken message cannot
 *  stop the polling loop.
 *
 *  EXTENSION POINT: want another automation (forward, label, store)? Register
 *  another listener in register() — they all run for the same event.
 * =============================================================================
 */

const hooks = require('./index');
const logger = require('../utils/logger');
const { replyTo } = require('../services/autoReply.service');

/**
 * Register all "email:new" listeners. Called once from src/index.js at boot.
 */
function register() {
  hooks.on('email:new', async (message) => {
    try {
      const result = await replyTo(message);
      logger.info('email:new ->', message.subject || '(no subject)', '|', JSON.stringify(result));
      return result;
    } catch (err) {
      // Log and swallow: the loop must keep running despite a bad message.
      logger.error('email:new handler failed:', err.message);
      return { error: err.message };
    }
  });
}

module.exports = { register };
