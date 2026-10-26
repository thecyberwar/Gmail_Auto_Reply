/**
 * =============================================================================
 *  EVENT BUS / HOOK REGISTRY (src/hooks/index.js)
 * =============================================================================
 *  A tiny publish-subscribe layer decoupling the inbox loop from the
 *  automation logic.
 *
 *  Producers:  loops/inboxLoop.js        emits  "email:new"
 *  Consumers:  hooks/onNewEmail.js       listens -> sends auto reply
 *              (add more listeners for extra automations: forward, label, ...)
 *
 *  Key property: emit() is ASYNC and awaits every listener in registration
 *  order. The loop therefore knows the reply finished before it marks the
 *  message as handled — keeping state consistent even on failures.
 *
 *  Usage:
 *    const hooks = require('./index');
 *    hooks.on('email:new', async (mail) => { ... });
 *    const results = await hooks.emit('email:new', mail);
 * =============================================================================
 */

const { EventEmitter } = require('events');

const bus = new EventEmitter();
bus.setMaxListeners(50); // room for many automation listeners

/**
 * Register a listener for an event.
 * @param {string}   event   event name, e.g. 'email:new'
 * @param {Function} handler async (data) => result
 */
function on(event, handler) {
  bus.on(event, handler);
}

/**
 * Fire an event and AWAIT all listeners sequentially.
 *
 * @param   {string} event event name
 * @param   {*}      data  payload (the parsed mail object for 'email:new')
 * @returns {Promise<Array<*>>} array of listener results, in order
 */
async function emit(event, data) {
  const results = [];
  for (const handler of bus.listeners(event)) {
    results.push(await handler(data));
  }
  return results;
}

module.exports = { bus, on, emit };
