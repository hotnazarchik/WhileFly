import { TelemetryListener } from './types';

/** CRSF (Crossfire / ExpressLRS) telemetry frame parser. */

const CRSF_SYNC = [0xc8, 0xea, 0xee, 0xec];

export const CRSF = {
  GPS: 0x02,
  VARIO: 0x07,
  BATTERY: 0x08,
  BARO_ALT: 0x09,
  LINK_STATS: 0x14,
  ATTITUDE: 0x1e,
  FLIGHT_MODE: 0x21,
};

const TX_POWER_MW = [0, 10, 25, 100, 500, 1000, 2000, 250, 50];

export function crc8(data: ArrayLike<number>, start: number, end: number): number {
  let crc = 0;
  for (let i = start; i < end; i++) {
    crc ^= data[i];
    for (let b = 0; b < 8; b++) crc = crc & 0x80 ? ((crc << 1) ^ 0xd5) & 0xff : (crc << 1) & 0xff;
  }
  return crc;
}

export class CrsfParser {
  private buf: number[] = [];
  constructor(private onData: TelemetryListener) {}

  push(bytes: Uint8Array) {
    for (let i = 0; i < bytes.length; i++) this.buf.push(bytes[i]);
    this.process();
  }

  private process() {
    const b = this.buf;
    let i = 0;
    while (b.length - i >= 4) {
      if (!CRSF_SYNC.includes(b[i])) {
        i++;
        continue;
      }
      const len = b[i + 1];
      if (len < 2 || len > 62) {
        i++;
        continue;
      }
      if (b.length - i < len + 2) break; // wait for more
      const typeIdx = i + 2;
      const crcIdx = i + 1 + len;
      if (crc8(b, typeIdx, crcIdx) !== b[crcIdx]) {
        i++;
        continue;
      }
      this.handle(b[typeIdx], b.slice(typeIdx + 1, crcIdx));
      i = crcIdx + 1;
    }
    if (i > 0) this.buf = b.slice(i);
    if (this.buf.length > 4096) this.buf = [];
  }

  private handle(type: number, p: number[]) {
    const u16 = (o: number) => (p[o] << 8) | p[o + 1];
    const s16 = (o: number) => {
      const v = u16(o);
      return v & 0x8000 ? v - 0x10000 : v;
    };
    const s32 = (o: number) => (p[o] << 24) | (p[o + 1] << 16) | (p[o + 2] << 8) | p[o + 3];
    const s8 = (o: number) => (p[o] & 0x80 ? p[o] - 0x100 : p[o]);
    const base = { lastPacketAt: Date.now(), protocol: 'CRSF' as const };

    switch (type) {
      case CRSF.GPS:
        if (p.length >= 15)
          this.onData({
            ...base,
            lat: s32(0) / 1e7,
            lon: s32(4) / 1e7,
            groundSpeedKmh: u16(8) / 10,
            headingDeg: u16(10) / 100,
            altitudeM: u16(12) - 1000,
            sats: p[14],
          });
        break;
      case CRSF.VARIO:
        if (p.length >= 2) this.onData({ ...base, vario: s16(0) / 100 });
        break;
      case CRSF.BATTERY:
        if (p.length >= 8)
          this.onData({
            ...base,
            voltage: u16(0) / 10,
            current: u16(2) / 10,
            capacity: (p[4] << 16) | (p[5] << 8) | p[6],
            batteryPct: p[7],
          });
        break;
      case CRSF.BARO_ALT:
        if (p.length >= 2) {
          const raw = u16(0);
          const alt = raw & 0x8000 ? (raw & 0x7fff) : (raw - 10000) / 10;
          this.onData({ ...base, baroAltM: alt });
        }
        break;
      case CRSF.LINK_STATS:
        if (p.length >= 10)
          this.onData({
            ...base,
            rssi1: -p[0],
            rssi2: -p[1],
            lq: p[2],
            snr: s8(3),
            activeAntenna: p[4],
            rfMode: p[5],
            txPowerMw: TX_POWER_MW[p[6]] ?? p[6],
            downRssi: -p[7],
            downLq: p[8],
            downSnr: s8(9),
          });
        break;
      case CRSF.ATTITUDE:
        if (p.length >= 6) {
          const r2d = (v: number) => (v / 10000) * (180 / Math.PI);
          this.onData({ ...base, pitch: r2d(s16(0)), roll: r2d(s16(2)), yaw: r2d(s16(4)) });
        }
        break;
      case CRSF.FLIGHT_MODE: {
        let s = '';
        for (const c of p) {
          if (c === 0) break;
          s += String.fromCharCode(c);
        }
        // Betaflight appends '*' when disarmed
        const armed = !s.endsWith('*');
        this.onData({ ...base, flightMode: s.replace(/\*$/, ''), armed });
        break;
      }
      default:
        break;
    }
  }
}

/** Build a CRSF frame (used by the simulator & tests). */
export function buildCrsfFrame(type: number, payload: number[]): Uint8Array {
  const len = payload.length + 2;
  const frame = [0xc8, len, type, ...payload];
  frame.push(crc8(frame, 2, frame.length));
  return Uint8Array.from(frame);
}
