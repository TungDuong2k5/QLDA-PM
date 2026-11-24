const router = require('express').Router();
const ctrl = require('../controllers/employeeController');
const { authenticate, requireAdmin } = require('../middleware/auth');
const ah = require('../utils/asyncHandler');

router.use(authenticate, requireAdmin);
router.get('/', ah(ctrl.list));
router.post('/', ah(ctrl.create));
// Lịch làm việc theo tuần (xếp ca) — không tính vào chấm công.
router.get('/schedule', ah(ctrl.schedule));
router.put('/schedule', ah(ctrl.saveSchedule));
// Sửa / xóa một lần chấm công (check-in / check-out thật).
router.get('/reminders', ah(ctrl.reminders));
router.patch('/reminders/:id/resolve', ah(ctrl.resolveReminder));
router.patch('/timelogs/:id', ah(ctrl.updateLog));
router.delete('/timelogs/:id', ah(ctrl.removeLog));
router.get('/:id/attendance', ah(ctrl.monthSheet));
router.post('/:id/timelogs', ah(ctrl.addLog));
router.put('/:id/pin', ah(ctrl.setPin));
router.patch('/:id', ah(ctrl.update));
router.delete('/:id', ah(ctrl.remove));

module.exports = router;
