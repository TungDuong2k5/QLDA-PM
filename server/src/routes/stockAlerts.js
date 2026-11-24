const router = require('express').Router();
const ctrl = require('../controllers/stockAlertController');
const { authenticate } = require('../middleware/auth');
const ah = require('../utils/asyncHandler');

router.get('/', authenticate, ah(ctrl.stockAlerts));

module.exports = router;
