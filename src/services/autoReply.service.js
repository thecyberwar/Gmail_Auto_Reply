/**
 * =============================================================================
 *  AUTO-REPLY SERVICE (src/services/autoReply.service.js)
 * =============================================================================
 *  Decides WHETHER to reply to an incoming mail and HOW the reply looks.
 *
 *  Flow:  hooks/onNewEmail.js  ->  replyTo(parsedMail)
 *                                    |
 *                                    +--> shouldReply()  filter / loop guard
 *                                    +--> buildReply()   subject, threading, HTML
 *                                    +--> gmail.sendMail()  actually send
 *
 *  Loop-prevention rules (a message is SKIPPED when any matches):
 *    1. Sender == ourselves            (our own outgoing/test mail)
 *    2. Auto-Submitted header != "no"  (another bot's automatic reply)
 *    3. X-Auto-Response-Suppress set   (explicit "don't respond")
 *    4. Precedence: bulk/junk/list     (bulk or list traffic)
 *    5. List-Id header present         (mailing list)
 *    6. Sender not in REPLY_TO_SENDERS allowlist (when allowlist is configured)
 * =============================================================================
 */

const config = require('../config');
const logger = require('../utils/logger');
const gmail = require('./gmail.service');
const templateService = require('./template.service');

/**
 * Extract the first email address from a mailparser mailbox object.
 * @param   {Object|null} mailbox  parsed.from / parsed.to
 * @returns {string|null} lowercased address, e.g. "someone@example.com"
 */
function firstAddress(mailbox) {
  if (!mailbox) return null;
  const values = Array.isArray(mailbox.value) ? mailbox.value : [];
  const addr = values[0] && values[0].address;
  return addr ? String(addr).toLowerCase() : null;
}

/**
 * Read a header value from the parsed message (case-insensitive lookup).
 * @param   {Object} parsed mailparser object
 * @param   {string} name    header name, e.g. 'auto-submitted'
 * @returns {string} trimmed + lowercased value, or '' when absent
 */
function header(parsed, name) {
  const v = parsed.headers && parsed.headers.get(name);
  return v ? String(v).trim().toLowerCase() : '';
}

/**
 * mailparser gives References as either a string or an array of Message-IDs.
 * Normalize both into a single space-separated string.
 */
function asText(refs) {
  if (!refs) return '';
  if (Array.isArray(refs)) return refs.join(' ').replace(/\s+/g, ' ').trim();
  return String(refs).replace(/\s+/g, ' ').trim();
}

/**
 * Decide whether an incoming message deserves an auto reply.
 *
 * @param   {Object} parsed  mailparser message object
 * @returns {{from?: string, skip?: string}}
 *          { from }            -> proceed with replying
 *          { skip: 'reason' }  -> do not reply (reason logged by caller)
 */
function shouldReply(parsed) {
  const from = firstAddress(parsed.from);
  if (!from) return { skip: 'no sender' };

  // Never reply to ourselves (Sent folder / self-tests) — prevents loops.
  if (from === config.email.toLowerCase()) return { skip: 'own message' };

  // Another automated system sent this — replying would ping-pong forever.
  const autoSubmitted = header(parsed, 'auto-submitted');
  if (autoSubmitted && autoSubmitted !== 'no') return { skip: 'auto-submitted header' };

  // Microsoft-style suppression header: "do not reply to this message".
  if (
    header(parsed, 'x-auto-response-suppress') &&
    header(parsed, 'x-auto-response-suppress') !== 'none'
  ) {
    return { skip: 'auto-response-suppress' };
  }

  // Precedence marks bulk/marketing/list mail — auto replies are unwanted.
  const precedence = header(parsed, 'precedence');
  if (['bulk', 'junk', 'list'].includes(precedence)) return { skip: 'precedence: ' + precedence };

  // Mailing lists (List-Id) — replying reaches the whole list.
  if (header(parsed, 'list-id')) return { skip: 'mailing list' };

  // Optional allowlist: when REPLY_TO_SENDERS is set, only those senders match.
  if (config.allowSenders.length && !config.allowSenders.includes(from)) {
    return { skip: 'sender not in allowlist' };
  }

  return { from };
}

/**
 * Render the HTML body from a template; fall back to null (plain text only)
 * when the template file is missing or malformed.
 *
 * @param   {Object} parsed     mailparser message
 * @param   {string} senderName display name of the original sender
 * @param   {string} origSubject original subject (without adding "Re:" again)
 * @returns {string|null}
 */
function buildHtml(parsed, senderName, origSubject) {
  try {
    return templateService.buildAutoReplyHtml({
      senderName,
      subject: origSubject,
      message: config.replyMessage,
      appName: config.appName,
      date: new Date().toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
    });
  } catch (err) {
    // Template failure must never block the reply — degrade to plain text.
    logger.warn('Template render failed, falling back to plain text:', err.message);
    return null;
  }
}

/**
 * Construct the full reply payload for an incoming message.
 *
 * Produces:
 *   subject     -> "Re: <original subject>" (kept when already a reply)
 *   text        -> plain-text body (always sent as MIME alternative)
 *   html        -> template-rendered body (optional)
 *   inReplyTo   -> original Message-ID  (Gmail shows it in same conversation)
 *   references  -> original references chain + Message-ID
 *
 * @param   {Object} parsed original message
 * @param   {string} to     recipient (original sender)
 * @returns {Object} payload accepted by gmail.sendMail()
 */
function buildReply(parsed, to) {
  const origSubject = parsed.subject || '(no subject)';
  // Avoid "Re: Re: ..." when the incoming subject is already a reply.
  const subject = /^re:/i.test(origSubject) ? origSubject : 'Re: ' + origSubject;

  // Build the References chain required for proper email threading.
  const refs = [asText(parsed.references), asText(parsed.inReplyTo), asText(parsed.messageId)]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Sender's display name (used to personalize the template).
  const senderName =
    (parsed.from && parsed.from.value && parsed.from.value[0] && parsed.from.value[0].name) || '';

  return {
    to,
    subject,
    text: config.replyMessage,
    html: buildHtml(parsed, senderName, origSubject),
    inReplyTo: asText(parsed.messageId) || undefined,
    references: refs || undefined,
  };
}

/**
 * Main entry point — called by the "email:new" hook for every new message.
 *
 * @param   {Object} parsed mailparser message
 * @returns {Promise<Object>} result consumed by loop statistics:
 *   { sent: true, to }        reply delivered
 *   { dryRun: true, to }      DRY_RUN enabled — only logged
 *   { skipped: 'reason' }     filtered out (see shouldReply)
 */
async function replyTo(parsed) {
  const check = shouldReply(parsed);
  if (check.skip) {
    logger.debug('Skip [' + check.skip + ']:', parsed.subject);
    return { skipped: check.skip };
  }

  const mail = buildReply(parsed, check.from);

  // Dry-run mode: validate the pipeline without sending anything.
  if (config.dryRun) {
    logger.info('[DRY RUN] Reply would go ->', mail.to, '|', mail.subject);
    return { dryRun: true, to: mail.to };
  }

  await gmail.sendMail(mail);
  return { sent: true, to: mail.to };
}

module.exports = { replyTo, shouldReply, buildReply };
