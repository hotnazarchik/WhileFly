import { describeFlightModes, FlightEvent, findLogs, LogHeader, parseFrames, parseHeader, ParseResultInfo } from './parser';

export interface AxisStats {
  max: number;
  avgAbs: number;
}

export interface LogAnalysis {
  index: number;
  totalLogs: number;
  header: LogHeader;
  info: ParseResultInfo;
  durationSec: number;
  sampleRateHz: number;
  craftName: string;
  firmware: string;
  board: string;
  logDate: string;
  // flight stats
  gyro: [AxisStats, AxisStats, AxisStats] | null;
  throttle: { avgPct: number; maxPct: number; fullThrottleSec: number } | null;
  motors: { count: number; avgPct: number[]; maxPct: number[]; saturationPct: number } | null;
  battery: { start: number; end: number; min: number; max: number; sag: number; cells: number } | null;
  current: { avg: number; max: number; mAh: number } | null;
  rssi: { min: number; avg: number } | null;
  gps: { maxSpeedKmh: number; maxAltM: number; maxSats: number; maxDistM: number; frames: number } | null;
  flightModes: string[];
  events: FlightEvent[];
  insights: { level: 'ok' | 'warn' | 'bad'; text: string }[];
  // downsampled series for charts
  series: {
    t: number[];
    gyro: number[][];
    throttle: number[];
    motors: number[][];
    vbat: number[];
    amps: number[];
    rssi: number[];
  };
  keySettings: [string, string][];
}

const MAX_SAMPLES = 1500;

export function listLogs(bytes: Uint8Array): number[] {
  return findLogs(bytes);
}

export function analyzeLog(bytes: Uint8Array, logIndex: number): LogAnalysis {
  const starts = findLogs(bytes);
  if (starts.length === 0) throw new Error('Це не схоже на Blackbox лог (не знайдено заголовок "H Product:Blackbox").');
  const idx = Math.max(0, Math.min(starts.length - 1, logIndex));
  const start = starts[idx];
  const end = idx + 1 < starts.length ? starts[idx + 1] : bytes.length;
  const { header, dataStart } = parseHeader(bytes, start, end);
  const names = header.defs.I?.names ?? [];
  const f = (name: string) => names.indexOf(name);

  const iTime = f('time');
  const iGyro = [f('gyroADC[0]'), f('gyroADC[1]'), f('gyroADC[2]')];
  const iThr = f('rcCommand[3]');
  const iMotors: number[] = [];
  for (let m = 0; m < 8; m++) {
    const k = f(`motor[${m}]`);
    if (k >= 0) iMotors.push(k);
  }
  const iVbat = f('vbatLatest');
  const iAmp = f('amperageLatest');
  const iRssi = f('rssi');

  const vbatDiv = header.firmwareMajor >= 4 ? 100 : 10;
  const gyroK = header.gyroScale;
  const motorRange = Math.max(1, header.motorMax - header.motorMin);

  // accumulators
  let count = 0;
  let firstTime = NaN;
  let lastTime = NaN;
  let prevTime = NaN;
  const gMax = [0, 0, 0];
  const gSum = [0, 0, 0];
  let thrSum = 0;
  let thrMax = 0;
  let fullThrUs = 0;
  const mSum = iMotors.map(() => 0);
  const mMax = iMotors.map(() => 0);
  let satFrames = 0;
  let vStart = NaN;
  let vEnd = NaN;
  let vMin = Infinity;
  let vMax = -Infinity;
  let aSum = 0;
  let aMax = 0;
  let mAh = 0;
  let rMin = Infinity;
  let rSum = 0;

  // downsampling (adaptive decimation)
  let stride = 1;
  let sinceLast = 0;
  const s = {
    t: [] as number[],
    gyro: [[], [], []] as number[][],
    throttle: [] as number[],
    motors: iMotors.map(() => [] as number[]),
    vbat: [] as number[],
    amps: [] as number[],
    rssi: [] as number[],
  };
  const decimate = () => {
    const half = (a: number[]) => a.filter((_, i) => i % 2 === 0);
    s.t = half(s.t);
    s.gyro = s.gyro.map(half);
    s.throttle = half(s.throttle);
    s.motors = s.motors.map(half);
    s.vbat = half(s.vbat);
    s.amps = half(s.amps);
    s.rssi = half(s.rssi);
    stride *= 2;
  };

  const thrPct = (v: number) => Math.max(0, Math.min(100, ((v - 1000) / 1000) * 100));

  const modes = new Set<string>();
  const events: FlightEvent[] = [];
  let gpsStats = { maxSpeedKmh: 0, maxAltM: -Infinity, maxSats: 0, maxDistM: 0, frames: 0 };
  let gpsOrigin: [number, number] | null = null;
  const gNames = header.defs.G?.names ?? [];
  const gi = (n: string) => gNames.indexOf(n);
  const gLat = gi('GPS_coord[0]');
  const gLon = gi('GPS_coord[1]');
  const gAlt = gi('GPS_altitude');
  const gSpd = gi('GPS_speed');
  const gSat = gi('GPS_numSat');
  const sNames = header.defs.S?.names ?? [];
  const sModes = sNames.indexOf('flightModeFlags');

  const info = parseFrames(bytes, header, dataStart, end, {
    onMain(fr) {
      count++;
      const t = iTime >= 0 ? fr[iTime] : count * 1000;
      if (Number.isNaN(firstTime)) firstTime = t;
      const dtUs = Number.isNaN(prevTime) ? 0 : Math.max(0, Math.min(100000, t - prevTime));
      prevTime = t;
      lastTime = t;

      for (let a = 0; a < 3; a++) {
        if (iGyro[a] < 0) continue;
        const g = fr[iGyro[a]] * gyroK;
        const ab = Math.abs(g);
        if (ab > gMax[a]) gMax[a] = ab;
        gSum[a] += ab;
      }
      let thr = 0;
      if (iThr >= 0) {
        thr = thrPct(fr[iThr]);
        thrSum += thr;
        if (thr > thrMax) thrMax = thr;
        if (thr >= 95) fullThrUs += dtUs;
      }
      let saturated = false;
      for (let m = 0; m < iMotors.length; m++) {
        const pct = Math.max(0, Math.min(100, ((fr[iMotors[m]] - header.motorMin) / motorRange) * 100));
        mSum[m] += pct;
        if (pct > mMax[m]) mMax[m] = pct;
        if (pct >= 98) saturated = true;
      }
      if (saturated) satFrames++;
      let v = NaN;
      if (iVbat >= 0) {
        v = fr[iVbat] / vbatDiv;
        if (v > 1) {
          if (Number.isNaN(vStart)) vStart = v;
          vEnd = v;
          if (v < vMin) vMin = v;
          if (v > vMax) vMax = v;
        }
      }
      let amps = NaN;
      if (iAmp >= 0) {
        amps = fr[iAmp] / 100;
        aSum += amps;
        if (amps > aMax) aMax = amps;
        mAh += (amps * dtUs) / 3.6e6;
      }
      let rssi = NaN;
      if (iRssi >= 0) {
        rssi = (fr[iRssi] / 1023) * 100;
        if (rssi < rMin) rMin = rssi;
        rSum += rssi;
      }

      sinceLast++;
      if (sinceLast >= stride) {
        sinceLast = 0;
        s.t.push((t - firstTime) / 1e6);
        for (let a = 0; a < 3; a++) s.gyro[a].push(iGyro[a] >= 0 ? fr[iGyro[a]] * gyroK : NaN);
        s.throttle.push(thr);
        for (let m = 0; m < iMotors.length; m++) s.motors[m].push(((fr[iMotors[m]] - header.motorMin) / motorRange) * 100);
        s.vbat.push(v);
        s.amps.push(amps);
        s.rssi.push(rssi);
        if (s.t.length >= MAX_SAMPLES * 2) decimate();
      }
    },
    onSlow(fr) {
      if (sModes >= 0) modes.add(describeFlightModes(fr[sModes]));
    },
    onGps(fr) {
      gpsStats.frames++;
      if (gSat >= 0) gpsStats.maxSats = Math.max(gpsStats.maxSats, fr[gSat]);
      if (gSpd >= 0) gpsStats.maxSpeedKmh = Math.max(gpsStats.maxSpeedKmh, (fr[gSpd] / 100) * 3.6);
      if (gAlt >= 0) gpsStats.maxAltM = Math.max(gpsStats.maxAltM, fr[gAlt] / (header.firmwareMajor >= 4 ? 100 : 10));
      if (gLat >= 0 && gLon >= 0 && (gSat < 0 || fr[gSat] >= 5)) {
        const lat = fr[gLat] / 1e7;
        const lon = fr[gLon] / 1e7;
        if (Math.abs(lat) > 0.01 || Math.abs(lon) > 0.01) {
          if (!gpsOrigin) gpsOrigin = [lat, lon];
          else gpsStats.maxDistM = Math.max(gpsStats.maxDistM, haversine(gpsOrigin[0], gpsOrigin[1], lat, lon));
        }
      }
    },
    onEvent(ev) {
      if (events.length < 200) events.push(ev);
      if (ev.type === 'Flight mode' && ev.detail) modes.add(ev.detail);
    },
  });

  if (count === 0) throw new Error('Лог не містить жодного валідного кадру даних (можливо пошкоджений).');

  const durationSec = Math.max(0, (lastTime - firstTime) / 1e6);
  const raw = header.raw;

  // Same rule Betaflight uses: cells = floor(V / maxCellVoltage) + 1, with maxCell from the header
  const cellCfg = (raw['vbatcellvoltage'] ?? '').split(',').map((v) => parseInt(v, 10));
  const maxCellV = cellCfg[2] > 300 && cellCfg[2] < 500 ? cellCfg[2] / 100 : 4.3;
  const restV = Number.isFinite(vStart) ? vStart : vMax;
  const cells = Number.isFinite(restV) && restV > 2 ? Math.min(14, Math.floor(restV / maxCellV) + 1) : 0;
  const battery =
    iVbat >= 0 && Number.isFinite(vMin)
      ? { start: vStart, end: vEnd, min: vMin, max: vMax, sag: vStart - vMin, cells }
      : null;

  const insights: LogAnalysis['insights'] = [];
  if (info.corruptFrames > 0) insights.push({ level: info.corruptFrames > 50 ? 'bad' : 'warn', text: `Пошкоджених кадрів: ${info.corruptFrames}. Можливо, флешка/SD карта не встигає писати.` });
  if (battery && cells > 0) {
    const perCellMin = battery.min / cells;
    const perCellEnd = battery.end / cells;
    if (perCellMin < 3.0) insights.push({ level: 'bad', text: `Просідання до ${perCellMin.toFixed(2)} В/банку — акумулятор перевантажений або зношений.` });
    else if (perCellMin < 3.3) insights.push({ level: 'warn', text: `Мінімум ${perCellMin.toFixed(2)} В/банку під навантаженням — близько до межі.` });
    else insights.push({ level: 'ok', text: `Батарея ${cells}S тримає напругу добре (мін ${perCellMin.toFixed(2)} В/банку).` });
    if (perCellEnd < 3.5) insights.push({ level: 'warn', text: `Посадка на ${perCellEnd.toFixed(2)} В/банку — варто сідати раніше, щоб берегти LiPo.` });
  }
  const satPct = count ? (satFrames / count) * 100 : 0;
  if (iMotors.length) {
    if (satPct > 5) insights.push({ level: 'warn', text: `Мотори в насиченні ${satPct.toFixed(1)}% часу — дрону бракує тяги або PID занадто агресивні.` });
    const avgs = mSum.map((v) => v / count);
    const spread = Math.max(...avgs) - Math.min(...avgs);
    if (spread > 10) insights.push({ level: 'warn', text: `Нерівномірне навантаження моторів (різниця ${spread.toFixed(0)}%) — перевір центр мас, пропи чи мотор.` });
  }
  const gAvg = gSum.map((v) => v / count);
  if (gMax[0] > 1500 || gMax[1] > 1500) insights.push({ level: 'warn', text: 'Дуже високі кутові швидкості (>1500°/с) — можливі краш або сильні вібрації.' });
  if (rMin < 30 && iRssi >= 0) insights.push({ level: 'warn', text: `RSSI падав до ${rMin.toFixed(0)}% — слабкий лінк у деяких місцях.` });
  const disarms = events.filter((e) => e.type === 'Disarm');
  for (const d of disarms) {
    if (d.detail && /Failsafe|Crash|Runaway/.test(d.detail)) insights.push({ level: 'bad', text: `Дізарм через: ${d.detail}.` });
  }
  if ([...modes].some((m) => m.includes('FAILSAFE'))) insights.push({ level: 'bad', text: 'Під час польоту спрацьовував FAILSAFE.' });
  if (!insights.some((i) => i.level !== 'ok')) insights.push({ level: 'ok', text: 'Явних проблем не виявлено.' });

  const keyList: [string, string][] = [
    ['Firmware', 'Firmware revision'],
    ['Борт (craft)', 'Craft name'],
    ['Плата', 'Board information'],
    ['Дата логу', 'Log start datetime'],
    ['Looptime, мкс', 'looptime'],
    ['P interval / ratio', 'P interval'],
    ['Roll PID', 'rollPID'],
    ['Pitch PID', 'pitchPID'],
    ['Yaw PID', 'yawPID'],
    ['RC rates', 'rc_rates'],
    ['Rates', 'rates'],
    ['RC expo', 'rc_expo'],
    ['Rates type', 'rates_type'],
    ['Feedforward', 'feedforward_weight'],
    ['D min', 'd_min'],
    ['TPA', 'tpa_rate'],
    ['Gyro LPF1 Hz', 'gyro_lowpass_hz'],
    ['Gyro LPF2 Hz', 'gyro_lowpass2_hz'],
    ['Dterm LPF1 Hz', 'dterm_lpf1_static_hz'],
    ['Dyn notch', 'dyn_notch_count'],
    ['RPM filter harmonics', 'rpm_filter_harmonics'],
    ['DShot bidir', 'dshot_bidir'],
    ['Motor protocol', 'motor_pwm_protocol'],
    ['Motor poles', 'motor_poles'],
    ['Debug mode', 'debug_mode'],
    ['Anti gravity', 'anti_gravity_gain'],
    ['Iterm relax', 'iterm_relax'],
    ['Simplified tuning', 'simplified_pids_mode'],
  ];
  const keySettings = keyList.filter(([, k]) => raw[k] !== undefined && raw[k] !== '').map(([label, k]) => [label, raw[k]] as [string, string]);

  const hasGyro = iGyro.some((g) => g >= 0);

  return {
    index: idx,
    totalLogs: starts.length,
    header,
    info,
    durationSec,
    sampleRateHz: durationSec > 0 ? count / durationSec : 0,
    craftName: raw['Craft name'] || '—',
    firmware: header.firmware,
    board: raw['Board information'] || raw['Board'] || '—',
    logDate: raw['Log start datetime'] || '—',
    gyro: hasGyro
      ? [
          { max: gMax[0], avgAbs: gAvg[0] },
          { max: gMax[1], avgAbs: gAvg[1] },
          { max: gMax[2], avgAbs: gAvg[2] },
        ]
      : null,
    throttle: iThr >= 0 ? { avgPct: thrSum / count, maxPct: thrMax, fullThrottleSec: fullThrUs / 1e6 } : null,
    motors: iMotors.length ? { count: iMotors.length, avgPct: mSum.map((v) => v / count), maxPct: mMax, saturationPct: satPct } : null,
    battery,
    current: iAmp >= 0 ? { avg: aSum / count, max: aMax, mAh } : null,
    rssi: iRssi >= 0 && Number.isFinite(rMin) ? { min: rMin, avg: rSum / count } : null,
    gps: gpsStats.frames > 0 ? { ...gpsStats, maxAltM: Number.isFinite(gpsStats.maxAltM) ? gpsStats.maxAltM : 0 } : null,
    flightModes: [...modes],
    events,
    insights,
    series: s,
    keySettings,
  };
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
