import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { Api, ApiError, Me, normalizeServerUrl, ServerEvent } from '../api/client';

const K_SERVER = 'wf.serverUrl';
const K_TOKEN = 'wf.authToken';

export const DEFAULT_SERVER = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

// Token lives in the OS keystore on devices; web has no SecureStore, fall back to AsyncStorage.
const tokenStore = {
  get: () => (Platform.OS === 'web' ? AsyncStorage.getItem(K_TOKEN) : SecureStore.getItemAsync(K_TOKEN)),
  set: (v: string) => (Platform.OS === 'web' ? AsyncStorage.setItem(K_TOKEN, v) : SecureStore.setItemAsync(K_TOKEN, v)),
  clear: () => (Platform.OS === 'web' ? AsyncStorage.removeItem(K_TOKEN) : SecureStore.deleteItemAsync(K_TOKEN)),
};

type Listener = (e: ServerEvent) => void;

interface AuthState {
  status: 'loading' | 'guest' | 'authed';
  user: Me | null;
  serverUrl: string;
  api: Api;
  /** realtime socket state */
  connected: boolean;
  unreadTotal: number;
  setUnreadTotal(n: number | ((prev: number) => number)): void;
  setServerUrl(url: string): Promise<void>;
  login(callsign: string, password: string): Promise<void>;
  register(callsign: string, name: string, password: string): Promise<void>;
  logout(): Promise<void>;
  setUser(u: Me): void;
  subscribe(fn: Listener): () => void;
  /** dispatch an event locally (e.g. after marking a chat read) */
  notify(e: ServerEvent): void;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthState['status']>('loading');
  const [user, setUser] = useState<Me | null>(null);
  const [serverUrl, setServerUrlState] = useState(DEFAULT_SERVER);
  const [token, setToken] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const listeners = useRef(new Set<Listener>());

  const api = useMemo(() => new Api(serverUrl, token), [serverUrl, token]);

  // restore session
  useEffect(() => {
    (async () => {
      const [url, tok] = await Promise.all([AsyncStorage.getItem(K_SERVER), tokenStore.get().catch(() => null)]);
      const base = url ?? DEFAULT_SERVER;
      setServerUrlState(base);
      if (!tok) return setStatus('guest');
      const client = new Api(base, tok);
      try {
        const me = await client.me();
        setToken(tok);
        setUser(me);
        setStatus('authed');
      } catch (e) {
        // 401 = session revoked → forget it. Network error → keep the token for the next launch.
        if (e instanceof ApiError && e.status === 401) await tokenStore.clear();
        setStatus('guest');
      }
    })();
  }, []);

  // realtime socket with reconnect
  useEffect(() => {
    if (status !== 'authed' || !token) return;
    let ws: WebSocket | null = null;
    let closed = false;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let ping: ReturnType<typeof setInterval> | null = null;

    const open = () => {
      ws = new WebSocket(api.wsUrl());
      ws.onopen = () => {
        retry = 0;
        setConnected(true);
        ping = setInterval(() => ws?.readyState === 1 && ws.send('ping'), 25000);
      };
      ws.onmessage = (ev) => {
        if (ev.data === 'pong') return;
        try {
          const e = JSON.parse(String(ev.data)) as ServerEvent;
          listeners.current.forEach((fn) => fn(e));
        } catch {}
      };
      ws.onclose = (ev) => {
        setConnected(false);
        if (ping) clearInterval(ping);
        if (closed) return;
        if (ev.code === 4401) {
          // token revoked on the server
          logoutLocal();
          return;
        }
        timer = setTimeout(open, Math.min(30000, 1000 * 2 ** retry++));
      };
      ws.onerror = () => ws?.close();
    };
    open();

    // reconnect immediately when the app returns to the foreground
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && ws && ws.readyState !== 1) {
        if (timer) clearTimeout(timer);
        retry = 0;
        open();
      }
    });

    return () => {
      closed = true;
      sub.remove();
      if (timer) clearTimeout(timer);
      if (ping) clearInterval(ping);
      ws?.close();
    };
  }, [status, token, api]);

  const logoutLocal = useCallback(async () => {
    await tokenStore.clear().catch(() => {});
    setToken(null);
    setUser(null);
    setUnreadTotal(0);
    setStatus('guest');
  }, []);

  const finishAuth = async (res: { token: string; user: Me }) => {
    await tokenStore.set(res.token);
    setToken(res.token);
    setUser(res.user);
    setStatus('authed');
  };

  const value = useMemo<AuthState>(
    () => ({
      status,
      user,
      serverUrl,
      api,
      connected,
      unreadTotal,
      setUnreadTotal,
      setServerUrl: async (url) => {
        const u = normalizeServerUrl(url);
        setServerUrlState(u);
        await AsyncStorage.setItem(K_SERVER, u);
      },
      login: async (callsign, password) => finishAuth(await new Api(serverUrl, null).login(callsign.trim(), password)),
      register: async (callsign, name, password) => finishAuth(await new Api(serverUrl, null).register(callsign.trim(), name.trim(), password)),
      logout: async () => {
        try {
          await api.logout();
        } catch {}
        await logoutLocal();
      },
      setUser,
      subscribe: (fn) => {
        listeners.current.add(fn);
        return () => listeners.current.delete(fn);
      },
      notify: (e) => listeners.current.forEach((fn) => fn(e)),
    }),
    [status, user, serverUrl, api, connected, unreadTotal, logoutLocal],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}

/** Subscribe to realtime server events while the component is mounted. */
export function useServerEvents(fn: Listener) {
  const { subscribe } = useAuth();
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => subscribe((e) => ref.current(e)), [subscribe]);
}
