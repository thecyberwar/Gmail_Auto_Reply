/**
 * =============================================================================
 *  TEMPLATE SERVICE (src/services/template.service.js)
 * =============================================================================
 *  Renders the HTML body of the auto reply.
 *
 *  Templates live in  <project-root>/templates/<name>.html  and use
 *  simple {{PLACEHOLDER}} tokens which are replaced at send time.
 *
 *  Available placeholders:
 *    {{SENDER_NAME}}   original sender's display name
 *    {{SUBJECT}}       original message subject
 *    {{MESSAGE_HTML}}  the configured reply message, HTML-escaped + paragraphed
 *    {{APP_NAME}}      bot name (APP_NAME in .env)
 *    {{APP_INITIALS}}  first letters of the app name (logo box in the template)
 *    {{DATE}}          current date, e.g. "26 Oct 2026"
 *    {{YEAR}}          current year
 *
 *  Selected template: AUTO_REPLY_TEMPLATE in .env (default: premiumReply).
 *
 *  Security: every dynamic value is passed through escapeHtml() before being
 *  injected, so a malicious subject line cannot inject markup/scripts.
 * =============================================================================
 */

const fs = require('fs');
const path = require('path');

// Absolute path to the templates directory (project root / templates).
const TEMPLATES_DIR = path.join(__dirname, '..', '..', 'templates');

// Which template to use when AUTO_REPLY_TEMPLATE is not set.
const DEFAULT_TEMPLATE = () => process.env.AUTO_REPLY_TEMPLATE || 'premiumReply';

/**
 * Escape characters that are dangerous inside HTML.
 * Prevents subject/sender names from breaking the markup or injecting code.
 *
 * @param   {*} str raw value
 * @returns {string} HTML-safe string
 */
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Load templates/<name>.html and replace every {{KEY}} with vars[KEY].
 *
 * @param   {string} name template file name without extension
 * @param   {Object} vars placeholder values
 * @returns {string} rendered HTML
 * @throws  {Error} when the template file does not exist (caller falls back)
 */
function renderTemplate(name, vars = {}) {
  const filePath = path.join(TEMPLATES_DIR, `${name}.html`);
  let html = fs.readFileSync(filePath, 'utf8');
  for (const [key, value] of Object.entries(vars)) {
    // split/join = split-safe global replace (no regex escaping needed).
    html = html.split(`{{${key}}}`).join(String(value ?? ''));
  }
  return html;
}

/**
 * Derive initials from an app name — "My App" -> "MA".
 * Used for the logo box in the template header.
 *
 * @param   {string} appName
 * @returns {string} 1-2 uppercase letters
 */
function getInitials(appName) {
  return String(appName || 'AR')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2) // max 2 words
    .map((w) => w[0].toUpperCase())
    .join('');
}

/**
 * Build the final HTML body for an auto reply.
 *
 * The plain-text message from .env is converted to HTML paragraphs:
 *   - the whole message is HTML-escaped first
 *   - double newlines become separate <p> blocks
 *   - single newlines become <br>
 *
 * @param   {Object}  opts
 * @param   {string}  opts.senderName original sender's display name
 * @param   {string}  opts.subject    original subject
 * @param   {string}  opts.message    plain-text reply body (from .env)
 * @param   {string}  opts.appName    bot name
 * @param   {string}  opts.date       formatted current date
 * @param   {string} [opts.template]  override template name
 * @returns {string} rendered HTML document
 */
function buildAutoReplyHtml({ senderName, subject, message, appName, date, template }) {
  const messageHtml = escapeHtml(message)
    .trim()
    .split(/\n{2,}/) // split on blank lines -> paragraphs
    .map((para) => `<p style="margin:0 0 14px 0;">${para.replace(/\n/g, '<br>')}</p>`)
    .join('');

  return renderTemplate(template || DEFAULT_TEMPLATE(), {
    SENDER_NAME: escapeHtml(senderName || 'there'),
    SUBJECT: escapeHtml(subject || '(no subject)'),
    MESSAGE_HTML: messageHtml,
    APP_NAME: escapeHtml(appName || 'Auto Reply'),
    APP_INITIALS: escapeHtml(getInitials(appName)),
    DATE: escapeHtml(date || ''),
    YEAR: new Date().getFullYear(),
  });
}

/**
 * Plain-text alternative of the same reply (sent as the `text` part so
 * text-only clients and screen readers still get a readable message).
 *
 * @param   {Object} opts
 * @param   {string} opts.senderName
 * @param   {string} opts.message
 * @param   {string} opts.appName
 * @returns {string}
 */
function buildAutoReplyText({ senderName, message, appName }) {
  return [
    `Hi ${senderName || 'there'},`,
    '',
    message || 'Thanks for your email!',
    '',
    'Regards,',
    appName || 'Auto Reply',
  ].join('\n');
}

/**
 * List all available template names (files inside templates/).
 * Useful for choosing AUTO_REPLY_TEMPLATE in .env.
 *
 * @returns {string[]} e.g. ['premiumReply', 'autoReply']
 */
function listTemplates() {
  return fs
    .readdirSync(TEMPLATES_DIR)
    .filter((f) => f.endsWith('.html'))
    .map((f) => f.replace(/\.html$/, ''));
}

module.exports = {
  buildAutoReplyHtml,
  buildAutoReplyText,
  renderTemplate,
  escapeHtml,
  listTemplates,
};
