const router = require('express').Router();
const ctrl = require('../controllers/tableController');
const { authenticate, requireAdmin } = require('../middleware/auth');
const ah = require('../utils/asyncHandler');

router.use(authenticate);
router.get('/', ah(ctrl.list));
router.post('/', requireAdmin, ah(ctrl.create));
router.put('/:id', requireAdmin, ah(ctrl.update));
router.delete('/:id', requireAdmin, ah(ctrl.remove));

module.exports = router;
