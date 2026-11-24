const router = require('express').Router();
const { login, me, changePassword } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const ah = require('../utils/asyncHandler');

router.post('/login', ah(login));
router.get('/me', authenticate, ah(me));
router.post('/change-password', authenticate, ah(changePassword));

module.exports = router;
