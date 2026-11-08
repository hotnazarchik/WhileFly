import { buildCrsfFrame, CRSF } from './crsf';

export type TransportMode = 'demo' | 'websocket' | 'udp';
export type ConnStatus = 'idle' | 'connecting' | 'connected' | 'error';

export interface ConnectOptions {
  mode: TransportMode;
  host: string;
  port: number;
  onBytes(bytes: Uint8Array): void;
  onStatus(status: ConnStatus, message?: string): void;
}

/** Opens a byte stream from the ELRS Backpack (or the built-in simulator). Returns a disconnect function. */
export function connect(opts: ConnectOptions): () => void {
  switch (opts.mode) {
    case 'demo':
      return startSimulator(opts);
    case 'websocket':
      return connectWebSocket(opts);
    case 'udp':
      return connectUdp(opts);
  }
}

function connectWebSocket({ host, port, onBytes, onStatus }: ConnectOptions): () => void {
  onStatus('connecting');
  const url = host.startsWith('ws') ? host : `ws://${host}:${port}/`;
  let closed = false;
  const ws = new WebSocket(url);
  ws.binaryType = 'arraybuffer';
  ws.onopen = () => onStatus('connected', url);
  ws.onmessage = (ev: { data?: unknown }) => {
    const d = ev.data;
    if (d instanceof ArrayBuffer) onBytes(new Uint8Array(d));
    else if (typeof d === 'string') {
      // some bridges send hex strings
      const hex = d.replace(/[^0-9a-f]/gi, '');
      if (hex.length >= 2) {
        const out = new Uint8Array(hex.length >> 1);
        for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
        onBytes(out);
      }
    }
  };
  ws.onerror = () => onStatus('error', `Не вдалося з'єднатися з ${url}`);
  ws.onclose = () => {
    if (!closed) onStatus('error', "З'єднання закрито");
  };
  return () => {
    closed = true;
    ws.close();
    onStatus('idle');
  };
}

function connectUdp({ port, onBytes, onStatus }: ConnectOptions): () => void {
  onStatus('connecting');
  let socket: any = null;
  try {
    // Native module: needs a development build (npx expo run:android), not Expo Go.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const dgram = require('react-native-udp').default ?? require('react-native-udp');
    socket = dgram.createSocket({ type: 'udp4', reusePort: true });
    socket.on('message', (msg: any) => {
      onBytes(msg instanceof Uint8Array ? msg : Uint8Array.from(msg));
    });
    socket.on('error', (e: any) => onStatus('error', String(e?.message ?? e)));
    socket.bind(port, () => onStatus('connected', `UDP :${port}`));
  } catch (e: any) {
    onStatus('error', 'UDP недоступний в Expo Go. Зроби dev build: npx expo run:android. ' + (e?.message ?? ''));
  }
  return () => {
    try {
      socket?.close();
    } catch {}
    onStatus('idle');
  };
}

/** Generates realistic CRSF telemetry so the screen can be tested without hardware. */
function startSimulator({ onBytes, onStatus }: ConnectOptions): () => void {
  onStatus('connected', 'Демо-симулятор');
  const t0 = Date.now();
  let mAh = 0;
  const homeLat = 50.4501;
  const homeLon = 30.5234;

  const u16 = (v: number) => [(v >> 8) & 0xff, v & 0xff];
  const s16 = (v: number) => u16(v < 0 ? v + 0x10000 : v);
  const s32 = (v: number) => [(v >> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];

  const timer = setInterval(() => {
    const t = (Date.now() - t0) / 1000;
    const throttle = 0.45 + 0.25 * Math.sin(t / 3) + 0.1 * Math.sin(t * 1.7);
    const amps = 4 + throttle * 35;
    mAh += (amps * 0.1) / 3.6;
    const volts = 16.6 - mAh / 400 - throttle * 1.4;
    const dist = 80 + 60 * Math.sin(t / 15);
    const rssi = Math.round(45 + dist / 8 + 6 * Math.sin(t * 2.3));
    const lq = Math.max(40, Math.min(100, Math.round(100 - Math.max(0, rssi - 80) * 3 - Math.random() * 3)));

    const frames: Uint8Array[] = [];
    frames.push(
      buildCrsfFrame(CRSF.LINK_STATS, [rssi, rssi + 3, lq, 8, 0, 7, 3, 60, 100, 9].map((v) => (v < 0 ? v + 256 : v) & 0xff)),
    );
    frames.push(buildCrsfFrame(CRSF.BATTERY, [...u16(Math.round(volts * 10)), ...u16(Math.round(amps * 10)), (mAh >> 16) & 0xff, (mAh >> 8) & 0xff, Math.round(mAh) & 0xff, Math.max(0, Math.round(100 - mAh / 13))]));
    frames.push(
      buildCrsfFrame(CRSF.ATTITUDE, [
        ...s16(Math.round(Math.sin(t * 1.3) * 0.35 * 10000)),
        ...s16(Math.round(Math.sin(t * 0.9) * 0.5 * 10000)),
        ...s16(Math.round((((t * 0.4) % (2 * Math.PI)) - Math.PI) * 10000)),
      ]),
    );
    if (Math.round(t * 10) % 5 === 0) {
      const ang = t / 15;
      const lat = homeLat + (dist * Math.cos(ang)) / 111320;
      const lon = homeLon + (dist * Math.sin(ang)) / (111320 * Math.cos((homeLat * Math.PI) / 180));
      frames.push(
        buildCrsfFrame(CRSF.GPS, [
          ...s32(Math.round(lat * 1e7)),
          ...s32(Math.round(lon * 1e7)),
          ...u16(Math.round((40 + throttle * 60) * 10)),
          ...u16(Math.round(((ang * 180) / Math.PI) % 360) * 100),
          ...u16(Math.round(1000 + 30 + 15 * Math.sin(t / 5))),
          12,
        ]),
      );
      frames.push(buildCrsfFrame(CRSF.VARIO, s16(Math.round(Math.cos(t / 5) * 3 * 100))));
      const mode = t % 40 < 30 ? 'ACRO' : 'ANGL';
      frames.push(buildCrsfFrame(CRSF.FLIGHT_MODE, [...Array.from(mode).map((c) => c.charCodeAt(0)), 0]));
    }
    // deliver as one chunk, like a real stream
    const total = frames.reduce((s, f) => s + f.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const f of frames) {
      out.set(f, o);
      o += f.length;
    }
    onBytes(out);
  }, 100);

  return () => {
    clearInterval(timer);
    onStatus('idle');
  };
}
