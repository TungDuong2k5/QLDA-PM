const router = require('express').Router();
const ctrl = require('../controllers/stockCheckController');
const { authenticate, requireAdmin } = require('../middleware/auth');
const ah = require('../utils/asyncHandler');

router.use(authenticate);

router.get('/today', ah(ctrl.today));                          // nhân viên (và quản lý) xem phiếu hôm nay + danh sách cần đếm
router.get('/due', ah(ctrl.due));                              // các ca đã hết giờ mà chưa kiểm kho
router.post('/', ah(ctrl.submit));                             // nhân viên gửi phiếu
router.get('/', requireAdmin, ah(ctrl.list));
router.get('/pending', requireAdmin, ah(ctrl.pending));
router.get('/:id', requireAdmin, ah(ctrl.detail));
router.patch('/:id/review', requireAdmin, ah(ctrl.review));

module.exports = router;
