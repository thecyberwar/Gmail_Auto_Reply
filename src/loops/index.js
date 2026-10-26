/**
 * =============================================================================
 *  LOOPS INDEX (src/loops/index.js)
 * =============================================================================
 *  Barrel file: everything imports the loop through `require('../loops')`,
 *  which resolves to inboxLoop.js. Keeps the public API of this folder to
 *  a single entry point:  { start, stop, status, runPoll }
 * =============================================================================
 */

module.exports = require('./inboxLoop');
