import jwt from 'jsonwebtoken';

export function authenticate(req, res, next) {
  const header = req.header('authorization') ?? '';
  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET, { algorithms: ['HS256'] });
    req.user = { userId: payload.userId, role: payload.role };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireRole(...allowed) {
  return (req, res, next) => {
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({ error: 'Not allowed for your role' });
    }
    next();
  };
}