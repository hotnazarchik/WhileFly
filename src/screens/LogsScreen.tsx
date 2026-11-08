import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { analyzeLog, formatDuration, LogAnalysis, listLogs } from '../blackbox/analyze';
import { sharedFromAnalysis } from '../api/logShare';
import { LineChart } from '../components/LineChart';
import { ShareLogSheet } from '../components/social';
import { Bar, Button, Card, Chip, KV, Row, ScreenHeader, Stat, StatGrid, styles } from '../components/ui';
import { useApp } from '../state/AppContext';
import { colors, seriesColors } from '../theme';

interface OpenedFile {
  name: string;
  uri: string;
  bytes: Uint8Array;
  logCount: number;
  storedUri?: string;
}

export default function LogsScreen({ route, navigation }: any) {
  const { addLog, logs } = useApp();
  const [file, setFile] = useState<OpenedFile | null>(null);
  const [analysis, setAnalysis] = useState<LogAnalysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAllHeaders, setShowAllHeaders] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const logsRef = useRef(logs);
  logsRef.current = logs;

  const runAnalysis = useCallback(
    (f: OpenedFile, index: number, save: boolean) => {
      setBusy(true);
      setError(null);
      // let the spinner render before the heavy synchronous decode
      setTimeout(async () => {
        try {
          const a = analyzeLog(f.bytes, index);
          setAnalysis(a);
          if (save) {
            const already = logsRef.current.some((l) => l.fileName === f.name && l.logIndex === index && Math.abs(l.durationSec - a.durationSec) < 0.5);
            if (!already) {
              const storedUri = f.storedUri ?? (await persistFile(f));
              f.storedUri = storedUri;
              addLog({
                fileName: f.name,
                storedUri,
                logIndex: index,
                craftName: a.craftName,
                firmware: a.firmware,
                durationSec: a.durationSec,
                maxThrottle: a.throttle?.maxPct,
                mAh: a.current?.mAh,
                minCellV: a.battery && a.battery.cells ? a.battery.min / a.battery.cells : undefined,
                maxGyro: a.gyro ? Math.max(a.gyro[0].max, a.gyro[1].max, a.gyro[2].max) : undefined,
                maxSpeedKmh: a.gps?.maxSpeedKmh,
                issues: a.insights.filter((i) => i.level !== 'ok').length,
                issueTexts: a.insights.filter((i) => i.level !== 'ok').map((i) => i.text).slice(0, 6),
                cells: a.battery?.cells || undefined,
                maxAmps: a.current?.max,
              });
            }
          }
        } catch (e: any) {
          setAnalysis(null);
          setError(e?.message ?? String(e));
        } finally {
          setBusy(false);
        }
      }, 50);
    },
    [addLog],
  );

  const loadFromUri = useCallback(
    async (uri: string, name: string, index: number, save: boolean, storedUri?: string) => {
      setBusy(true);
      setError(null);
      setAnalysis(null);
      try {
        const bytes = await new File(uri).bytes();
        const starts = listLogs(bytes);
        if (starts.length === 0) throw new Error('Файл не містить Blackbox логів Betaflight. Підтримуються .bbl / .bfl / .txt з флешки чи SD.');
        const f: OpenedFile = { name, uri, bytes, logCount: starts.length, storedUri };
        setFile(f);
        runAnalysis(f, Math.min(index, starts.length - 1), save);
      } catch (e: any) {
        setError(e?.message ?? String(e));
        setBusy(false);
      }
    },
    [runAnalysis],
  );

  // opened from account history
  useEffect(() => {
    const p = route?.params;
    if (p?.uri) {
      loadFromUri(p.uri, p.name ?? 'log', p.logIndex ?? 0, false, p.uri);
      navigation.setParams({ uri: undefined });
    }
  }, [route?.params?.uri]);

  const pick = async () => {
    // Android: read the system content:// URI directly. Copying into the shared cache makes the
    // file unreadable for expo-file-system in Expo Go (it only allows the app's own sandbox).
    const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: Platform.OS !== 'android', multiple: false });
    if (res.canceled || !res.assets?.length) return;
    const asset = res.assets[0];
    loadFromUri(asset.uri, asset.name ?? 'log.bbl', 0, true);
  };

  const a = analysis;
  const tLabels = (t: number[]): [string, string] => ['0 с', `${(t[t.length - 1] ?? 0).toFixed(0)} с`];

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader title="Blackbox логи" subtitle="Аналіз польотів Betaflight (.bbl / .bfl)" />

        <Button title={file ? 'Відкрити інший лог' : 'Відкрити лог'} onPress={pick} disabled={busy} />

        {file && file.logCount > 1 ? (
          <Card title={`У файлі ${file.logCount} польотів`}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {Array.from({ length: file.logCount }, (_, i) => (
                <Chip key={i} label={`Політ ${i + 1}`} active={a?.index === i} onPress={() => runAnalysis(file, i, true)} />
              ))}
            </View>
          </Card>
        ) : null}

        {busy ? (
          <Card>
            <Row>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.text}>Декодую лог…</Text>
            </Row>
          </Card>
        ) : null}

        {error ? (
          <Card style={{ borderColor: colors.danger }}>
            <Text style={{ color: colors.danger }}>{error}</Text>
          </Card>
        ) : null}

        {!file && !busy ? (
          <Card>
            <Text style={styles.muted}>
              Скопіюй лог з флешки польотника (Betaflight Configurator → Blackbox → «Activate Mass Storage» або SD карта) на телефон і відкрий тут. Отримаєш тривалість, батарею, газ, мотори, гіро, GPS, режими польоту, налаштування PID/фільтрів і підказки.
            </Text>
          </Card>
        ) : null}

        {a && !busy ? (
          <>
            <Card title={a.craftName !== '—' ? a.craftName : file?.name}>
              <StatGrid>
                <Stat label="Тривалість" value={formatDuration(a.durationSec)} />
                <Stat label="Частота логу" value={a.sampleRateHz.toFixed(0)} unit="Гц" />
                <Stat label="Кадрів" value={a.info.mainFrames.toLocaleString()} small />
                <Stat label="Пошкоджено" value={String(a.info.corruptFrames)} small color={a.info.corruptFrames ? colors.warn : undefined} />
              </StatGrid>
              <View style={{ marginTop: 12 }}>
                <KV k="Прошивка" v={a.firmware} />
                <KV k="Плата" v={a.board} />
                <KV k="Дата" v={a.logDate} />
                <KV k="Файл" v={file?.name ?? ''} />
              </View>
              <Button title="Поділитися з побратимами" variant="ghost" onPress={() => setShareOpen(true)} style={{ marginTop: 12 }} />
            </Card>

            <Card title="Висновки">
              {a.insights.map((ins, i) => (
                <Row key={i} style={{ alignItems: 'flex-start', marginBottom: 8 }}>
                  <Ionicons
                    name={ins.level === 'ok' ? 'checkmark-circle' : ins.level === 'warn' ? 'warning' : 'alert-circle'}
                    size={18}
                    color={ins.level === 'ok' ? colors.ok : ins.level === 'warn' ? colors.warn : colors.danger}
                  />
                  <Text style={[styles.text, { flex: 1 }]}>{ins.text}</Text>
                </Row>
              ))}
            </Card>

            {a.battery ? (
              <Card title={`Батарея${a.battery.cells ? ` ${a.battery.cells}S` : ''}`}>
                <StatGrid>
                  <Stat label="Старт" value={a.battery.start.toFixed(2)} unit="В" small />
                  <Stat label="Кінець" value={a.battery.end.toFixed(2)} unit="В" small />
                  <Stat label="Мінімум" value={a.battery.min.toFixed(2)} unit="В" small />
                  <Stat label="Просідання" value={a.battery.sag.toFixed(2)} unit="В" small />
                  {a.current ? <Stat label="Сер. струм" value={a.current.avg.toFixed(1)} unit="А" small /> : null}
                  {a.current ? <Stat label="Пік струму" value={a.current.max.toFixed(1)} unit="А" small /> : null}
                  {a.current ? <Stat label="Спожито" value={a.current.mAh.toFixed(0)} unit="мА·год" small /> : null}
                </StatGrid>
                <View style={{ marginTop: 12 }}>
                  <LineChart
                    series={[{ name: 'Напруга', color: colors.accent, data: a.series.vbat }]}
                    unit="В"
                    height={120}
                    xLabels={tLabels(a.series.t)}
                  />
                  {a.current ? (
                    <View style={{ marginTop: 8 }}>
                      <LineChart series={[{ name: 'Струм', color: colors.warn, data: a.series.amps }]} unit="А" height={100} />
                    </View>
                  ) : null}
                </View>
              </Card>
            ) : null}

            {a.throttle || a.motors ? (
              <Card title="Газ і мотори">
                {a.throttle ? (
                  <StatGrid>
                    <Stat label="Сер. газ" value={a.throttle.avgPct.toFixed(0)} unit="%" small />
                    <Stat label="Макс газ" value={a.throttle.maxPct.toFixed(0)} unit="%" small />
                    <Stat label="Фулл-газ" value={a.throttle.fullThrottleSec.toFixed(1)} unit="с" small />
                  </StatGrid>
                ) : null}
                {a.motors ? (
                  <View style={{ marginTop: 12, gap: 8 }}>
                    {a.motors.avgPct.map((avg, m) => (
                      <Row key={m}>
                        <Text style={[styles.muted, { width: 30 }]}>M{m + 1}</Text>
                        <Bar value={avg} color={seriesColors[m % seriesColors.length]} />
                        <Text style={[styles.muted, { width: 90, textAlign: 'right' }]}>
                          {avg.toFixed(0)}% / max {a.motors!.maxPct[m].toFixed(0)}%
                        </Text>
                      </Row>
                    ))}
                    <Text style={styles.muted}>Насичення моторів: {a.motors.saturationPct.toFixed(1)}% часу</Text>
                  </View>
                ) : null}
                <View style={{ marginTop: 12 }}>
                  <LineChart
                    series={[
                      { name: 'Газ', color: colors.text, data: a.series.throttle },
                      ...a.series.motors.map((d, m) => ({ name: `M${m + 1}`, color: seriesColors[m % seriesColors.length], data: d })),
                    ]}
                    unit="%"
                    height={150}
                    fixedMin={0}
                    fixedMax={100}
                    xLabels={tLabels(a.series.t)}
                  />
                </View>
              </Card>
            ) : null}

            {a.gyro ? (
              <Card title="Гіроскоп">
                <StatGrid>
                  <Stat label="Roll max" value={a.gyro[0].max.toFixed(0)} unit="°/с" small />
                  <Stat label="Pitch max" value={a.gyro[1].max.toFixed(0)} unit="°/с" small />
                  <Stat label="Yaw max" value={a.gyro[2].max.toFixed(0)} unit="°/с" small />
                </StatGrid>
                <View style={{ marginTop: 12 }}>
                  <LineChart
                    series={[
                      { name: 'Roll', color: seriesColors[0], data: a.series.gyro[0] },
                      { name: 'Pitch', color: seriesColors[1], data: a.series.gyro[1] },
                      { name: 'Yaw', color: seriesColors[2], data: a.series.gyro[2] },
                    ]}
                    unit="°/с"
                    height={150}
                    xLabels={tLabels(a.series.t)}
                  />
                </View>
              </Card>
            ) : null}

            {a.gps ? (
              <Card title="GPS">
                <StatGrid>
                  <Stat label="Макс швидкість" value={a.gps.maxSpeedKmh.toFixed(0)} unit="км/год" small />
                  <Stat label="Макс висота" value={a.gps.maxAltM.toFixed(0)} unit="м" small />
                  <Stat label="Дальність" value={(a.gps.maxDistM / 1000).toFixed(2)} unit="км" small />
                  <Stat label="Супутників" value={String(a.gps.maxSats)} small />
                </StatGrid>
              </Card>
            ) : null}

            {a.rssi ? (
              <Card title="Радіолінк (RSSI)">
                <StatGrid>
                  <Stat label="Мінімум" value={a.rssi.min.toFixed(0)} unit="%" small />
                  <Stat label="Середнє" value={a.rssi.avg.toFixed(0)} unit="%" small />
                </StatGrid>
                <View style={{ marginTop: 12 }}>
                  <LineChart series={[{ name: 'RSSI', color: colors.blue, data: a.series.rssi }]} unit="%" height={100} fixedMin={0} fixedMax={100} />
                </View>
              </Card>
            ) : null}

            {a.flightModes.length || a.events.length ? (
              <Card title="Режими і події">
                {a.flightModes.length ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    {a.flightModes.map((m) => (
                      <View key={m} style={[styles.chip, { paddingVertical: 4 }]}>
                        <Text style={styles.chipText}>{m}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                {a.events.slice(0, 30).map((e, i) => (
                  <KV key={i} k={e.type} v={`${e.detail ?? ''}${e.timeUs ? `  @${(e.timeUs / 1e6).toFixed(1)}с` : ''}`} />
                ))}
              </Card>
            ) : null}

            <Card title="Налаштування (PID / фільтри / rates)">
              {a.keySettings.map(([k, v]) => (
                <KV key={k} k={k} v={v} />
              ))}
              <Pressable onPress={() => setShowAllHeaders((x) => !x)} style={{ marginTop: 10 }}>
                <Text style={{ color: colors.blue, fontWeight: '600' }}>
                  {showAllHeaders ? 'Сховати всі заголовки' : `Показати всі заголовки (${Object.keys(a.header.raw).length})`}
                </Text>
              </Pressable>
              {showAllHeaders
                ? Object.entries(a.header.raw)
                    .filter(([k]) => !k.startsWith('Field '))
                    .map(([k, v]) => <KV key={k} k={k} v={v} />)
                : null}
            </Card>
          </>
        ) : null}
      </ScrollView>
      <ShareLogSheet
        visible={shareOpen}
        log={a ? sharedFromAnalysis(a, file?.name) : null}
        onClose={() => setShareOpen(false)}
        onLogin={() => navigation.navigate('Comms')}
      />
    </SafeAreaView>
  );
}

async function persistFile(f: OpenedFile): Promise<string | undefined> {
  try {
    const dir = new Directory(Paths.document, 'logs');
    dir.create({ intermediates: true, idempotent: true });
    const safeName = f.name.replace(/[^\w.\-]+/g, '_');
    const dest = new File(dir, `${Date.now()}_${safeName}`);
    // write the bytes we already read instead of copying from the picker's cache
    if (!dest.exists) dest.create();
    await dest.write(f.bytes);
    return dest.uri;
  } catch (e) {
    console.warn('Could not persist log', e);
    return undefined;
  }
}
