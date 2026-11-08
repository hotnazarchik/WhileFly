import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LineChart } from '../components/LineChart';
import { Bar, Button, Card, Chip, Input, Row, ScreenHeader, styles } from '../components/ui';
import { DRONE_CLASSES, useApp } from '../state/AppContext';
import { colors, scoreColor } from '../theme';
import { Ensemble, fetchEnsemble, fetchForecast, Forecast, Place, searchPlaces } from '../weather/api';
import { bestHours, evaluateHour } from '../weather/scoring';

const WEEKDAYS = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

export default function WeatherScreen() {
  const { drones } = useApp();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [place, setPlace] = useState<Place | null>(null);
  const [fc, setFc] = useState<Forecast | null>(null);
  const [ens, setEns] = useState<Ensemble | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState<string>('');
  const [hour, setHour] = useState<number>(Math.min(23, new Date().getHours() + 1));
  const [droneId, setDroneId] = useState<string | undefined>(drones[0]?.id);

  const drone = drones.find((d) => d.id === droneId) ?? drones[0];

  useEffect(() => {
    if (!droneId && drones[0]) setDroneId(drones[0].id);
  }, [drones]);

  const doSearch = async () => {
    if (query.trim().length < 2) return;
    setError(null);
    try {
      setResults(await searchPlaces(query.trim()));
    } catch (e: any) {
      setError(e.message);
    }
  };

  const useGps = async () => {
    setError(null);
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setError('Немає дозволу на геолокацію');
      return;
    }
    setLoading(true);
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      let name = 'Моє місце';
      try {
        const rev = await Location.reverseGeocodeAsync(pos.coords);
        if (rev[0]) name = rev[0].city || rev[0].district || rev[0].region || name;
      } catch {}
      choosePlace({ name, lat: pos.coords.latitude, lon: pos.coords.longitude });
    } catch (e: any) {
      setError(e.message);
      setLoading(false);
    }
  };

  const choosePlace = async (p: Place) => {
    setPlace(p);
    setResults([]);
    setLoading(true);
    setError(null);
    try {
      const [f, e] = await Promise.all([fetchForecast(p.lat, p.lon), fetchEnsemble(p.lat, p.lon)]);
      setFc(f);
      setEns(e);
      if (!date || !f.daily.date.includes(date)) setDate(f.daily.date[0]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const time = date ? `${date}T${String(hour).padStart(2, '0')}:00` : '';
  const verdict = useMemo(() => (fc && drone && time ? evaluateHour(fc, ens, time, drone) : null), [fc, ens, time, drone]);
  const best = useMemo(() => (fc && drone && date ? bestHours(fc, ens, date, drone) : []), [fc, ens, date, drone]);
  const dayCurve = useMemo(() => {
    if (!fc || !drone || !date) return [];
    return Array.from({ length: 24 }, (_, h) => evaluateHour(fc, ens, `${date}T${String(h).padStart(2, '0')}:00`, drone)?.probability ?? NaN);
  }, [fc, ens, date, drone]);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ScreenHeader title="Погода для польоту" subtitle="Де, коли і на якому борті — і яка ймовірність вдалого польоту" />

        <Card title="1. Де">
          <Row>
            <Input
              placeholder="Місто або місце (напр. Київ)"
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={doSearch}
              returnKeyType="search"
              containerStyle={{ flex: 1, marginBottom: 0 }}
            />
            <Pressable onPress={doSearch} style={{ padding: 10 }}>
              <Ionicons name="search" size={22} color={colors.text} />
            </Pressable>
            <Pressable onPress={useGps} style={{ padding: 10 }}>
              <Ionicons name="locate" size={22} color={colors.accent} />
            </Pressable>
          </Row>
          {results.map((r) => (
            <Pressable key={`${r.lat},${r.lon}`} onPress={() => choosePlace(r)} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={styles.text}>{r.name}</Text>
              <Text style={styles.muted}>{[r.admin, r.country].filter(Boolean).join(', ')}</Text>
            </Pressable>
          ))}
          {place ? (
            <Row style={{ marginTop: 10 }}>
              <Ionicons name="location" size={16} color={colors.accent} />
              <Text style={styles.text}>
                {place.name} <Text style={styles.muted}>({place.lat.toFixed(3)}, {place.lon.toFixed(3)})</Text>
              </Text>
            </Row>
          ) : null}
        </Card>

        {loading ? (
          <Card>
            <Row>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.text}>Завантажую прогноз і ансамбль моделей…</Text>
            </Row>
          </Card>
        ) : null}
        {error ? (
          <Card style={{ borderColor: colors.danger }}>
            <Text style={{ color: colors.danger }}>{error}</Text>
          </Card>
        ) : null}

        {fc ? (
          <Card title="2. Коли">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {fc.daily.date.map((d) => {
                const dt = new Date(d + 'T12:00');
                return <Chip key={d} label={`${WEEKDAYS[dt.getDay()]} ${dt.getDate()}.${String(dt.getMonth() + 1).padStart(2, '0')}`} active={d === date} onPress={() => setDate(d)} />;
              })}
            </ScrollView>
            <View style={{ height: 10 }} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {Array.from({ length: 24 }, (_, h) => (
                <Chip key={h} label={`${String(h).padStart(2, '0')}:00`} active={h === hour} onPress={() => setHour(h)} />
              ))}
            </ScrollView>
          </Card>
        ) : null}

        <Card title="3. На якому борті">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {drones.map((d) => (
              <Chip key={d.id} label={`${d.name} · ${d.maxWind} м/с`} active={d.id === drone?.id} onPress={() => setDroneId(d.id)} />
            ))}
          </View>
          {drone ? (
            <Text style={[styles.muted, { marginTop: 8 }]}>
              {DRONE_CLASSES[drone.cls].label}, {drone.weightG} г — комфортний вітер до {drone.maxWind} м/с. Борти додаються в «Акаунт».
            </Text>
          ) : (
            <Text style={styles.muted}>Додай борт у вкладці «Акаунт».</Text>
          )}
        </Card>

        {verdict ? (
          <>
            <Card>
              <View style={{ alignItems: 'center', paddingVertical: 8 }}>
                <Text style={[styles.muted, { marginBottom: 4 }]}>Ймовірність вдалого польоту</Text>
                <Text style={{ fontSize: 64, fontWeight: '900', color: scoreColor(verdict.probability) }}>{verdict.probability}%</Text>
                <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>{verdict.verdict}</Text>
                <Text style={[styles.muted, { marginTop: 6, textAlign: 'center' }]}>
                  {verdict.method === 'ensemble'
                    ? `За ${verdict.members} сценаріями ансамблю ICON · узгодженість прогнозу ${verdict.confidence}%`
                    : `Детермінований прогноз · надійність на цю дату ~${verdict.confidence}%`}
                </Text>
              </View>
              {verdict.method === 'ensemble' ? (
                <Row style={{ justifyContent: 'space-around', marginTop: 10 }}>
                  <MiniStat label="Вітер в нормі" value={`${verdict.pWindOk?.toFixed(0)}%`} />
                  <MiniStat label="Без опадів" value={`${verdict.pDry?.toFixed(0)}%`} />
                  <MiniStat label="Вітер, діапазон" value={`${verdict.windRange?.[0].toFixed(1)}–${verdict.windRange?.[1].toFixed(1)}`} />
                </Row>
              ) : null}
            </Card>

            <Card title="Фактори">
              {verdict.factors.map((f) => (
                <View key={f.key} style={{ marginBottom: 10 }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Text style={styles.text}>{f.label}</Text>
                    <Text style={styles.muted}>{f.value}</Text>
                  </Row>
                  <View style={{ marginTop: 4, flexDirection: 'row' }}>
                    <Bar value={f.score * 100} color={scoreColor(f.score * 100)} />
                  </View>
                  {f.note ? <Text style={[styles.muted, { fontSize: 12, marginTop: 2 }]}>{f.note}</Text> : null}
                </View>
              ))}
            </Card>

            <Card title="Поради">
              {verdict.advice.map((a, i) => (
                <Row key={i} style={{ alignItems: 'flex-start', marginBottom: 6 }}>
                  <Text style={{ color: colors.accent }}>•</Text>
                  <Text style={[styles.text, { flex: 1 }]}>{a}</Text>
                </Row>
              ))}
            </Card>

            <Card title="Протягом дня">
              <LineChart series={[{ name: 'Ймовірність', color: colors.ok, data: dayCurve }]} unit="%" height={120} fixedMin={0} fixedMax={100} xLabels={['00:00', '23:00']} />
              {best.length ? (
                <>
                  <Text style={[styles.muted, { marginTop: 10, marginBottom: 6 }]}>Найкращі години:</Text>
                  <Row style={{ flexWrap: 'wrap' }}>
                    {best.map((b) => (
                      <Chip key={b.time} label={`${b.time.slice(11, 16)} · ${b.probability}%`} active={b.time === time} onPress={() => setHour(parseInt(b.time.slice(11, 13), 10))} />
                    ))}
                  </Row>
                </>
              ) : null}
            </Card>
          </>
        ) : fc && !loading ? (
          <Card>
            <Text style={styles.muted}>Для обраного часу немає даних прогнозу.</Text>
          </Card>
        ) : null}

        {!place && !loading ? <Button title="Використати моє місцезнаходження" variant="ghost" onPress={useGps} /> : null}
        <Text style={[styles.muted, { fontSize: 11, textAlign: 'center' }]}>Дані: Open-Meteo (ICON, GFS, ECMWF). Завжди перевіряй місцеві правила та NOTAM.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>{value}</Text>
      <Text style={[styles.muted, { fontSize: 11 }]}>{label}</Text>
    </View>
  );
}
