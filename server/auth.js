import crypto from 'node:crypto';

const TOKEN_DAYS = 60;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === candidate.length && crypto.timingSafeEqual(candidate, expected);
}

export function issueToken(db, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + TOKEN_DAYS * 864e5).toISOString();
  db.prepare('INSERT INTO auth_tokens (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expires);
  return token;
}

export function newInviteCode() {
  // Short, unambiguous code athletes type in to join a coach.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (const b of crypto.randomBytes(6)) code += alphabet[b % alphabet.length];
  return code;
}

export function publicUser(u) {
  if (!u) return null;
  // Coach notes are private: only the athlete detail endpoint adds them back for the coach.
  const { password_hash, notes, ...rest } = u; // eslint-disable-line no-unused-vars
  return rest;
}

/** Express middleware: attaches req.user from a Bearer token (or ?token= for <video> tags). */
export function authenticate(db) {
  const find = db.prepare(
    `SELECT u.* FROM auth_tokens t JOIN users u ON u.id = t.user_id
     WHERE t.token = ? AND t.expires_at > ?`,
  );
  return (req, _res, next) => {
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.token;
    if (token) {
      const user = find.get(String(token), new Date().toISOString());
      if (user) {
        req.user = user;
        req.token = String(token);
      }
    }
    next();
  };
}
