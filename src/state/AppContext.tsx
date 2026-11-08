import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type DroneClass = 'tinywhoop' | 'cinewhoop' | 'toothpick' | 'freestyle5' | 'longrange7' | 'custom';

export interface Drone {
  id: string;
  name: string;
  cls: DroneClass;
  weightG: number;
  /** Max sustained wind (m/s) the pilot considers comfortable. */
  maxWind: number;
}

export interface Profile {
  name: string;
  callsign: string;
  homeCity?: string;
  createdAt: number;
}

export interface LogRecord {
  id: string;
  fileName: string;
  storedUri?: string;
  addedAt: number;
  logIndex: number;
  craftName: string;
  firmware: string;
  durationSec: number;
  maxThrottle?: number;
  mAh?: number;
  minCellV?: number;
  maxGyro?: number;
  maxSpeedKmh?: number;
  droneId?: string;
  notes?: string;
  issues: number;
  issueTexts?: string[];
  cells?: number;
  maxAmps?: number;
}

export const DRONE_CLASSES: Record<DroneClass, { label: string; baseWind: number; refWeight: number }> = {
  tinywhoop: { label: 'Tinywhoop 65–75 мм', baseWind: 3.5, refWeight: 30 },
  cinewhoop: { label: 'Cinewhoop 2.5–3.5"', baseWind: 6, refWeight: 250 },
  toothpick: { label: 'Toothpick / 3"', baseWind: 7, refWeight: 150 },
  freestyle5: { label: 'Freestyle 5"', baseWind: 11, refWeight: 650 },
  longrange7: { label: 'Long Range 7"', baseWind: 13, refWeight: 1000 },
  custom: { label: 'Інший', baseWind: 8, refWeight: 500 },
};

/** Estimate wind tolerance from class + weight (heavier = more stable). */
export function estimateMaxWind(cls: DroneClass, weightG: number): number {
  const c = DRONE_CLASSES[cls];
  const ratio = Math.max(0.3, Math.min(3, weightG / c.refWeight));
  return Math.round(c.baseWind * Math.pow(ratio, 0.25) * 10) / 10;
}

const DEFAULT_DRONES: Drone[] = [
  { id: 'd-5in', name: 'Мій 5"', cls: 'freestyle5', weightG: 650, maxWind: 11 },
  { id: 'd-whoop', name: 'Tinywhoop', cls: 'tinywhoop', weightG: 30, maxWind: 3.5 },
];

interface AppState {
  ready: boolean;
  profile: Profile;
  drones: Drone[];
  logs: LogRecord[];
  setProfile(p: Profile): void;
  addDrone(d: Omit<Drone, 'id'>): void;
  removeDrone(id: string): void;
  addLog(l: Omit<LogRecord, 'id' | 'addedAt'>): LogRecord;
  updateLog(id: string, patch: Partial<LogRecord>): void;
  removeLog(id: string): void;
}

const Ctx = createContext<AppState | null>(null);

const K_PROFILE = 'wf.profile';
const K_DRONES = 'wf.drones';
const K_LOGS = 'wf.logs';

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [profile, setProfileState] = useState<Profile>({ name: 'Пілот', callsign: 'FPV', createdAt: Date.now() });
  const [drones, setDrones] = useState<Drone[]>(DEFAULT_DRONES);
  const [logs, setLogs] = useState<LogRecord[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [p, d, l] = await AsyncStorage.multiGet([K_PROFILE, K_DRONES, K_LOGS]);
        if (p[1]) setProfileState(JSON.parse(p[1]));
        if (d[1]) setDrones(JSON.parse(d[1]));
        if (l[1]) setLogs(JSON.parse(l[1]));
      } catch (e) {
        console.warn('Failed to load storage', e);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (ready) AsyncStorage.setItem(K_PROFILE, JSON.stringify(profile)).catch(() => {});
  }, [profile, ready]);
  useEffect(() => {
    if (ready) AsyncStorage.setItem(K_DRONES, JSON.stringify(drones)).catch(() => {});
  }, [drones, ready]);
  useEffect(() => {
    if (ready) AsyncStorage.setItem(K_LOGS, JSON.stringify(logs)).catch(() => {});
  }, [logs, ready]);

  const addLog = useCallback((l: Omit<LogRecord, 'id' | 'addedAt'>) => {
    const rec: LogRecord = { ...l, id: uid(), addedAt: Date.now() };
    setLogs((prev) => [rec, ...prev]);
    return rec;
  }, []);

  const value = useMemo<AppState>(
    () => ({
      ready,
      profile,
      drones,
      logs,
      setProfile: setProfileState,
      addDrone: (d) => setDrones((prev) => [...prev, { ...d, id: uid() }]),
      removeDrone: (id) => setDrones((prev) => prev.filter((x) => x.id !== id)),
      addLog,
      updateLog: (id, patch) => setLogs((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x))),
      removeLog: (id) => setLogs((prev) => prev.filter((x) => x.id !== id)),
    }),
    [ready, profile, drones, logs, addLog],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside AppProvider');
  return v;
}
