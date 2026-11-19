import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { Api, ApiError, Me, normalizeServerUrl } from '../api/client';

const K_SERVER = 'wf.serverUrl';
const K_TOKEN = 'wf.authToken';

export const DEFAULT_SERVER = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

// Token lives in the OS keystore on devices; web has no SecureStore, fall back to AsyncStorage.
const tokenStore = {
  get: () => (Platform.OS === 'web' ? AsyncStorage.getItem(K_TOKEN) : SecureStore.getItemAsync(K_TOKEN)),
  set: (v: string) => (Platform.OS === 'web' ? AsyncStorage.setItem(K_TOKEN, v) : SecureStore.setItemAsync(K_TOKEN, v)),
  clear: () => (Platform.OS === 'web' ? AsyncStorage.removeItem(K_TOKEN) : SecureStore.deleteItemAsync(K_TOKEN)),
};

interface AuthState {
  status: 'loading' | 'guest' | 'authed';
  user: Me | null;
  serverUrl: string;
  setServerUrl(url: string): Promise<void>;
  login(callsign: string, password: string): Promise<void>;
  register(callsign: string, name: string, password: string): Promise<void>;
  logout(): Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthState['status']>('loading');
  const [user, setUser] = useState<Me | null>(null);
  const [serverUrl, setServerUrlState] = useState(DEFAULT_SERVER);
  const [token, setToken] = useState<string | null>(null);

  // restore session
  useEffect(() => {
    (async () => {
      const [url, tok] = await Promise.all([AsyncStorage.getItem(K_SERVER), tokenStore.get().catch(() => null)]);
      const base = url ?? DEFAULT_SERVER;
      setServerUrlState(base);
      if (!tok) return setStatus('guest');
      try {
        setUser(await new Api(base, tok).me());
        setToken(tok);
        setStatus('authed');
      } catch (e) {
        // 401 = session revoked → forget it. Network error → keep the token for the next launch.
        if (e instanceof ApiError && e.status === 401) await tokenStore.clear();
        setStatus('guest');
      }
    })();
  }, []);

  const finishAuth = async (res: { token: string; user: Me }) => {
    await tokenStore.set(res.token);
    setToken(res.token);
    setUser(res.user);
    setStatus('authed');
  };

  const logout = useCallback(async () => {
    try {
      await new Api(serverUrl, token).logout();
    } catch {}
    await tokenStore.clear().catch(() => {});
    setToken(null);
    setUser(null);
    setStatus('guest');
  }, [serverUrl, token]);

  const value = useMemo<AuthState>(
    () => ({
      status,
      user,
      serverUrl,
      setServerUrl: async (url) => {
        const u = normalizeServerUrl(url);
        setServerUrlState(u);
        await AsyncStorage.setItem(K_SERVER, u);
      },
      login: async (callsign, password) => finishAuth(await new Api(serverUrl, null).login(callsign.trim(), password)),
      register: async (callsign, name, password) => finishAuth(await new Api(serverUrl, null).register(callsign.trim(), name.trim(), password)),
      logout,
    }),
    [status, user, serverUrl, logout],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}
