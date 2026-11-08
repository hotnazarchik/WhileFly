export interface Telemetry {
  // battery
  voltage?: number; // V
  current?: number; // A
  capacity?: number; // mAh used
  batteryPct?: number;
  // link (ELRS LINK_STATISTICS)
  rssi1?: number; // dBm
  rssi2?: number; // dBm
  lq?: number; // %
  snr?: number; // dB
  txPowerMw?: number;
  rfMode?: number;
  activeAntenna?: number;
  downRssi?: number;
  downLq?: number;
  downSnr?: number;
  // gps
  lat?: number;
  lon?: number;
  groundSpeedKmh?: number;
  headingDeg?: number;
  altitudeM?: number;
  sats?: number;
  // attitude (degrees)
  pitch?: number;
  roll?: number;
  yaw?: number;
  vario?: number; // m/s
  baroAltM?: number;
  flightMode?: string;
  armed?: boolean;
  // meta
  lastPacketAt?: number;
  packets?: number;
  protocol?: 'CRSF' | 'MAVLink';
}

export type TelemetryListener = (patch: Partial<Telemetry>) => void;
