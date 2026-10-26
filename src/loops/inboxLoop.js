/**
 * =============================================================================
 *  INBOX POLLING LOOP (src/loops/inboxLoop.js)
 * =============================================================================
 *  The heartbeat of the automation. Every POLL_INTERVAL_SECONDS it:
 *
 *    1. Loads persisted state (data/state.json)
 *    2. Lists all UIDs in INBOX via IMAP
 *    3. Selects messages with  uid > baselineUid  (i.e. arrived after start)
 *    4. For each new message:
 *         - downloads + parses it
 *         - skips it if already handled (dedupe by Message-ID)
 *         - emits the "email:new" event -> hook -> auto reply
 *         - records it as handled and flags it as \Seen
 *    5. Advances baselineUid so processed messages are never revisited
 *
 *  FIRST RUN behaviour (START_FROM_NOW=true):
 *    baselineUid is initialised to the highest existing UID, so all
 *    pre-existing mails are ignored and only NEW arrivals get replies.
 *
 *  FAILURE handling:
 *    - Any error during a poll is recorded in stats.lastError and the IMAP
 *      connection is dropped so the next poll reconnects cleanly.
 *    - baselineUid only advances past messages that were fully processed,
 *      so a crash mid-poll never loses messages.
 *
 *  Loop statistics are exposed via status() and served by
 *  GET /api/automation/status.
 * =============================================================================
 */

const config = require('../config');
const logger = require('../utils/logger');
const gmail = require('../services/gmail.service');
const hooks = require('../hooks');
const { loadState, saveState, markHandled } = require('../models/state.model');

// ---------------------------------------------------------------------------
// Runtime flags + counters (module-level so the API can read them)
// ---------------------------------------------------------------------------
let timer = null; // setInterval handle
let running = false; // is the loop supposed to be active?
let busy = false; // is a poll currently executing? (prevents overlap)

const stats = {
  startedAt: null,
  stoppedAt: null,
  polls: 0, // total poll cycles executed
  newProcessed: 0, // new (not previously handled) messages seen
  replied: 0, // replies actually sent
  skipped: 0, // messages filtered out / dry-run
  lastPollAt: null, // ISO timestamp of the last poll start
  lastError: null, // last poll error message (null = healthy)
};

/**
 * Process a single new message: parse, run the hook (auto reply),
 * record it as handled, and flag it as read.
 *
 * @param   {number} uid   message UID to process
 * @param   {Object} state mutable state object (persisted by caller)
 * @returns {Promise<'done'|'replied'>} outcome used by the caller to
 *          decide whether baselineUid may advance past this UID
 */
async function processUid(uid, state) {
  const parsed = await gmail.fetchMessage(uid);
  if (!parsed) return 'done'; // could not download -> treat as processed

  // Already handled in a previous run? Skip without reprocessing.
  if (parsed.messageId && state.handled[parsed.messageId]) return 'done';

  stats.newProcessed++;

  // Fire the "email:new" event. hooks.emit() AWAITS every registered
  // handler, so the reply completes before we record the message.
  const results = await hooks.emit('email:new', parsed);

  // Aggregate handler results into loop statistics.
  for (const r of results || []) {
    if (r && r.sent) stats.replied++;
    else if (r && (r.skipped || r.dryRun)) stats.skipped++;
  }

  // Persist "handled" so a restart never replies to this message twice.
  if (parsed.messageId) markHandled(state, parsed.messageId);

  // Mark as read in Gmail (operator can see the bot processed it).
  try {
    await gmail.markSeen(uid);
  } catch (e) {
    logger.warn('markSeen failed:', e.message); // non-fatal
  }

  return results && results.some((r) => r && r.sent) ? 'replied' : 'done';
}

/**
 * Execute one full poll cycle.
 *
 * State transitions:
 *   state.baselineUid = 0            -> FIRST RUN: initialise baseline
 *   state.baselineUid = highest UID  -> messages newer than this are "new"
 *   baseline advances only past UIDs that were fully processed
 */
async function pollOnce() {
  const state = loadState(config.stateFile);
  const uids = await gmail.listUids();
  if (!Array.isArray(uids) || uids.length === 0) return;

  // ---- First run: set the baseline so old mails are ignored ---------------
  if (!state.baselineUid) {
    if (!config.startFromNow) {
      state.baselineUid = 0; // START_FROM_NOW=false -> reply to ALL mails
    } else {
      state.baselineUid = Math.max(...uids);
      saveState(config.stateFile, state);
      logger.info(
        'First run: baseline UID =',
        state.baselineUid,
        '| old mails ignored, only new messages will be replied to'
      );
      return;
    }
  }

  // ---- Collect messages that arrived after the baseline -------------------
  const fresh = uids.filter((u) => u > state.baselineUid).sort((a, b) => a - b);
  if (!fresh.length) return;

  let lastDone = state.baselineUid; // highest fully-processed UID
  let repliesThisPoll = 0;

  for (const uid of fresh) {
    // Safety cap: never blast too many replies in a single cycle.
    if (repliesThisPoll >= config.maxRepliesPerPoll) break;

    const before = stats.replied;
    const outcome = await processUid(uid, state);
    if (stats.replied > before) repliesThisPoll++;

    if (outcome === 'done' || outcome === 'replied') {
      lastDone = uid; // safe to advance the baseline past this UID
    } else {
      break; // unexpected state — keep baseline (message will be retried)
    }
  }

  // Persist progress so restarts resume exactly where we left off.
  if (lastDone > state.baselineUid) {
    state.baselineUid = lastDone;
  }
  saveState(config.stateFile, state);
}

/**
 * Guarded poll runner: prevents overlapping cycles and captures failures
 * without ever crashing the process.
 */
async function runPoll() {
  if (busy) return; // previous poll still running — skip this tick
  busy = true;
  try {
    stats.polls++;
    stats.lastPollAt = new Date().toISOString();
    await pollOnce();
    stats.lastError = null; // healthy again
  } catch (err) {
    stats.lastError = err.message;
    logger.error('Poll failed:', err.message);
    try {
      // Force a reconnect on the next cycle.
      await gmail.disconnect();
    } catch (e) {
      /* ignore */
    }
  } finally {
    busy = false;
  }
}

/**
 * Start the loop: run one poll immediately, then repeat every interval.
 * Idempotent — calling start() twice has no effect.
 */
function start() {
  if (running) return;
  running = true;
  stats.startedAt = new Date().toISOString();
  logger.info('Inbox loop STARTED — checking every', config.pollIntervalMs / 1000, 'sec');

  runPoll(); // first poll right away (no waiting)
  timer = setInterval(runPoll, config.pollIntervalMs);
  if (timer.unref) timer.unref(); // don't keep the process alive solely for the timer
}

/**
 * Stop the loop (no more polls). Idempotent.
 */
function stop() {
  if (!running) return;
  running = false;
  stats.stoppedAt = new Date().toISOString();
  if (timer) clearInterval(timer);
  timer = null;
  logger.info('Inbox loop STOPPED');
}

/**
 * Snapshot of the loop state — served by GET /api/automation/status.
 * @returns {Object} JSON-serialisable status
 */
function status() {
  return {
    running,
    ...stats,
    pollIntervalSec: config.pollIntervalMs / 1000,
    dryRun: config.dryRun,
  };
}

module.exports = { start, stop, status, runPoll };
