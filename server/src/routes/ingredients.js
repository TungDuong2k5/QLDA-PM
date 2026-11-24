const router = require('express').Router();
const ctrl = require('../controllers/ingredientController');
const { authenticate, requireAdmin } = require('../middleware/auth');
const ah = require('../utils/asyncHandler');

router.use(authenticate, requireAdmin);
router.get('/', ah(ctrl.list));
router.post('/', ah(ctrl.create));
router.get('/today', ah(ctrl.todayMovements));
router.get('/monthly-summary', ah(ctrl.monthlySummary));
router.put('/:id/products', ah(ctrl.setProducts));
router.put('/:id', ah(ctrl.update));
router.delete('/:id', ah(ctrl.remove));
router.post('/:id/movements', ah(ctrl.addMovement));

module.exports = router;
