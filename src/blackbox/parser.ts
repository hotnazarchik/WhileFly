/**
 * Betaflight / Cleanflight / INAV blackbox (.bbl / .bfl / .txt) binary log decoder.
 *
 * Implements the documented blackbox format: "H key:value" headers followed by
 * I (intra), P (inter), S (slow), G (GPS), H (GPS home) and E (event) frames,
 * with all field encodings and predictors used by Betaflight.
 */

const LOG_START_MARKER = 'H Product:Blackbox flight data recorder by Nicholas Sherlock';

// Encodings
const ENC_SIGNED_VB = 0;
const ENC_UNSIGNED_VB = 1;
const ENC_NEG_14BIT = 3;
const ENC_TAG8_8SVB = 6;
const ENC_TAG2_3S32 = 7;
const ENC_TAG8_4S16 = 8;
const ENC_NULL = 9;
const ENC_TAG2_3SVARIABLE = 10;

// Predictors
const PRED_0 = 0;
const PRED_PREVIOUS = 1;
const PRED_STRAIGHT_LINE = 2;
const PRED_AVERAGE_2 = 3;
const PRED_MINTHROTTLE = 4;
const PRED_MOTOR_0 = 5;
const PRED_INC = 6;
const PRED_HOME_COORD = 7;
const PRED_1500 = 8;
const PRED_VBATREF = 9;
const PRED_LAST_MAIN_FRAME_TIME = 10;
const PRED_MINMOTOR = 11;

export interface FrameDef {
  names: string[];
  signed: number[];
  predictor: number[];
  encoding: number[];
}

export interface LogHeader {
  raw: Record<string, string>;
  defs: { I?: FrameDef; P?: FrameDef; S?: FrameDef; G?: FrameDef; H?: FrameDef };
  dataVersion: number;
  minthrottle: number;
  vbatref: number;
  motorMin: number;
  motorMax: number;
  gyroScale: number;
  iInterval: number;
  pNum: number;
  pDenom: number;
  firmware: string;
  firmwareMajor: number;
}

export interface FlightEvent {
  type: string;
  timeUs?: number;
  detail?: string;
}

export interface ParseCallbacks {
  onMain(frame: number[], isIntra: boolean): void;
  onSlow?(frame: number[]): void;
  onGps?(frame: number[]): void;
  onEvent?(ev: FlightEvent): void;
}

export interface ParseResultInfo {
  mainFrames: number;
  corruptFrames: number;
  slowFrames: number;
  gpsFrames: number;
  bytes: number;
  endedCleanly: boolean;
}

class EOFError extends Error {}

/** Find byte offsets of every log inside the file (one file can contain many arm/disarm sessions). */
export function findLogs(bytes: Uint8Array): number[] {
  const marker = Array.from(LOG_START_MARKER).map((c) => c.charCodeAt(0));
  const starts: number[] = [];
  const first = marker[0];
  outer: for (let i = 0; i <= bytes.length - marker.length; i++) {
    if (bytes[i] !== first) continue;
    for (let j = 1; j < marker.length; j++) if (bytes[i + j] !== marker[j]) continue outer;
    starts.push(i);
    i += marker.length;
  }
  return starts;
}

function parseCsvInts(s: string): number[] {
  return s.split(',').map((v) => parseInt(v, 10) || 0);
}

function hexToFloat(hex: string): number {
  const n = parseInt(hex, 16);
  if (!Number.isFinite(n)) return 1;
  const buf = new DataView(new ArrayBuffer(4));
  buf.setUint32(0, n >>> 0);
  return buf.getFloat32(0);
}

/** Parse all "H ..." header lines; returns header and offset where binary data begins. */
export function parseHeader(bytes: Uint8Array, start: number, end: number): { header: LogHeader; dataStart: number } {
  const raw: Record<string, string> = {};
  let pos = start;
  while (pos < end && bytes[pos] === 0x48 /* H */ && bytes[pos + 1] === 0x20) {
    let lineEnd = pos;
    while (lineEnd < end && bytes[lineEnd] !== 0x0a) lineEnd++;
    let line = '';
    for (let i = pos + 2; i < lineEnd; i++) line += String.fromCharCode(bytes[i]);
    const colon = line.indexOf(':');
    if (colon > 0) raw[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
    pos = lineEnd + 1;
  }

  const defs: LogHeader['defs'] = {};
  for (const t of ['I', 'P', 'S', 'G', 'H'] as const) {
    const nameKey = `Field ${t} name`;
    const srcNames = t === 'P' ? raw['Field I name'] : raw[nameKey];
    if (!srcNames) continue;
    const names = srcNames.split(',');
    const pick = (k: string, fallback?: string) => {
      const v = raw[`Field ${t} ${k}`] ?? (fallback ? raw[fallback] : undefined);
      return v ? parseCsvInts(v) : names.map(() => 0);
    };
    defs[t] = {
      names,
      signed: t === 'P' ? pick('signed', 'Field I signed') : pick('signed'),
      predictor: pick('predictor'),
      encoding: pick('encoding'),
    };
  }

  let pNum = 1;
  let pDenom = 1;
  const pInt = raw['P interval'];
  if (pInt) {
    const m = pInt.match(/(\d+)\/(\d+)/);
    if (m) {
      pNum = parseInt(m[1], 10);
      pDenom = parseInt(m[2], 10);
    } else {
      pDenom = parseInt(pInt, 10) || 1;
    }
  }

  let motorMin = 0;
  let motorMax = 2047;
  if (raw['motorOutput']) {
    const mo = parseCsvInts(raw['motorOutput']);
    motorMin = mo[0] ?? 0;
    motorMax = mo[1] ?? 2047;
  }

  const firmware = raw['Firmware revision'] || raw['Firmware type'] || 'Unknown';
  const ver = firmware.match(/(\d+)\.(\d+)/);
  let gyroScale = 1;
  if (raw['gyro_scale'] || raw['gyro.scale']) gyroScale = hexToFloat(raw['gyro_scale'] || raw['gyro.scale']);

  const header: LogHeader = {
    raw,
    defs,
    dataVersion: parseInt(raw['Data version'] || '2', 10),
    minthrottle: parseInt(raw['minthrottle'] || '1150', 10),
    vbatref: parseInt(raw['vbatref'] || '4095', 10),
    motorMin,
    motorMax,
    gyroScale: gyroScale > 0 && gyroScale < 100 ? gyroScale : 1,
    iInterval: Math.max(1, parseInt(raw['I interval'] || '32', 10)),
    pNum,
    pDenom: Math.max(1, pDenom),
    firmware,
    firmwareMajor: ver ? parseInt(ver[1], 10) : 0,
  };
  return { header, dataStart: pos };
}

/** Decode all frames of one log. */
export function parseFrames(bytes: Uint8Array, header: LogHeader, start: number, end: number, cb: ParseCallbacks): ParseResultInfo {
  const I = header.defs.I;
  const P = header.defs.P;
  if (!I || !P) throw new Error('У заголовку логу немає опису полів (Field I name).');

  const n = I.names.length;
  const motor0Index = I.names.indexOf('motor[0]');
  const timeIndex = I.names.indexOf('time');
  const gpsDef = header.defs.G;
  const homeDef = header.defs.H;
  const gpsCoord1Index = gpsDef ? gpsDef.names.indexOf('GPS_coord[1]') : -1;

  let pos = start;
  let nibbleBuf = 0;

  const readByte = (): number => {
    if (pos >= end) throw new EOFError();
    return bytes[pos++];
  };
  const readUVB = (): number => {
    let result = 0;
    let mul = 1;
    for (let i = 0; i < 5; i++) {
      const b = readByte();
      result += (b & 0x7f) * mul;
      if (b < 0x80) return result;
      mul *= 128;
    }
    return 0;
  };
  const readSVB = (): number => {
    const u = readUVB() >>> 0;
    return (u >>> 1) ^ -(u & 1);
  };
  const sx = (v: number, bits: number) => {
    const shift = 32 - bits;
    return (v << shift) >> shift;
  };

  const values = new Array<number>(8).fill(0);

  const readTag2_3S32 = (): number => {
    const lead = readByte();
    switch (lead >> 6) {
      case 0:
        values[0] = sx((lead >> 4) & 0x03, 2);
        values[1] = sx((lead >> 2) & 0x03, 2);
        values[2] = sx(lead & 0x03, 2);
        break;
      case 1: {
        values[0] = sx(lead & 0x0f, 4);
        const b = readByte();
        values[1] = sx(b >> 4, 4);
        values[2] = sx(b & 0x0f, 4);
        break;
      }
      case 2:
        values[0] = sx(lead & 0x3f, 6);
        values[1] = sx(readByte() & 0x3f, 6);
        values[2] = sx(readByte() & 0x3f, 6);
        break;
      case 3:
        readTagSizes(lead);
        break;
    }
    return 3;
  };
  const readTagSizes = (lead: number) => {
    let sel = lead;
    for (let i = 0; i < 3; i++) {
      switch (sel & 0x03) {
        case 0:
          values[i] = sx(readByte(), 8);
          break;
        case 1: {
          const b1 = readByte();
          const b2 = readByte();
          values[i] = sx(b1 | (b2 << 8), 16);
          break;
        }
        case 2: {
          const b1 = readByte();
          const b2 = readByte();
          const b3 = readByte();
          values[i] = sx(b1 | (b2 << 8) | (b3 << 16), 24);
          break;
        }
        case 3: {
          const b1 = readByte();
          const b2 = readByte();
          const b3 = readByte();
          const b4 = readByte();
          values[i] = b1 | (b2 << 8) | (b3 << 16) | (b4 << 24);
          break;
        }
      }
      sel >>= 2;
    }
  };
  const readTag2_3SVariable = (): number => {
    const lead = readByte();
    switch (lead >> 6) {
      case 0:
        values[0] = sx((lead >> 4) & 0x03, 2);
        values[1] = sx((lead >> 2) & 0x03, 2);
        values[2] = sx(lead & 0x03, 2);
        break;
      case 1: {
        values[0] = sx((lead & 0x3e) >> 1, 5);
        const b1 = readByte();
        values[1] = sx(((lead & 0x01) << 4) | ((b1 & 0xf0) >> 4), 5);
        values[2] = sx(b1 & 0x0f, 4);
        break;
      }
      case 2: {
        const b1 = readByte();
        values[0] = sx(((lead & 0x3f) << 2) | ((b1 & 0xc0) >> 6), 8);
        const b2 = readByte();
        values[1] = sx(((b1 & 0x3f) << 1) | ((b2 & 0x80) >> 7), 7);
        values[2] = sx(b2 & 0x7f, 7);
        break;
      }
      case 3:
        readTagSizes(lead);
        break;
    }
    return 3;
  };
  const readTag8_4S16 = (): number => {
    let sel = readByte();
    let nibbleIndex = 0;
    for (let i = 0; i < 4; i++) {
      switch (sel & 0x03) {
        case 0:
          values[i] = 0;
          break;
        case 1:
          if (nibbleIndex === 0) {
            nibbleBuf = readByte();
            values[i] = sx(nibbleBuf >> 4, 4);
            nibbleIndex = 1;
          } else {
            values[i] = sx(nibbleBuf & 0x0f, 4);
            nibbleIndex = 0;
          }
          break;
        case 2:
          if (nibbleIndex === 0) {
            values[i] = sx(readByte(), 8);
          } else {
            let c1 = (nibbleBuf << 4) & 0xff;
            nibbleBuf = readByte();
            c1 |= nibbleBuf >> 4;
            values[i] = sx(c1, 8);
          }
          break;
        case 3:
          if (nibbleIndex === 0) {
            const c1 = readByte();
            const c2 = readByte();
            values[i] = sx((c1 << 8) | c2, 16);
          } else {
            let c1 = (nibbleBuf << 4) & 0xff;
            nibbleBuf = readByte();
            c1 |= nibbleBuf >> 4;
            let c2 = (nibbleBuf << 4) & 0xff;
            nibbleBuf = readByte();
            c2 |= nibbleBuf >> 4;
            values[i] = sx((c1 << 8) | c2, 16);
          }
          break;
      }
      sel >>= 2;
    }
    return 4;
  };
  const readTag8_8SVB = (count: number): number => {
    if (count === 1) {
      values[0] = readSVB();
      return 1;
    }
    const head = readByte();
    for (let i = 0; i < 8; i++) values[i] = head & (1 << i) ? readSVB() : 0;
    return Math.min(8, count);
  };

  let lastMainTime = 0;
  let gpsHome = [0, 0];

  const decode = (
    def: FrameDef,
    predictors: number[],
    encodings: number[],
    out: number[],
    prev: number[] | null,
    prev2: number[] | null,
    skipped: number,
    kind: 'main' | 'gps' | 'other',
  ) => {
    const count = def.names.length;
    let i = 0;
    while (i < count) {
      const pred = predictors[i];
      if (pred === PRED_INC) {
        out[i] = skipped + 1 + (prev ? prev[i] : 0);
        i++;
        continue;
      }
      const enc = encodings[i];
      let got = 1;
      switch (enc) {
        case ENC_SIGNED_VB:
          values[0] = readSVB();
          break;
        case ENC_UNSIGNED_VB:
          values[0] = readUVB();
          break;
        case ENC_NEG_14BIT:
          values[0] = -sx(readUVB(), 14);
          break;
        case ENC_TAG8_4S16:
          got = readTag8_4S16();
          break;
        case ENC_TAG2_3S32:
          got = readTag2_3S32();
          break;
        case ENC_TAG2_3SVARIABLE:
          got = readTag2_3SVariable();
          break;
        case ENC_TAG8_8SVB: {
          let group = 1;
          while (group < 8 && i + group < count && encodings[i + group] === ENC_TAG8_8SVB) group++;
          got = readTag8_8SVB(group);
          break;
        }
        case ENC_NULL:
          values[0] = 0;
          break;
        default:
          throw new Error('bad encoding ' + enc);
      }
      for (let j = 0; j < got && i < count; j++, i++) {
        let v = values[j];
        const p = predictors[i];
        switch (p) {
          case PRED_0:
            break;
          case PRED_PREVIOUS:
            if (prev) v += prev[i];
            break;
          case PRED_STRAIGHT_LINE:
            if (prev) v += 2 * prev[i] - (prev2 ? prev2[i] : prev[i]);
            break;
          case PRED_AVERAGE_2:
            if (prev) v += Math.trunc((prev[i] + (prev2 ? prev2[i] : prev[i])) / 2);
            break;
          case PRED_MINTHROTTLE:
            v += header.minthrottle;
            break;
          case PRED_MOTOR_0:
            if (motor0Index >= 0) v += out[motor0Index];
            break;
          case PRED_HOME_COORD:
            v += kind === 'gps' && i === gpsCoord1Index ? gpsHome[1] : gpsHome[0];
            break;
          case PRED_1500:
            v += 1500;
            break;
          case PRED_VBATREF:
            v += header.vbatref;
            break;
          case PRED_LAST_MAIN_FRAME_TIME:
            v += lastMainTime;
            break;
          case PRED_MINMOTOR:
            v += header.motorMin;
            break;
          default:
            break;
        }
        out[i] = v;
      }
    }
  };

  // frame history for main frames
  const buffers = [0, 1, 2].map(() => new Array<number>(n).fill(0));
  let cur = buffers[0];
  let lastSkipped = 0;
  let prev: number[] | null = null;
  let prev2: number[] | null = null;
  let mainValid = false;
  let frameIndex = 0;
  const slow = header.defs.S ? new Array<number>(header.defs.S.names.length).fill(0) : null;
  const gps = gpsDef ? new Array<number>(gpsDef.names.length).fill(0) : null;
  const home = homeDef ? new Array<number>(homeDef.names.length).fill(0) : null;
  let lastGps: number[] | null = null;

  const info: ParseResultInfo = { mainFrames: 0, corruptFrames: 0, slowFrames: 0, gpsFrames: 0, bytes: end - start, endedCleanly: false };

  const shouldHaveFrame = (idx: number) => ((idx % header.iInterval) + header.pNum - 1) % header.pDenom < header.pNum;
  const countSkipped = () => {
    let skipped = 0;
    let idx = frameIndex + 1;
    while (!shouldHaveFrame(idx) && skipped < 1000) {
      skipped++;
      idx++;
    }
    return skipped;
  };

  const isFrameStart = (b: number) => b === 0x49 || b === 0x50 || b === 0x53 || b === 0x47 || b === 0x48 || b === 0x45;

  while (pos < end) {
    const frameStart = pos;
    const type = bytes[pos++];
    try {
      let accepted = true;
      let mainKind: 'I' | 'P' | null = null;
      switch (type) {
        case 0x49: // I
          decode(I, I.predictor, I.encoding, cur, prev, null, 0, 'main');
          mainKind = 'I';
          break;
        case 0x50: {
          // P
          lastSkipped = countSkipped();
          decode(P, P.predictor, P.encoding, cur, prev, prev2, lastSkipped, 'main');
          mainKind = 'P';
          if (!mainValid) accepted = false;
          break;
        }
        case 0x53: // S
          if (!slow || !header.defs.S) throw new Error('no S def');
          decode(header.defs.S, header.defs.S.predictor, header.defs.S.encoding, slow, null, null, 0, 'other');
          break;
        case 0x47: // G
          if (!gps || !gpsDef) throw new Error('no G def');
          decode(gpsDef, gpsDef.predictor, gpsDef.encoding, gps, lastGps, null, 0, 'gps');
          break;
        case 0x48: // H (GPS home)
          if (!home || !homeDef) throw new Error('no H def');
          decode(homeDef, homeDef.predictor, homeDef.encoding, home, null, null, 0, 'other');
          break;
        case 0x45: {
          // E
          const ev = readEvent();
          if (ev === 'end') {
            info.endedCleanly = true;
            return info;
          }
          if (ev) cb.onEvent?.(ev);
          break;
        }
        default:
          throw new Error('bad frame type');
      }

      // Validate: next byte must start a new frame (or be EOF)
      if (pos < end && !isFrameStart(bytes[pos])) throw new Error('desync');

      if (mainKind) {
        if (timeIndex >= 0 && prev && mainValid) {
          const dt = cur[timeIndex] - prev[timeIndex];
          if (dt < 0 || dt > 10_000_000) {
            if (mainKind === 'P') throw new Error('time jump');
          }
        }
        if (accepted) {
          if (mainKind === 'I') {
            mainValid = true;
            frameIndex = 0;
          } else {
            frameIndex += 1 + lastSkipped;
          }
          if (timeIndex >= 0) lastMainTime = cur[timeIndex];
          info.mainFrames++;
          cb.onMain(cur, mainKind === 'I');
          // rotate history through 3 reusable buffers
          if (mainKind === 'I') {
            prev = cur;
            prev2 = cur;
          } else {
            prev2 = prev;
            prev = cur;
          }
          cur = buffers.find((b) => b !== prev && b !== prev2) as number[];
        }
      } else if (type === 0x53 && slow) {
        info.slowFrames++;
        cb.onSlow?.(slow);
      } else if (type === 0x47 && gps) {
        info.gpsFrames++;
        lastGps = gps.slice();
        cb.onGps?.(gps);
      } else if (type === 0x48 && home) {
        gpsHome = [home[0] ?? 0, home[1] ?? 0];
      }
    } catch (e) {
      if (e instanceof EOFError) break;
      info.corruptFrames++;
      mainValid = false;
      prev = null;
      prev2 = null;
      pos = frameStart + 1;
      // resync: skip to the next plausible I frame
      while (pos < end && bytes[pos] !== 0x49) pos++;
    }
  }
  return info;

  function readEvent(): FlightEvent | 'end' | null {
    const t = readByte();
    switch (t) {
      case 0:
        return { type: 'Sync beep', timeUs: readUVB() };
      case 13: {
        const func = readByte();
        if (func & 0x80) {
          readByte();
          readByte();
          readByte();
          readByte();
        } else readSVB();
        return { type: 'Inflight adjustment', detail: `func ${func & 0x7f}` };
      }
      case 14: {
        readUVB();
        const time = readUVB();
        return { type: 'Logging resume', timeUs: time };
      }
      case 15: {
        const reason = readUVB();
        return { type: 'Disarm', timeUs: lastMainTime, detail: DISARM_REASONS[reason] ?? `reason ${reason}` };
      }
      case 30: {
        const flags = readUVB();
        readUVB();
        return { type: 'Flight mode', timeUs: lastMainTime, detail: describeFlightModes(flags) };
      }
      case 255: {
        // "End of log\0"
        return 'end';
      }
      default:
        throw new Error('unknown event');
    }
  }
}

export const DISARM_REASONS: Record<number, string> = {
  0: 'Arming disabled',
  1: 'Failsafe',
  2: 'Throttle timeout',
  3: 'Sticks',
  4: 'Switch',
  5: 'Crash protection',
  6: 'Runaway takeoff',
  7: 'GPS rescue',
  8: 'Serial command',
};

const FLIGHT_MODE_BITS: [number, string][] = [
  [0, 'ANGLE'],
  [1, 'HORIZON'],
  [2, 'MAG'],
  [3, 'ALTHOLD'],
  [4, 'GPS_HOME'],
  [5, 'GPS_HOLD'],
  [6, 'HEADFREE'],
  [8, 'PASSTHRU'],
  [10, 'FAILSAFE'],
  [11, 'GPS_RESCUE'],
];

export function describeFlightModes(flags: number): string {
  const names = FLIGHT_MODE_BITS.filter(([bit]) => flags & (1 << bit)).map(([, n]) => n);
  return names.length ? names.join(' + ') : 'ACRO';
}
