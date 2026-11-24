const router = require('express').Router();
const { summary, days, dayDetail } = require('../controllers/dashboardController');
const { authenticate } = require('../middleware/auth');
const ah = require('../utils/asyncHandler');

router.get('/summary', authenticate, ah(summary));
router.get('/days', authenticate, ah(days));
router.get('/days/:date', authenticate, ah(dayDetail));

module.exports = router;
