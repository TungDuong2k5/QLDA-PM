const router = require('express').Router();
const ctrl = require('../controllers/shiftController');
const { authenticate, requireAdmin } = require('../middleware/auth');
const ah = require('../utils/asyncHandler');

router.use(authenticate);
router.get('/current', ah(ctrl.current));
router.get('/today', ah(ctrl.today));
router.post('/open', ah(ctrl.open));
router.post('/:id/close', ah(ctrl.close));
router.get('/:id/report', ah(ctrl.report));
router.post('/:id/expenses', ah(ctrl.addExpense));
router.patch('/expenses/:expenseId', requireAdmin, ah(ctrl.reviewExpense));

module.exports = router;
