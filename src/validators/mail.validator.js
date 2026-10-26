/**
 * =============================================================================
 *  MAIL VALIDATOR (src/validators/mail.validator.js)
 * =============================================================================
 *  Validates and normalises the body of POST /api/mail/send.
 *
 *  Expected JSON:
 *    {
 *      "to":      "someone@example.com",   (required, valid address)
 *      "subject": "Hello",                 (optional, defaults to "Test mail")
 *      "text":    "Message body"           (required, non-empty)
 *    }
 *
 *  On failure an AppError(400) is thrown, which the global error middleware
 *  converts into:   HTTP 400  { "error": "..." }
 * =============================================================================
 */

const { AppError } = require('../errors');

// Simple but effective address check: something@something.tld (min 2-char TLD).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Validate the request body for sending mail.
 *
 * @param   {Object} body raw req.body
 * @returns {{to: string, subject: string, text: string}} normalised payload
 * @throws  {AppError} 400 when a field is missing or malformed
 */
function validateSendBody(body) {
  const { to, subject, text } = body || {};

  if (!to || !EMAIL_RE.test(String(to).trim())) {
    throw new AppError('Valid "to" email required', 400);
  }
  if (!text || !String(text).trim()) {
    throw new AppError('"text" body required', 400);
  }

  return {
    to: String(to).trim(),
    subject: subject ? String(subject).trim() : 'Test mail',
    text: String(text),
  };
}

module.exports = { validateSendBody };
