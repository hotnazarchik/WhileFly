import type { LogAnalysis } from '../blackbox/analyze';
import type { LogRecord } from '../state/AppContext';
import type { SharedLog } from './client';

export function sharedFromAnalysis(a: LogAnalysis, fileName?: string): SharedLog {
  return {
    craftName: a.craftName !== '—' ? a.craftName : '',
    fileName,
    firmware: a.firmware,
    date: a.logDate !== '—' ? a.logDate : undefined,
    durationSec: a.durationSec,
    cells: a.battery?.cells || undefined,
    minCellV: a.battery && a.battery.cells ? a.battery.min / a.battery.cells : undefined,
    mAh: a.current?.mAh,
    maxAmps: a.current?.max,
    maxThrottle: a.throttle?.maxPct,
    maxGyro: a.gyro ? Math.max(a.gyro[0].max, a.gyro[1].max, a.gyro[2].max) : undefined,
    maxSpeedKmh: a.gps?.maxSpeedKmh,
    issues: a.insights.filter((i) => i.level !== 'ok').map((i) => i.text).slice(0, 6),
  };
}

export function sharedFromRecord(l: LogRecord): SharedLog {
  return {
    craftName: l.craftName !== '—' ? l.craftName : '',
    fileName: l.fileName,
    firmware: l.firmware,
    date: new Date(l.addedAt).toISOString(),
    durationSec: l.durationSec,
    cells: l.cells,
    minCellV: l.minCellV,
    mAh: l.mAh,
    maxAmps: l.maxAmps,
    maxThrottle: l.maxThrottle,
    maxGyro: l.maxGyro,
    maxSpeedKmh: l.maxSpeedKmh,
    issues: l.issueTexts ?? [],
  };
}
