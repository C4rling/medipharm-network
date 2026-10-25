const VALID_ROLES = ['admin', 'staff', 'patient'];

// TEMPORARY: replaced by real login later. Works only when ALLOW_DEV_AUTH=true
// in the local .env. Never enable that in production.
export function authenticate(req, res, next) {
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