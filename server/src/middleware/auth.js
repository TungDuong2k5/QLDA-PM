const jwt = require('jsonwebtoken');
const { User } = require('../models');

async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Missing authentication token' });
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }

  // Tài khoản đã bị xóa thì token còn hạn cũng không dùng được nữa.
  try {
    const user = await User.findByPk(payload.id, { attributes: ['id', 'role', 'isActive'] });
    if (!user || !user.isActive || user.role === 'employee') {
      return res.status(401).json({ message: 'Tài khoản không còn hoạt động' });
    }
    req.user = { ...payload, role: user.role };
    return next();
  } catch (err) {
    return next(err);
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  return next();
}

module.exports = { authenticate, requireAdmin };
