/**
 * =============================================================================
 *  MAIL ROUTES (src/api/routes/mail.routes.js)
 * =============================================================================
 *  Outbound mail endpoints (handy for testing the SMTP credentials).
 *
 *  Method  Path               Body                                Description
 *  ------  -----------------  ----------------------------------  ----------------
 *  POST    /api/mail/send     { to, subject, text }               Send one email
 *
 *  Authentication: x-api-key header (auth.middleware).
 *  Validation:      validators/mail.validator.js
 *  Handler:         controllers/mail.controller.js
 * =============================================================================
 */

const router = require('express').Router();
const auth = require('../../middlewares/auth.middleware');
const ctrl = require('../../controllers/mail.controller');

router.post('/send', auth, ctrl.send);

module.exports = router;
