const router = require('express').Router();
const ctrl = require('../controllers/orderController');
const { authenticate } = require('../middleware/auth');
const ah = require('../utils/asyncHandler');

router.use(authenticate);
router.get('/', ah(ctrl.list));
router.get('/days', ah(ctrl.days));
router.get('/days/:date', ah(ctrl.dayDetail));
router.post('/checkout', ah(ctrl.checkout));
router.get('/:id', ah(ctrl.getOne));
router.post('/', ah(ctrl.create));
router.patch('/:id/status', ah(ctrl.updateStatus));
router.post('/:id/pay', ah(ctrl.pay));

module.exports = router;
