import { createSession, deleteSession, hashPassword, makeRateLimiter, verifyPassword } from './auth.ts';
import type { DB } from './db.ts';
import { HttpError, Router, str } from './http.ts';

type Row = Record<string, any>;

const authLimiter = makeRateLimiter(20, 15 * 60 * 1000);

/** Accounts only: sign up, sign in, sign out and "who am I". */
export function buildRoutes(db: DB): Router {
  const r = new Router();
  const now = () => Date.now();

  const getUser = (id: number) => db.prepare('SELECT * FROM users WHERE id = ?').get(id) as Row | undefined;
  const meOut = (u: Row) => ({ id: Number(u.id), callsign: u.callsign as string, name: u.name as string });

  r.add('GET', '/health', () => ({ ok: true, service: 'whilefly', time: now() }), { auth: false });

  r.add(
    'POST',
    '/auth/register',
    async (c) => {
      if (!authLimiter('reg:' + c.ip)) throw new HttpError(429, 'Забагато спроб, зачекай кілька хвилин');
      const callsign = str(c.body.callsign, 'Позивний', 3, 20);
      if (!/^[A-Za-z0-9_-]+$/.test(callsign)) throw new HttpError(400, 'Позивний: латиниця, цифри, _ або -');
      const name = str(c.body.name, "Ім'я", 1, 40);
      const password = c.body.password;
      if (typeof password !== 'string' || password.length < 8 || password.length > 128) throw new HttpError(400, 'Пароль: від 8 до 128 символів');
      if (db.prepare('SELECT 1 FROM users WHERE callsign = ?').get(callsign)) throw new HttpError(409, 'Цей позивний вже зайнятий');
      const hash = await hashPassword(password);
      const res = db.prepare('INSERT INTO users (callsign, name, password_hash, created_at) VALUES (?, ?, ?, ?)').run(callsign, name, hash, now());
      const id = Number(res.lastInsertRowid);
      return { token: createSession(db, id), user: meOut(getUser(id)!) };
    },
    { auth: false },
  );

  r.add(
    'POST',
    '/auth/login',
    async (c) => {
      const callsign = str(c.body.callsign, 'Позивний', 1, 20);
      if (!authLimiter('login:' + c.ip + ':' + callsign.toLowerCase())) throw new HttpError(429, 'Забагато спроб, зачекай кілька хвилин');
      const u = db.prepare('SELECT * FROM users WHERE callsign = ?').get(callsign) as Row | undefined;
      const ok = u && typeof c.body.password === 'string' && (await verifyPassword(c.body.password, u.password_hash));
      if (!u || !ok) throw new HttpError(401, 'Невірний позивний або пароль');
      return { token: createSession(db, Number(u.id)), user: meOut(u) };
    },
    { auth: false },
  );

  r.add('POST', '/auth/logout', (c) => {
    if (c.token) deleteSession(db, c.token);
    return { ok: true };
  });

  r.add('GET', '/me', (c) => meOut(getUser(c.userId)!));

  return r;
}
