/**
 * =============================================================================
 *  CONFIGURATION LOADER (src/config/index.js)
 * =============================================================================
 *  Single source of truth for all runtime settings.
 *  Reads process.env (populated by dotenv from the project-root .env file),
 *  validates required values, applies defaults, and exports a frozen-ish
 *  plain object consumed by every other module.
 *
 *  Required env vars (server exits if missing):
 *    GMAIL_USER          - Gmail address to monitor
 *    GMAIL_APP_PASSWORD  - 16-char Google App Password (spaces are stripped)
 *
 *  Everything else has a safe default (see below).
 * =============================================================================
 */

const path = require('path');
require('dotenv').config(); // loads .env into process.env (project root)

// ---------------------------------------------------------------------------
// Small parsing helpers
// ---------------------------------------------------------------------------

/** Parse a positive number; falls back to `def` when missing/invalid. */
function num(name, def) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : def;
}

/** Parse a boolean flag. Accepts: 1/true/yes/on (case-insensitive). */
function bool(name, def) {
  const v = process.env[name];
  if (v === undefined || v === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(String(v).trim().toLowerCase());
}

/** Parse a comma-separated list -> trimmed, lowercased, empty items dropped. */
function list(name) {
  return (process.env[name] || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Gmail credentials — required, fail fast with a clear message.
// ---------------------------------------------------------------------------
const email = (process.env.GMAIL_USER || '').trim();
// Google App Passwords are displayed as "abcd efgh ..." — the spaces are
// cosmetic, so we strip them before using the value for IMAP/SMTP auth.
const password = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');

const missing = [];
if (!email) missing.push('GMAIL_USER');
if (!password) missing.push('GMAIL_APP_PASSWORD');
if (missing.length) {
  console.error('[config] Missing required env vars: ' + missing.join(', '));
  console.error('[config] Copy .env.example to .env and fill in the values.');
  process.exit(1); // abort boot — nothing can work without credentials
}

// ---------------------------------------------------------------------------
// Central config object — import this instead of reading process.env directly.
// ---------------------------------------------------------------------------
const config = {
  // --- Gmail credentials -----------------------------------------------------
  email,
  password,

  // --- HTTP API server -------------------------------------------------------
  port: num('PORT', 3000),        // API listen port
  apiKey: (process.env.API_KEY || '').trim(), // required for all /api routes

  // --- Automation behaviour --------------------------------------------------
  autoStart: bool('AUTO_START', true), // start polling loop on boot?
  pollIntervalMs: num('POLL_INTERVAL_SECONDS', 45) * 1000, // inbox check cadence
  startFromNow: bool('START_FROM_NOW', true), // ignore pre-existing mails on first run?
  allowSenders: list('REPLY_TO_SENDERS'), // sender allowlist; empty = reply to everyone
  maxRepliesPerPoll: num('MAX_REPLIES_PER_POLL', 10), // safety cap per poll cycle
  dryRun: bool('DRY_RUN', false), // log replies instead of sending them

  // --- Auto reply content ----------------------------------------------------
  appName: (process.env.APP_NAME || 'Auto Reply').trim(), // shown in template header
  replySubject: (process.env.AUTO_REPLY_SUBJECT || 'Auto Reply').trim(),
  replyMessage: (
    process.env.AUTO_REPLY_MESSAGE ||
    'Thanks for your email! I have received your message and will get back to you soon.'
  ).trim(),

  // --- Persistent state ------------------------------------------------------
  // data/state.json records which messages were already handled so the bot
  // never replies twice to the same email (survives restarts).
  stateFile: path.join(__dirname, '..', '..', 'data', 'state.json'),
};

module.exports = config;
