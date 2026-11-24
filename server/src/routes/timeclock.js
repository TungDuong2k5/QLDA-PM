const router = require('express').Router();
const ctrl = require('../controllers/timeclockController');
const { authenticate } = require('../middleware/auth');
const ah = require('../utils/asyncHandler');

// Tài khoản staff (quầy thu ngân) và admin đều dùng được: nhân viên nhập PIN tại quầy khi mở ca.
// Check-out: từng nhân viên nhập PIN khi tới giờ tan ca. Kết ca (đóng ca bán hàng) không check-out hộ.
router.use(authenticate);
router.get('/', ah(ctrl.status));
router.post('/checkin', ah(ctrl.checkin));
router.post('/checkout', ah(ctrl.checkout));
router.post('/remind', ah(ctrl.remind));
router.post('/undo', ah(ctrl.undo));

module.exports = router;
