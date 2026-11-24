const router = require('express').Router();
const ctrl = require('../controllers/productController');
const { authenticate, requireAdmin } = require('../middleware/auth');
const ah = require('../utils/asyncHandler');

router.use(authenticate);
router.get('/', ah(ctrl.list));
router.post('/', requireAdmin, ah(ctrl.create));
router.get('/movements/today', requireAdmin, ah(ctrl.todayMovements));
router.get('/movements/monthly-summary', requireAdmin, ah(ctrl.monthlySummary));
router.patch('/:id/availability', ah(ctrl.setAvailability));
router.post('/:id/notice', requireAdmin, ah(ctrl.requestNotice));
router.delete('/:id/notice', requireAdmin, ah(ctrl.cancelNotice));
router.put('/:id', requireAdmin, ah(ctrl.update));
router.post('/:id/movements', requireAdmin, ah(ctrl.addMovement));
router.delete('/:id', requireAdmin, ah(ctrl.remove));

module.exports = router;
