/** Typed client for the WhileFly server (see /server): accounts only. */
import { tr } from '../i18n';

export interface Me {
  id: number;
  callsign: string;
  name: string;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function normalizeServerUrl(url: string): string {
  let u = url.trim().replace(/\/+$/, '');
  if (u && !/^https?:\/\//i.test(u)) u = 'http://' + u;
  return u;
}

export class Api {
  baseUrl: string;
  token: string | null;

  constructor(baseUrl: string, token: string | null) {
    this.baseUrl = normalizeServerUrl(baseUrl);
    this.token = token;
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      res = await fetch(this.baseUrl + path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      throw new ApiError(0, tr("Немає зв'язку з сервером {0}", this.baseUrl));
    } finally {
      clearTimeout(timer);
    }
    let data: any = null;
    try {
      data = await res.json();
    } catch {}
    if (!res.ok) throw new ApiError(res.status, data?.error ? tr(data.error) : tr('Помилка {0}', res.status));
    return data as T;
  }

  health = () => this.request<{ ok: boolean }>('GET', '/health');
  register = (callsign: string, name: string, password: string) =>
    this.request<{ token: string; user: Me }>('POST', '/auth/register', { callsign, name, password });
  login = (callsign: string, password: string) => this.request<{ token: string; user: Me }>('POST', '/auth/login', { callsign, password });
  logout = () => this.request('POST', '/auth/logout');
  me = () => this.request<Me>('GET', '/me');
}
