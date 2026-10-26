/**
 * =============================================================================
 *  GMAIL SERVICE (src/services/gmail.service.js)
 * =============================================================================
 *  The ONLY module that talks to Gmail servers.
 *
 *    IMAP (imapflow)      -> read inbox, fetch messages, set \Seen flag
 *    SMTP (nodemailer)    -> send mail (auto replies + manual /api/mail/send)
 *
 *  Connection strategy:
 *    - The IMAP client is created lazily and reused across polls.
 *      `imap.usable` tells us whether the existing socket is still alive;
 *      if not, the next call reconnects automatically.
 *    - Mailbox operations run inside `getMailboxLock('INBOX')` so two
 *      operations can never race on the same mailbox selection.
 *
 *  Public API used by the rest of the app:
 *    listUids()            -> number[]  all message UIDs in INBOX (ascending)
 *    fetchMessage(uid)     -> parsed mailparser object for one UID
 *    markSeen(uid)         -> flag message as read
 *    sendMail({ ... })     -> SMTP send, returns nodemailer info object
 *    disconnect()          -> logout (used on shutdown / after errors)
 * =============================================================================
 */

const { ImapFlow } = require('imapflow'); // modern IMAP client
const nodemailer = require('nodemailer'); // SMTP sending
const { simpleParser } = require('mailparser'); // raw RFC822 -> JS object
const config = require('../config');
const logger = require('../utils/logger');

// Module-level singletons — created on first use, reused afterwards.
let imap = null;
let smtp = null;

/**
 * Return a connected IMAP client (reconnecting when the old one died).
 *
 * @returns {Promise<ImapFlow>} live IMAP connection
 * @throws  {Error} when authentication (App Password) fails
 */
async function getImap() {
  // Reuse the existing connection when it is still usable.
  if (imap && imap.usable) return imap;

  imap = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true, // implicit TLS (port 993)
    auth: { user: config.email, pass: config.password },
    logger: false, // we use our own logger
    tls: { minVersion: 'TLSv1.2' },
  });

  // Surface async IMAP errors instead of crashing the process.
  imap.on('error', (err) => logger.error('IMAP error:', err.message));
  imap.on('close', () => logger.warn('IMAP connection closed'));

  await imap.connect();
  logger.info('IMAP connected:', config.email);
  return imap;
}

/**
 * Return the SMTP transport (lazily created).
 * Gmail SMTP: smtp.gmail.com:465 with implicit TLS.
 *
 * @returns {import('nodemailer').Transporter}
 */
function getSmtp() {
  if (!smtp) {
    smtp = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: config.email, pass: config.password },
    });
  }
  return smtp;
}

/**
 * Run `fn(client)` while holding the INBOX mailbox lock.
 * The lock guarantees exclusive access to the selected mailbox and is
 * ALWAYS released, even when `fn` throws.
 *
 * @template T
 * @param {(client: ImapFlow) => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function withInbox(fn) {
  const client = await getImap();
  const lock = await client.getMailboxLock('INBOX');
  try {
    return await fn(client);
  } finally {
    lock.release();
  }
}

/**
 * Fetch every UID currently in INBOX (ascending order).
 * Used by the loop to find messages newer than the stored baseline UID.
 *
 * @returns {Promise<number[]>}
 */
async function listUids() {
  return withInbox((client) => client.search({}, { uid: true })); // {} = ALL
}

/**
 * Download one message and parse it into a structured object.
 *
 * @param   {number} uid IMAP UID of the message
 * @returns {Promise<object|null>} mailparser result:
 *   { uid, subject, from, to, messageId, inReplyTo, references, headers, text, ... }
 *   Returns null when the message could not be fetched.
 */
async function fetchMessage(uid) {
  return withInbox(async (client) => {
    // uid:true => first argument is a UID, not a sequence number.
    const msg = await client.fetchOne(
      uid,
      { uid: true, flags: true, source: true }, // source = full raw message
      { uid: true }
    );
    if (!msg || !msg.source) return null;

    const parsed = await simpleParser(msg.source); // raw bytes -> JS object
    parsed.uid = uid; // attach UID for the loop's bookkeeping
    return parsed;
  });
}

/**
 * Mark a message as read (\Seen) so Gmail stops showing it as unread
 * and operators can see the bot already processed it.
 *
 * @param {number} uid
 */
async function markSeen(uid) {
  return withInbox((client) => client.messageFlagsAdd(uid, ['\\Seen'], { uid: true }));
}

/**
 * Send an email over SMTP.
 *
 * @param {Object}  opts
 * @param {string}  opts.to          recipient address
 * @param {string}  opts.subject     subject line (auto "Re: ..." from caller)
 * @param {string}  opts.text        plain-text body (fallback for clients w/o HTML)
 * @param {string} [opts.html]       HTML body (template output, optional)
 * @param {string} [opts.inReplyTo]  original Message-ID -> threads the reply
 * @param {string} [opts.references] original References chain -> Gmail threading
 * @returns {Promise<import('nodemailer').SentMessageInfo>}
 */
async function sendMail({ to, subject, text, html, inReplyTo, references }) {
  const info = await getSmtp().sendMail({
    from: `"${config.appName}" <${config.email}>`,
    to,
    subject,
    text,
    html,
    inReplyTo, // makes the reply appear inside the same Gmail conversation
    references,
    // Tells other auto-responders "this is automated" — helps break reply loops.
    headers: { 'X-Auto-Response-Suppress': 'All' },
  });
  logger.info('Mail sent ->', to, '|', info.messageId);
  return info;
}

/**
 * Logout of IMAP and drop the client so the next call reconnects.
 * Called during shutdown and after poll failures.
 */
async function disconnect() {
  if (imap) {
    try {
      await imap.logout();
    } catch (e) {
      /* connection already dead — nothing to do */
    }
    imap = null;
  }
}

module.exports = { listUids, fetchMessage, markSeen, sendMail, disconnect };
