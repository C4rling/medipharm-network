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

const NAME_RE = /^\p{L}[\p{L}\p{M}\s'.-]*$/u;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GENDERS = ['male', 'female', 'other'];

router.post('/auth/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }
  const loginEmail = email.trim().toLowerCase();
  try {
    const rows = await prisma.$queryRaw`select * from fn_get_login_user(${loginEmail}::text)`;
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
    res.json({ token, user: { userId: user.user_id, role: user.role, email: loginEmail } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/auth/register', async (req, res) => {
  const body = req.body ?? {};
  const text = (k) => (typeof body[k] === 'string' ? body[k].trim() : '');
  const bad = (message) => res.status(400).json({ error: message });

  const firstName = text('firstName').replace(/\s+/g, ' ');
  const lastName = text('lastName').replace(/\s+/g, ' ');
  const email = text('email').toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';
  const dateOfBirth = text('dateOfBirth');
  const gender = text('gender').toLowerCase() || null;
  const phone = text('phone') || null;
  const address = text('address') || null;
  const emergencyContact = text('emergencyContact') || null;

  if (firstName.length < 2 || firstName.length > 50 || !NAME_RE.test(firstName)) {
    return bad('First name must be 2 to 50 letters');
  }
  if (lastName.length < 2 || lastName.length > 50 || !NAME_RE.test(lastName)) {
    return bad('Last name must be 2 to 50 letters');
  }
  if (email.length > 100 || !EMAIL_RE.test(email)) return bad('Enter a valid email address');
  if (password.length < 8 || Buffer.byteLength(password) > 72) {
    return bad('Password must be at least 8 characters (and at most 72 bytes)');
  }

  const dob = new Date(`${dateOfBirth}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) || Number.isNaN(dob.getTime())
      || dob.toISOString().slice(0, 10) !== dateOfBirth) {
    return bad('Date of birth must be a valid date (YYYY-MM-DD)');
  }
  if (dob > new Date()) return bad('Date of birth cannot be in the future');
  if (dateOfBirth < '1900-01-01') return bad('Date of birth cannot be before 1900');

  if (gender && !GENDERS.includes(gender)) return bad('Gender must be male, female or other');
  if ((phone?.length ?? 0) > 20) return bad('Phone is too long (maximum 20 characters)');
  if ((address?.length ?? 0) > 255) return bad('Address is too long (maximum 255 characters)');
  if ((emergencyContact?.length ?? 0) > 100) return bad('Emergency contact is too long (maximum 100 characters)');

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const rows = await prisma.$queryRaw`
      select fn_register_patient(
        ${firstName}::text, ${lastName}::text, ${phone}::text, ${address}::text,
        ${email}::text, ${passwordHash}::text, ${dateOfBirth}::date,
        ${gender}::text, ${emergencyContact}::text
      ) as user_id`;
    const userId = rows[0].user_id;
    const token = jwt.sign(
      { userId, role: 'patient' },
      process.env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: process.env.JWT_EXPIRES_IN ?? '8h' },
    );
    res.status(201).json({ token, user: { userId, role: 'patient', email } });
  } catch (e) {
    const msg = String(e.message);
    if (msg.includes('duplicate key')) {
      return res.status(409).json({ error: 'That email is already registered' });
    }
    if (msg.includes('not-null') || msg.includes('check constraint') || msg.includes('too long')) {
      return res.status(400).json({ error: 'Some details are missing or invalid' });
    }
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/auth/me', authenticate, (req, res) => res.json(req.user));

export default router;
