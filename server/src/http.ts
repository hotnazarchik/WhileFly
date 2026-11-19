import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Return this from a handler to stream a file instead of JSON. */
export class FileResponse {
  path: string;
  mime: string;
  downloadName?: string;
  constructor(path: string, mime: string, downloadName?: string) {
    this.path = path;
    this.mime = mime;
    this.downloadName = downloadName;
  }
}

export interface Ctx {
  req: IncomingMessage;
  params: Record<string, string>;
  query: URLSearchParams;
  body: any;
  /** raw request body for routes registered with { raw: maxBytes } */
  raw: Buffer | null;
  token: string | null;
  ip: string;
  /** set by auth-required routes */
  userId: number;
}

type Handler = (ctx: Ctx) => unknown | Promise<unknown>;

interface Route {
  method: string;
  re: RegExp;
  keys: string[];
  auth: boolean;
  raw: number;
  handler: Handler;
}

const MAX_BODY = 64 * 1024;

export class Router {
  routes: Route[] = [];

  add(method: string, path: string, handler: Handler, opts: { auth?: boolean; raw?: number } = {}) {
    const keys: string[] = [];
    const re = new RegExp(
      '^' +
        path.replace(/:(\w+)/g, (_, k: string) => {
          keys.push(k);
          return '([^/]+)';
        }) +
        '/?$',
    );
    this.routes.push({ method, re, keys, auth: opts.auth ?? true, raw: opts.raw ?? 0, handler });
  }

  async handle(req: IncomingMessage, res: ServerResponse, resolveUser: (token: string | null) => number | null) {
    setCors(res);
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }
    const url = new URL(req.url ?? '/', 'http://localhost');
    try {
      const route = this.routes.find((r) => r.method === req.method && r.re.test(url.pathname));
      if (!route) throw new HttpError(404, 'Не знайдено');
      const m = url.pathname.match(route.re)!;
      const params: Record<string, string> = {};
      route.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));

      const authz = req.headers.authorization;
      const token = authz?.startsWith('Bearer ') ? authz.slice(7) : null;
      // authenticate before reading a (possibly large) body
      const uid = route.auth ? resolveUser(token) : null;
      if (route.auth && !uid) throw new HttpError(401, 'Потрібно увійти');
      const raw = route.raw ? await readRaw(req, route.raw) : null;
      const ctx: Ctx = {
        req,
        params,
        query: url.searchParams,
        body: req.method === 'GET' || route.raw ? {} : await readJson(req),
        raw,
        token,
        ip: (req.socket.remoteAddress ?? 'unknown').replace('::ffff:', ''),
        userId: 0,
      };
      if (uid) ctx.userId = uid;
      const result = await route.handler(ctx);
      if (result instanceof FileResponse) {
        const st = await stat(result.path).catch(() => null);
        if (!st) throw new HttpError(404, 'Файл не знайдено');
        res.writeHead(200, {
          'Content-Type': result.mime,
          'Content-Length': st.size,
          'Cache-Control': 'private, max-age=31536000, immutable',
          ...(result.downloadName ? { 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(result.downloadName)}` } : {}),
        });
        createReadStream(result.path).pipe(res);
        return;
      }
      sendJson(res, 200, result ?? { ok: true });
    } catch (e) {
      if (e instanceof HttpError) sendJson(res, e.status, { error: e.message });
      else {
        console.error(e);
        sendJson(res, 500, { error: 'Помилка сервера' });
      }
    }
  }
}

function setCors(res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
}

function sendJson(res: ServerResponse, status: number, data: unknown) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function readRaw(req: IncomingMessage, max: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const declared = parseInt(req.headers['content-length'] ?? '0', 10);
    if (declared > max) {
      reject(new HttpError(413, `Файл завеликий (макс. ${Math.round(max / 1024 / 1024)} МБ)`));
      req.resume();
      return;
    }
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > max) {
        reject(new HttpError(413, `Файл завеликий (макс. ${Math.round(max / 1024 / 1024)} МБ)`));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function readJson(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new HttpError(413, 'Запит завеликий'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        const v = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        resolve(v && typeof v === 'object' ? v : {});
      } catch {
        reject(new HttpError(400, 'Некоректний JSON'));
      }
    });
    req.on('error', reject);
  });
}

// ---- validation helpers ----
export function str(v: unknown, field: string, min: number, max: number): string {
  if (typeof v !== 'string') throw new HttpError(400, `Поле «${field}» обов'язкове`);
  const s = v.trim();
  if (s.length < min || s.length > max) throw new HttpError(400, `«${field}»: від ${min} до ${max} символів`);
  return s;
}

export function intParam(v: unknown, field: string): number {
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  if (!Number.isSafeInteger(n) || n <= 0) throw new HttpError(400, `Некоректне поле «${field}»`);
  return n;
}
