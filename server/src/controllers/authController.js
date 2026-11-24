const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User } = require('../models');

async function login(req, res) {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'username and password are required' });
  }

  const user = await User.findOne({ where: { username } });
  // Nhân viên (employee) không có tài khoản đăng nhập — cả quán dùng chung tài khoản staff.
  if (!user || !user.isActive || user.role === 'employee') {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  // Shifts are no longer auto-opened at login — staff explicitly "mở ca"
  // (entering the opening cash-drawer amount) from the Bán hàng screen.
  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role, fullName: user.fullName },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );

  return res.json({
    token,
    user: { id: user.id, username: user.username, role: user.role, fullName: user.fullName },
  });
}

async function me(req, res) {
  return res.json({ user: req.user });
}

// Người dùng tự đổi mật khẩu của mình (phải nhập đúng mật khẩu hiện tại).
async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'Vui lòng nhập mật khẩu hiện tại và mật khẩu mới' });
  }
  if (String(newPassword).length < 6) {
    return res.status(400).json({ message: 'Mật khẩu mới tối thiểu 6 ký tự' });
  }
  const user = await User.findByPk(req.user.id);
  if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
    return res.status(400).json({ message: 'Mật khẩu hiện tại không đúng' });
  }
  await user.update({ password: await bcrypt.hash(String(newPassword), 10) });
  return res.json({ ok: true });
}

module.exports = { login, me, changePassword };
