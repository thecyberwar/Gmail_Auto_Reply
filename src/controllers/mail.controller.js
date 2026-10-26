/**
 * =============================================================================
 *  MAIL CONTROLLER (src/controllers/mail.controller.js)
 * =============================================================================
 *  Handles outbound mail requests.
 *
 *  POST /api/mail/send   body: { to, subject, text }
 *    1. validateSendBody()  -> throws AppError(400) on bad input
 *    2. gmail.sendMail()    -> SMTP send using the configured credentials
 *    3. responds            -> { ok: true, messageId, to }
 *
 *  Errors thrown anywhere in the chain are forwarded to the global error
 *  middleware via next(err).
 * =============================================================================
 */

const gmail = require('../services/gmail.service');
const { AppError } = require('../errors');
const { validateSendBody } = require('../validators/mail.validator');

/**
 * POST /api/mail/send
 *
 * @param {Object} req   body: { to, subject?, text }
 * @param {Object} res   { ok, messageId, to }
 * @param {Function} next forward errors to the error middleware
 */
exports.send = async (req, res, next) => {
  try {
    // 1. Validate + normalise the request body (throws AppError on failure).
    const data = validateSendBody(req.body);

    // 2. Send through SMTP (gmail.service).
    const info = await gmail.sendMail(data);

    // 3. Acknowledge with Gmail's message id for traceability.
    res.json({ ok: true, messageId: info.messageId, to: data.to });
  } catch (err) {
    next(err); // -> global error handler
  }
};
