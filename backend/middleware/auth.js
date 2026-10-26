import jwt from 'jsonwebtoken';

const VALID_ROLES = ['admin', 'staff', 'patient'];

export function authenticate(req, res, next) {
  const header = req.header('authorization') ?? '';

  if (header.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET, { algorithms: ['HS256'] });
      req.user = { userId: payload.userId, role: payload.role };
      return next();
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  }

  // TEMPORARY dev fallback, removed once the frontend has a login screen.
  // Works only when ALLOW_DEV_AUTH=true in the local .env.
  if (process.env.ALLOW_DEV_AUTH === 'true') {
    const role = req.header('x-dev-role');
    const userId = Number(req.header('x-dev-user-id'));
    if (VALID_ROLES.includes(role) && Number.isInteger(userId)) {
      req.user = { role, userId };
      return next();
    }
  }
  return res.status(401).json({ error: 'Not logged in' });
}

export function requireRole(...allowed) {
  return (req, res, next) => {
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({ error: 'Not allowed for your role' });
    }
    next();
  };
}