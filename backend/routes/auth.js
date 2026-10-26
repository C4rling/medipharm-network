import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is not set in backend/.env');
}

const router = Router();

// An unknown email still gets a bcrypt comparison, so response time does not
// reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

router.post('/auth/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }
  try {
    const rows = await prisma.$queryRaw`select * from fn_get_login_user(${email}::text)`;
    const user = rows[0];
    const ok = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);

    // One message for every failure, so an attacker learns nothing from it.
    if (!user || !ok || !user.active_status) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const token = jwt.sign(
      { userId: user.user_id, role: user.role },
      process.env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: process.env.JWT_EXPIRES_IN ?? '8h' },
    );
    res.json({ token, user: { userId: user.user_id, role: user.role, email } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/auth/me', authenticate, (req, res) => res.json(req.user));

export default router;