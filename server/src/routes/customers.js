const router = require('express').Router();
const ctrl = require('../controllers/customerController');
const { authenticate } = require('../middleware/auth');
const ah = require('../utils/asyncHandler');

router.use(authenticate);
router.get('/:phone', ah(ctrl.lookup));

module.exports = router;
