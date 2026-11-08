/** Typed client for the WhileFly server (see /server). */

export interface PublicUser {
  id: number;
  callsign: string;
  name: string;
  bio: string;
  online: boolean;
}

export type Relation = 'self' | 'friend' | 'incoming' | 'outgoing' | 'none';

export interface RemoteDrone {
  name: string;
  cls: string;
  weightG: number;
  maxWind: number;
}

export interface RemoteStats {
  flights: number;
  flightSec: number;
  mAh: number;
  fastestKmh: number;
}

export interface Me extends PublicUser {
  drones: RemoteDrone[];
  stats: Partial<RemoteStats>;
  createdAt: number;
}

export interface UserProfile extends PublicUser {
  relation: Relation;
  createdAt: number;
  drones: RemoteDrone[] | null;
  stats: Partial<RemoteStats> | null;
}

export interface SharedLog {
  craftName: string;
  fileName?: string;
  firmware: string;
  date?: string;
  durationSec: number;
  cells?: number;
  minCellV?: number;
  mAh?: number;
  maxAmps?: number;
  maxThrottle?: number;
  maxGyro?: number;
  maxSpeedKmh?: number;
  issues: string[];
}

export interface Message {
  id: number;
  chatId: number;
  senderId: number;
  kind: 'text' | 'log' | 'system';
  text: string;
  log: SharedLog | null;
  createdAt: number;
}

export interface Chat {
  id: number;
  kind: 'direct' | 'group';
  title: string;
  createdBy: number;
  members: PublicUser[];
  lastMessage: Message | null;
  unread: number;
  createdAt: number;
}

export interface FriendsList {
  friends: PublicUser[];
  incoming: PublicUser[];
  outgoing: PublicUser[];
}

export type ServerEvent =
  | { type: 'hello'; userId: number }
  | { type: 'message'; chatId: number; message: Message }
  | { type: 'chat'; chatId: number }
  | { type: 'chat_removed'; chatId: number }
  | { type: 'friends' };

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
      throw new ApiError(0, `Немає зв'язку з сервером ${this.baseUrl}`);
    } finally {
      clearTimeout(timer);
    }
    let data: any = null;
    try {
      data = await res.json();
    } catch {}
    if (!res.ok) throw new ApiError(res.status, data?.error ?? `Помилка ${res.status}`);
    return data as T;
  }

  wsUrl(): string {
    return this.baseUrl.replace(/^http/i, 'ws') + '/ws?token=' + encodeURIComponent(this.token ?? '');
  }

  // auth
  health = () => this.request<{ ok: boolean }>('GET', '/health');
  register = (callsign: string, name: string, password: string) =>
    this.request<{ token: string; user: Me }>('POST', '/auth/register', { callsign, name, password });
  login = (callsign: string, password: string) => this.request<{ token: string; user: Me }>('POST', '/auth/login', { callsign, password });
  logout = () => this.request('POST', '/auth/logout');

  // profile
  me = () => this.request<Me>('GET', '/me');
  updateMe = (patch: Partial<{ name: string; bio: string; drones: RemoteDrone[]; stats: RemoteStats }>) => this.request<Me>('PATCH', '/me', patch);
  searchUsers = (q: string) => this.request<(PublicUser & { relation: Relation })[]>('GET', '/users/search?q=' + encodeURIComponent(q));
  user = (id: number) => this.request<UserProfile>('GET', `/users/${id}`);

  // comrades
  friends = () => this.request<FriendsList>('GET', '/friends');
  addFriend = (id: number) => this.request<{ relation: Relation }>('POST', `/friends/${id}`);
  acceptFriend = (id: number) => this.request<{ relation: Relation }>('POST', `/friends/${id}/accept`);
  removeFriend = (id: number) => this.request<{ relation: Relation }>('DELETE', `/friends/${id}`);

  // chats
  chats = () => this.request<Chat[]>('GET', '/chats');
  chat = (id: number) => this.request<Chat>('GET', `/chats/${id}`);
  openDirect = (userId: number) => this.request<Chat>('POST', '/chats/direct', { userId });
  createGroup = (title: string, memberIds: number[]) => this.request<Chat>('POST', '/chats/group', { title, memberIds });
  addMembers = (chatId: number, userIds: number[]) => this.request<Chat>('POST', `/chats/${chatId}/members`, { userIds });
  leaveGroup = (chatId: number) => this.request('DELETE', `/chats/${chatId}/members/me`);
  messages = (chatId: number, before?: number) =>
    this.request<Message[]>('GET', `/chats/${chatId}/messages?limit=50${before ? `&before=${before}` : ''}`);
  sendText = (chatId: number, text: string) => this.request<Message>('POST', `/chats/${chatId}/messages`, { text });
  sendLog = (chatId: number, log: SharedLog, text?: string) => this.request<Message>('POST', `/chats/${chatId}/messages`, { log, text });
  markRead = (chatId: number, lastId: number) => this.request('POST', `/chats/${chatId}/read`, { lastId });
}

/** Display name for a chat from the current user's point of view. */
export function chatTitle(chat: Chat, myId: number): string {
  if (chat.kind === 'group') return chat.title;
  const other = chat.members.find((m) => m.id !== myId);
  return other ? `${other.callsign}` : 'Чат';
}

export function chatPeer(chat: Chat, myId: number): PublicUser | undefined {
  return chat.kind === 'direct' ? chat.members.find((m) => m.id !== myId) : undefined;
}
