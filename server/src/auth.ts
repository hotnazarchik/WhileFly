import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { DB } from './db.ts';

const KEYLEN = 64;

function scryptAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, KEYLEN, { N: 16384, r: 8, p: 1 }, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, saltB64, keyB64] = stored.split('$');
  if (algo !== 'scrypt' || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scryptAsync(password, Buffer.from(saltB64, 'base64'));
  return key.length === expected.length && timingSafeEqual(key, expected);
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** Creates a session and returns the raw token (only its hash is stored). */
export function createSession(db: DB, userId: number): string {
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, last_seen) VALUES (?, ?, ?, ?)').run(sha256(token), userId, now, now);
  return token;
}

export function userIdForToken(db: DB, token: string | undefined | null): number | null {
  if (!token) return null;
  const row = db.prepare('SELECT user_id FROM sessions WHERE token_hash = ?').get(sha256(token)) as { user_id: number } | undefined;
  if (!row) return null;
  db.prepare('UPDATE sessions SET last_seen = ? WHERE token_hash = ?').run(Date.now(), sha256(token));
  return Number(row.user_id);
}

export function deleteSession(db: DB, token: string): void {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
}

/** Very small in-memory rate limiter (per key, sliding window). */
export function makeRateLimiter(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return (key: string): boolean => {
    const now = Date.now();
    const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    arr.push(now);
    hits.set(key, arr);
    if (hits.size > 10_000) hits.clear();
    return arr.length <= max;
  };
}
