import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Horizon } from '../components/Horizon';
import { LineChart } from '../components/LineChart';
import { Button, Card, Chip, Input, KV, Row, ScreenHeader, Stat, StatGrid, styles } from '../components/ui';
import { ConnStatus, connect, TransportMode } from '../telemetry/connection';
import { CrsfParser } from '../telemetry/crsf';
import { MavlinkParser } from '../telemetry/mavlink';
import { Telemetry } from '../telemetry/types';
import { colors } from '../theme';

const HISTORY = 150;

const MODES: { key: TransportMode; label: string }[] = [
  { key: 'demo', label: 'Демо' },
  { key: 'websocket', label: 'WebSocket' },
  { key: 'udp', label: 'UDP' },
];

export default function TelemetryScreen() {
  const [mode, setMode] = useState<TransportMode>('demo');
  const [host, setHost] = useState('10.0.0.1');
  const [port, setPort] = useState('14550');
  const [status, setStatus] = useState<ConnStatus>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [tel, setTel] = useState<Telemetry>({});
  const [hist, setHist] = useState<{ lq: number[]; rssi: number[]; volt: number[]; alt: number[] }>({ lq: [], rssi: [], volt: [], alt: [] });
  const [session, setSession] = useState({ minLq: 100, minRssi: 0, maxSpeed: 0, maxAlt: 0, maxDist: 0, minVolt: 0 });

  const live = useRef<Telemetry>({ packets: 0 });
  const home = useRef<[number, number] | null>(null);
  const disconnectRef = useRef<null | (() => void)>(null);

  useEffect(() => () => disconnectRef.current?.(), []);

  // flush accumulated packets into React state at 5 Hz
  useEffect(() => {
    if (status !== 'connected') return;
    const timer = setInterval(() => {
      const t = { ...live.current };
      setTel(t);
      setHist((h) => ({
        lq: push(h.lq, t.lq),
        rssi: push(h.rssi, t.rssi1),
        volt: push(h.volt, t.voltage),
        alt: push(h.alt, t.altitudeM ?? t.baroAltM),
      }));
      let dist = 0;
      if (t.lat !== undefined && t.lon !== undefined && (t.sats ?? 0) >= 5) {
        if (!home.current) home.current = [t.lat, t.lon];
        dist = haversine(home.current[0], home.current[1], t.lat, t.lon);
      }
      setSession((s) => ({
        minLq: t.lq !== undefined ? Math.min(s.minLq, t.lq) : s.minLq,
        minRssi: t.rssi1 !== undefined ? Math.min(s.minRssi, t.rssi1) : s.minRssi,
        maxSpeed: Math.max(s.maxSpeed, t.groundSpeedKmh ?? 0),
        maxAlt: Math.max(s.maxAlt, t.altitudeM ?? t.baroAltM ?? 0),
        maxDist: Math.max(s.maxDist, dist),
        minVolt: t.voltage ? (s.minVolt ? Math.min(s.minVolt, t.voltage) : t.voltage) : s.minVolt,
      }));
    }, 200);
    return () => clearInterval(timer);
  }, [status]);

  const start = () => {
    disconnectRef.current?.();
    live.current = { packets: 0 };
    home.current = null;
    setTel({});
    setHist({ lq: [], rssi: [], volt: [], alt: [] });
    setSession({ minLq: 100, minRssi: 0, maxSpeed: 0, maxAlt: 0, maxDist: 0, minVolt: 0 });
    const onData = (patch: Partial<Telemetry>) => {
      live.current = { ...live.current, ...patch, packets: (live.current.packets ?? 0) + 1 };
    };
    const crsf = new CrsfParser(onData);
    const mav = new MavlinkParser(onData);
    disconnectRef.current = connect({
      mode,
      host: host.trim(),
      port: parseInt(port, 10) || 14550,
      onBytes: (b) => {
        crsf.push(b);
        mav.push(b);
      },
      onStatus: (s, m) => {
        setStatus(s);
        setStatusMsg(m ?? '');
      },
    });
  };

  const stop = () => {
    disconnectRef.current?.();
    disconnectRef.current = null;
  };

  const connected = status === 'connected';
  const stale = tel.lastPacketAt ? Date.now() - tel.lastPacketAt > 1500 : true;
  const cells = tel.voltage ? Math.max(1, Math.round(tel.voltage / 4.15 + 0.3)) : 0;
  const perCell = tel.voltage && cells ? tel.voltage / cells : undefined;
  const dist = home.current && tel.lat !== undefined && tel.lon !== undefined ? haversine(home.current[0], home.current[1], tel.lat, tel.lon) : undefined;

  const warnings: string[] = [];
  if (connected && tel.lq !== undefined && tel.lq < 50) warnings.push(`Низька якість лінку: LQ ${tel.lq}%`);
  if (connected && tel.rssi1 !== undefined && tel.protocol === 'CRSF' && tel.rssi1 < -100) warnings.push(`Слабкий сигнал: ${tel.rssi1} dBm`);
  if (perCell !== undefined && perCell < 3.5) warnings.push(`Низька напруга: ${perCell.toFixed(2)} В/банку — час додому!`);
  if (connected && stale && (tel.packets ?? 0) > 0) warnings.push('Телеметрія не оновлюється > 1.5 с');

  const statusColor = status === 'connected' ? (stale ? colors.warn : colors.ok) : status === 'error' ? colors.danger : colors.muted;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader title="Телеметрія" subtitle="ELRS Backpack у реальному часі (CRSF / MAVLink)" />

        <Card
          title="Підключення"
          right={
            <Row>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: statusColor }} />
              <Text style={styles.muted}>{statusLabel(status)}</Text>
            </Row>
          }
        >
          <Row style={{ marginBottom: 10 }}>
            {MODES.map((m) => (
              <Chip key={m.key} label={m.label} active={mode === m.key} onPress={() => !connected && setMode(m.key)} />
            ))}
          </Row>
          {mode !== 'demo' ? (
            <Row>
              {mode === 'websocket' ? (
                <Input label="IP / URL Backpack" value={host} onChangeText={setHost} autoCapitalize="none" containerStyle={{ flex: 2 }} />
              ) : null}
              <Input label="Порт" value={port} onChangeText={setPort} keyboardType="number-pad" containerStyle={{ flex: 1 }} />
            </Row>
          ) : null}
          <Text style={[styles.muted, { marginBottom: 10 }]}>{modeHint(mode)}</Text>
          {connected || status === 'connecting' ? <Button title="Відключитись" variant="danger" onPress={stop} /> : <Button title="Підключитись" onPress={start} />}
          {statusMsg ? <Text style={[styles.muted, { marginTop: 8 }]}>{statusMsg}</Text> : null}
        </Card>

        {warnings.map((w) => (
          <Card key={w} style={{ borderColor: colors.danger, borderLeftWidth: 4 }}>
            <Row>
              <Ionicons name="warning" size={18} color={colors.danger} />
              <Text style={[styles.text, { flex: 1 }]}>{w}</Text>
            </Row>
          </Card>
        ))}

        <Card title="Лінк" right={<Text style={styles.muted}>{tel.protocol ?? '—'} · {tel.packets ?? 0} пак.</Text>}>
          <StatGrid>
            <Stat label="LQ" value={fmt(tel.lq, 0)} unit="%" color={tel.lq !== undefined ? (tel.lq < 50 ? colors.danger : tel.lq < 80 ? colors.warn : colors.ok) : undefined} small />
            <Stat label="RSSI 1" value={fmt(tel.rssi1, 0)} unit={tel.protocol === 'MAVLink' ? '' : 'dBm'} small />
            <Stat label="RSSI 2" value={fmt(tel.rssi2, 0)} unit="dBm" small />
            <Stat label="SNR" value={fmt(tel.snr, 0)} unit="dB" small />
            <Stat label="TX Power" value={fmt(tel.txPowerMw, 0)} unit="мВт" small />
            <Stat label="Downlink LQ" value={fmt(tel.downLq, 0)} unit="%" small />
          </StatGrid>
          {hist.lq.length > 1 ? (
            <View style={{ marginTop: 12 }}>
              <LineChart series={[{ name: 'LQ', color: colors.ok, data: hist.lq }]} unit="%" height={90} fixedMin={0} fixedMax={100} />
              <View style={{ height: 8 }} />
              <LineChart series={[{ name: 'RSSI', color: colors.blue, data: hist.rssi }]} unit="dBm" height={90} />
            </View>
          ) : null}
        </Card>

        <Card title="Батарея">
          <StatGrid>
            <Stat label="Напруга" value={fmt(tel.voltage, 1)} unit="В" small color={perCell !== undefined && perCell < 3.5 ? colors.danger : undefined} />
            <Stat label="На банку" value={fmt(perCell, 2)} unit={cells ? `В (${cells}S)` : 'В'} small />
            <Stat label="Струм" value={fmt(tel.current, 1)} unit="А" small />
            <Stat label="Спожито" value={fmt(tel.capacity, 0)} unit="мА·год" small />
            <Stat label="Заряд" value={fmt(tel.batteryPct, 0)} unit="%" small />
            <Stat label="Потужність" value={tel.voltage && tel.current ? (tel.voltage * tel.current).toFixed(0) : '—'} unit="Вт" small />
          </StatGrid>
          {hist.volt.length > 1 ? (
            <View style={{ marginTop: 12 }}>
              <LineChart series={[{ name: 'Напруга', color: colors.warn, data: hist.volt }]} unit="В" height={90} />
            </View>
          ) : null}
        </Card>

        <Card title="Положення">
          <Row style={{ alignItems: 'center', gap: 16 }}>
            <Horizon pitch={tel.pitch ?? 0} roll={tel.roll ?? 0} size={150} />
            <View style={{ flex: 1, gap: 8 }}>
              <Stat label="Pitch" value={fmt(tel.pitch, 0)} unit="°" small />
              <Stat label="Roll" value={fmt(tel.roll, 0)} unit="°" small />
              <Stat label="Yaw" value={fmt(tel.yaw, 0)} unit="°" small />
            </View>
          </Row>
          <View style={{ marginTop: 10 }}>
            <KV k="Режим польоту" v={tel.flightMode ?? '—'} />
            <KV k="Стан" v={tel.armed === undefined ? '—' : tel.armed ? 'ARMED' : 'DISARMED'} />
            <KV k="Варіометр" v={tel.vario !== undefined ? `${tel.vario.toFixed(1)} м/с` : '—'} />
          </View>
        </Card>

        <Card title="GPS">
          <StatGrid>
            <Stat label="Швидкість" value={fmt(tel.groundSpeedKmh, 0)} unit="км/год" small />
            <Stat label="Висота" value={fmt(tel.altitudeM ?? tel.baroAltM, 0)} unit="м" small />
            <Stat label="До дому" value={dist !== undefined ? dist.toFixed(0) : '—'} unit="м" small />
            <Stat label="Супутники" value={fmt(tel.sats, 0)} small color={tel.sats !== undefined && tel.sats < 6 ? colors.warn : undefined} />
            <Stat label="Курс" value={fmt(tel.headingDeg, 0)} unit="°" small />
          </StatGrid>
          <View style={{ marginTop: 10 }}>
            <KV k="Координати" v={tel.lat !== undefined && tel.lon !== undefined ? `${tel.lat.toFixed(6)}, ${tel.lon.toFixed(6)}` : '—'} />
          </View>
          {hist.alt.length > 1 ? (
            <View style={{ marginTop: 12 }}>
              <LineChart series={[{ name: 'Висота', color: colors.purple, data: hist.alt }]} unit="м" height={90} />
            </View>
          ) : null}
        </Card>

        <Card title="Сесія">
          <StatGrid>
            <Stat label="Мін LQ" value={String(session.minLq)} unit="%" small />
            <Stat label="Мін RSSI" value={session.minRssi ? String(session.minRssi) : '—'} unit="dBm" small />
            <Stat label="Мін напруга" value={session.minVolt ? session.minVolt.toFixed(1) : '—'} unit="В" small />
            <Stat label="Макс швидкість" value={session.maxSpeed.toFixed(0)} unit="км/год" small />
            <Stat label="Макс висота" value={session.maxAlt.toFixed(0)} unit="м" small />
            <Stat label="Макс дальність" value={session.maxDist.toFixed(0)} unit="м" small />
          </StatGrid>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function push(arr: number[], v: number | undefined): number[] {
  const next = arr.length >= HISTORY ? arr.slice(arr.length - HISTORY + 1) : arr.slice();
  next.push(v ?? NaN);
  return next;
}

function fmt(v: number | undefined, d: number): string {
  return v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d);
}

function statusLabel(s: ConnStatus): string {
  return { idle: 'Не підключено', connecting: 'Підключення…', connected: 'Онлайн', error: 'Помилка' }[s];
}

function modeHint(m: TransportMode): string {
  switch (m) {
    case 'demo':
      return 'Симуляція реального потоку CRSF — щоб перевірити екран без дрона.';
    case 'websocket':
      return "Підключи телефон до Wi-Fi Backpack (або мосту ESP32/ПК), що віддає сирі CRSF/MAVLink байти через WebSocket.";
    case 'udp':
      return 'ELRS Backpack у Wi-Fi режимі шле MAVLink/CRSF на UDP (типово 14550). Потрібен dev build, не Expo Go.';
  }
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
