import { useEffect, useMemo, useRef } from 'react';
import { useApp } from './AppContext';
import { useAuth, useServerEvents } from './AuthContext';

/**
 * Invisible helpers mounted once at the app root:
 * - keeps the unread badge on the «Побратими» tab up to date
 * - syncs local drones & flight stats to the online profile so comrades can see them
 */
export function Background() {
  const { status, api, setUnreadTotal, connected } = useAuth();
  const { drones, logs } = useApp();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshUnread = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      api
        .chats()
        .then((chats) => setUnreadTotal(chats.reduce((s, c) => s + c.unread, 0)))
        .catch(() => {});
    }, 400);
  };

  useEffect(() => {
    if (status === 'authed') refreshUnread();
  }, [status, connected, api]);

  useServerEvents((e) => {
    if (status === 'authed' && (e.type === 'message' || e.type === 'chat' || e.type === 'chat_removed')) refreshUnread();
  });

  // profile sync (debounced)
  const stats = useMemo(
    () => ({
      flights: logs.length,
      flightSec: logs.reduce((s, l) => s + l.durationSec, 0),
      mAh: logs.reduce((s, l) => s + (l.mAh ?? 0), 0),
      fastestKmh: logs.reduce((m, l) => Math.max(m, l.maxSpeedKmh ?? 0), 0),
    }),
    [logs],
  );
  useEffect(() => {
    if (status !== 'authed') return;
    const t = setTimeout(() => {
      api
        .updateMe({ drones: drones.map((d) => ({ name: d.name, cls: d.cls, weightG: d.weightG, maxWind: d.maxWind })), stats })
        .catch(() => {});
    }, 2000);
    return () => clearTimeout(t);
  }, [status, api, drones, stats]);

  return null;
}
