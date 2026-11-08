import { TelemetryListener } from './types';

/**
 * Minimal MAVLink v1/v2 parser for the messages an ELRS link / Backpack forwards
 * when the receiver runs in MAVLink mode (UDP 14550 by default).
 */

// msgid -> CRC_EXTRA
const CRC_EXTRA: Record<number, number> = {
  0: 50, // HEARTBEAT
  1: 124, // SYS_STATUS
  24: 24, // GPS_RAW_INT
  30: 39, // ATTITUDE
  33: 104, // GLOBAL_POSITION_INT
  74: 20, // VFR_HUD
  109: 185, // RADIO_STATUS
};

function crcAccumulate(b: number, crc: number): number {
  let tmp = b ^ (crc & 0xff);
  tmp = (tmp ^ (tmp << 4)) & 0xff;
  return ((crc >> 8) ^ (tmp << 8) ^ (tmp << 3) ^ (tmp >> 4)) & 0xffff;
}

export class MavlinkParser {
  private buf: number[] = [];
  constructor(private onData: TelemetryListener) {}

  push(bytes: Uint8Array) {
    for (let i = 0; i < bytes.length; i++) this.buf.push(bytes[i]);
    this.process();
  }

  private process() {
    const b = this.buf;
    let i = 0;
    while (i < b.length) {
      const stx = b[i];
      if (stx !== 0xfe && stx !== 0xfd) {
        i++;
        continue;
      }
      const v2 = stx === 0xfd;
      const hdr = v2 ? 10 : 6;
      if (b.length - i < hdr) break;
      const len = b[i + 1];
      const sig = v2 && b[i + 2] & 0x01 ? 13 : 0;
      const total = hdr + len + 2 + sig;
      if (b.length - i < total) break;
      const msgId = v2 ? b[i + 7] | (b[i + 8] << 8) | (b[i + 9] << 16) : b[i + 5];
      const extra = CRC_EXTRA[msgId];
      if (extra === undefined) {
        // unknown message: skip it by length (can't verify CRC)
        i += total;
        continue;
      }
      let crc = 0xffff;
      for (let k = i + 1; k < i + hdr + len; k++) crc = crcAccumulate(b[k], crc);
      crc = crcAccumulate(extra, crc);
      const got = b[i + hdr + len] | (b[i + hdr + len + 1] << 8);
      if (crc !== got) {
        i++;
        continue;
      }
      this.handle(msgId, b.slice(i + hdr, i + hdr + len));
      i += total;
    }
    this.buf = b.slice(i);
    if (this.buf.length > 8192) this.buf = [];
  }

  private handle(id: number, payload: number[]) {
    // v2 truncates trailing zeros: pad
    const p = payload.concat(new Array(64).fill(0));
    const dv = new DataView(Uint8Array.from(p).buffer);
    const base = { lastPacketAt: Date.now(), protocol: 'MAVLink' as const };
    const r2d = 180 / Math.PI;
    switch (id) {
      case 0:
        this.onData({ ...base, armed: (dv.getUint8(6) & 0x80) !== 0 });
        break;
      case 1: {
        const mv = dv.getUint16(14, true);
        const ca = dv.getInt16(16, true);
        const rem = dv.getInt8(30);
        this.onData({ ...base, voltage: mv / 1000, current: ca >= 0 ? ca / 100 : undefined, batteryPct: rem >= 0 ? rem : undefined });
        break;
      }
      case 24:
        this.onData({
          ...base,
          lat: dv.getInt32(8, true) / 1e7,
          lon: dv.getInt32(12, true) / 1e7,
          altitudeM: dv.getInt32(16, true) / 1000,
          groundSpeedKmh: (dv.getUint16(24, true) / 100) * 3.6,
          headingDeg: dv.getUint16(26, true) / 100,
          sats: dv.getUint8(29),
        });
        break;
      case 30:
        this.onData({ ...base, roll: dv.getFloat32(4, true) * r2d, pitch: dv.getFloat32(8, true) * r2d, yaw: dv.getFloat32(12, true) * r2d });
        break;
      case 33:
        this.onData({ ...base, baroAltM: dv.getInt32(16, true) / 1000, vario: -dv.getInt16(24, true) / 100 });
        break;
      case 74:
        this.onData({ ...base, groundSpeedKmh: dv.getFloat32(4, true) * 3.6, vario: dv.getFloat32(12, true) });
        break;
      case 109:
        this.onData({ ...base, rssi1: dv.getUint8(4), downRssi: dv.getUint8(5) });
        break;
    }
  }
}
