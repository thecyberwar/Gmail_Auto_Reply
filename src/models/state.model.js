/**
 * =============================================================================
 *  STATE MODEL (src/models/state.model.js)
 * =============================================================================
 *  Persistence layer for  data/state.json  — survives restarts so the bot
 *  never replies twice to the same message.
 *
 *  File shape:
 *  {
 *    "baselineUid": 48,                       // messages with uid > this are "new"
 *    "handled": {
 *      "<message-id@example.com>": "2026-10-25T19:15:33.097Z",
 *      ...                                    // when each message was processed
 *    }
 *  }
 *
 *  Write strategy: write to a temp file, then rename (atomic on the same
 *  volume) — a crash can never leave a half-written state file.
 *
 *  Bounded growth: only the most recent MAX_HANDLED entries are kept.
 * =============================================================================
 */

const fs = require('fs');
const path = require('path');

// Maximum number of handled Message-IDs to retain (oldest dropped first).
const MAX_HANDLED = 500;

/**
 * Read the state file from disk.
 *
 * @param   {string} file absolute path to state.json
 * @returns {{baselineUid: number, handled: Object<string,string>}}
 *          Returns a fresh empty state when the file is missing/corrupt.
 */
function loadState(file) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (typeof raw !== 'object' || raw === null) throw new Error('bad shape');
    raw.baselineUid = Number(raw.baselineUid) || 0;
    raw.handled = raw.handled || {};
    return raw;
  } catch (e) {
    // First run or unreadable file — start from a clean slate.
    return { baselineUid: 0, handled: {} };
  }
}

/**
 * Atomically persist the state to disk.
 *
 * @param {string} file  absolute path to state.json
 * @param {Object} state object to serialise
 */
function saveState(file, state) {
  fs.mkdirSync(path.dirname(file), { recursive: true }); // ensure data/ exists
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, file); // atomic replace
}

/**
 * Record that a message has been processed (replied or intentionally skipped).
 * Trims the map to MAX_HANDLED entries, dropping the oldest timestamps first.
 *
 * @param {Object} state       mutable state object
 * @param {string} messageId   RFC 5322 Message-ID of the processed mail
 */
function markHandled(state, messageId) {
  if (!messageId) return;
  state.handled[messageId] = new Date().toISOString();

  const keys = Object.keys(state.handled);
  if (keys.length > MAX_HANDLED) {
    keys
      .sort((a, b) => new Date(state.handled[a]) - new Date(state.handled[b])) // oldest first
      .slice(0, keys.length - MAX_HANDLED)
      .forEach((k) => delete state.handled[k]);
  }
}

module.exports = { loadState, saveState, markHandled };
