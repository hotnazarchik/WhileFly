import { Ionicons } from '@expo/vector-icons';
import { File } from 'expo-file-system';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SharedLog } from '../api/client';
import { sharedFromRecord } from '../api/logShare';
import { formatDuration } from '../blackbox/analyze';
import { ShareLogSheet } from '../components/social';
import { Button, Card, Chip, Input, KV, Row, ScreenHeader, Stat, StatGrid, styles } from '../components/ui';
import { DRONE_CLASSES, DroneClass, estimateMaxWind, LogRecord, useApp } from '../state/AppContext';
import { useAuth } from '../state/AuthContext';
import { colors } from '../theme';

export default function AccountScreen({ navigation }: any) {
  const { profile, setProfile, drones, addDrone, removeDrone, logs, removeLog, updateLog } = useApp();
  const auth = useAuth();
  const online = auth.status === 'authed' ? auth.user : null;
  const [shareLog, setShareLog] = useState<SharedLog | null>(null);
  const [bio, setBio] = useState(online?.bio ?? '');

  // the online account is the source of truth for name & callsign
  useEffect(() => {
    if (online && (online.name !== profile.name || online.callsign !== profile.callsign)) {
      setProfile({ ...profile, name: online.name, callsign: online.callsign });
    }
    if (online) setBio(online.bio);
  }, [online?.id, online?.name, online?.callsign]);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile.name);
  const [callsign, setCallsign] = useState(profile.callsign);
  const [adding, setAdding] = useState(false);
  const [dName, setDName] = useState('');
  const [dCls, setDCls] = useState<DroneClass>('freestyle5');
  const [dWeight, setDWeight] = useState('650');
  const [dWind, setDWind] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const totals = useMemo(() => {
    const time = logs.reduce((s, l) => s + l.durationSec, 0);
    const mAh = logs.reduce((s, l) => s + (l.mAh ?? 0), 0);
    const crafts = new Set(logs.map((l) => l.craftName).filter((c) => c && c !== '—'));
    const fastest = logs.reduce((m, l) => Math.max(m, l.maxSpeedKmh ?? 0), 0);
    return { time, mAh, crafts: crafts.size, fastest };
  }, [logs]);

  const saveProfile = async () => {
    if (online) {
      try {
        auth.setUser({ ...(await auth.api.updateMe({ name: name.trim() || online.name, bio: bio.trim() })), drones: online.drones, stats: online.stats });
      } catch (e: any) {
        Alert.alert('Не вдалося зберегти', e.message);
        return;
      }
    } else {
      setProfile({ ...profile, name: name.trim() || 'Пілот', callsign: callsign.trim() || 'FPV' });
    }
    setEditing(false);
  };

  const weightNum = parseFloat(dWeight) || 0;
  const suggestedWind = estimateMaxWind(dCls, weightNum || DRONE_CLASSES[dCls].refWeight);

  const saveDrone = () => {
    if (!dName.trim()) return;
    addDrone({ name: dName.trim(), cls: dCls, weightG: weightNum || DRONE_CLASSES[dCls].refWeight, maxWind: parseFloat(dWind) || suggestedWind });
    setDName('');
    setDWind('');
    setAdding(false);
  };

  const confirmDeleteLog = (l: LogRecord) => {
    Alert.alert('Видалити лог?', `${l.fileName} буде видалено з історії і з пам'яті телефону.`, [
      { text: 'Скасувати', style: 'cancel' },
      {
        text: 'Видалити',
        style: 'destructive',
        onPress: async () => {
          const shared = logs.some((x) => x.id !== l.id && x.storedUri === l.storedUri);
          if (l.storedUri && !shared) {
            try {
              const file = new File(l.storedUri);
              if (file.exists) file.delete();
            } catch {}
          }
          removeLog(l.id);
        },
      },
    ]);
  };

  const openLog = (l: LogRecord) => {
    if (!l.storedUri) {
      Alert.alert('Файл недоступний', 'Копію цього логу не збережено на телефоні.');
      return;
    }
    navigation.navigate('Logs', { uri: l.storedUri, name: l.fileName, logIndex: l.logIndex });
  };

  const initials = profile.name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ScreenHeader title="Акаунт" subtitle="Профіль, борти та історія польотів" />
        <Card title="Пілот">
          <Row style={{ gap: 14 }}>
            <View style={{ width: 60, height: 60, borderRadius: 4, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 24, fontWeight: '900', color: colors.accentText }}>{initials || 'P'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>{profile.name}</Text>
              <Text style={styles.sub}>Позивний: {profile.callsign} · з {new Date(profile.createdAt).toLocaleDateString('uk-UA')}</Text>
            </View>
            <Pressable
              onPress={() => {
                setName(profile.name);
                setCallsign(profile.callsign);
                setEditing((x) => !x);
              }}
              style={{ padding: 6 }}
            >
              <Ionicons name={editing ? 'close' : 'create-outline'} size={22} color={colors.text} />
            </Pressable>
          </Row>
          {online?.bio && !editing ? <Text style={[styles.text, { marginTop: 10 }]}>{online.bio}</Text> : null}
          {editing ? (
            <View style={{ marginTop: 14 }}>
              <Input label="Ім'я" value={name} onChangeText={setName} />
              {online ? (
                <Input label="Про себе (бачать побратими)" value={bio} onChangeText={setBio} multiline maxLength={300} placeholder="напр. Фрістайл 5&quot;, Київ" />
              ) : (
                <Input label="Позивний" value={callsign} onChangeText={setCallsign} autoCapitalize="characters" />
              )}
              <Button title="Зберегти" onPress={saveProfile} />
            </View>
          ) : null}
        </Card>

        <Card
          title="Онлайн-акаунт"
          right={
            online ? (
              <Row>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: auth.connected ? colors.ok : colors.warn }} />
                <Text style={styles.muted}>{auth.connected ? 'онлайн' : "з'єднання…"}</Text>
              </Row>
            ) : null
          }
        >
          {online ? (
            <>
              <KV k="Позивний" v={'@' + online.callsign} />
              <KV k="Сервер" v={auth.serverUrl} />
              <Text style={[styles.muted, { fontSize: 12, marginVertical: 8 }]}>Борти й статистика нальоту синхронізуються автоматично — їх бачать твої побратими.</Text>
              <Row>
                <Button title="Побратими" onPress={() => navigation.navigate('Comms')} style={{ flex: 1 }} />
                <Button
                  title="Вийти"
                  variant="ghost"
                  style={{ flex: 1 }}
                  onPress={() =>
                    Alert.alert('Вийти з акаунта?', 'Локальні логи й борти залишаться на телефоні.', [
                      { text: 'Скасувати', style: 'cancel' },
                      { text: 'Вийти', style: 'destructive', onPress: () => auth.logout() },
                    ])
                  }
                />
              </Row>
            </>
          ) : (
            <>
              <Text style={[styles.muted, { marginBottom: 10 }]}>Зареєструйся, щоб переписуватися з побратимами, створювати загони й ділитися польотами.</Text>
              <Button title="Увійти / Реєстрація" onPress={() => navigation.navigate('Comms')} />
            </>
          )}
        </Card>

        <Card title="Статистика">
          <StatGrid>
            <Stat label="Польотів" value={String(logs.length)} small />
            <Stat label="Наліт" value={formatHours(totals.time)} small />
            <Stat label="Спожито" value={(totals.mAh / 1000).toFixed(1)} unit="А·год" small />
            <Stat label="Бортів у логах" value={String(totals.crafts)} small />
            <Stat label="Рекорд швидкості" value={totals.fastest ? totals.fastest.toFixed(0) : '—'} unit="км/год" small />
          </StatGrid>
        </Card>

        <Card title="Мої борти" right={<Chip label={adding ? 'Скасувати' : '+ Додати'} onPress={() => setAdding((x) => !x)} />}>
          {adding ? (
            <View style={{ marginBottom: 12 }}>
              <Input label="Назва" placeholder="напр. Apex 5 HD" value={dName} onChangeText={setDName} />
              <Text style={styles.inputLabel}>Клас</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {(Object.keys(DRONE_CLASSES) as DroneClass[]).map((c) => (
                  <Chip key={c} label={DRONE_CLASSES[c].label} active={c === dCls} onPress={() => { setDCls(c); setDWeight(String(DRONE_CLASSES[c].refWeight)); }} />
                ))}
              </View>
              <Row>
                <Input label="Вага з АКБ, г" value={dWeight} onChangeText={setDWeight} keyboardType="numeric" containerStyle={{ flex: 1 }} />
                <Input label={`Макс вітер, м/с (авто ${suggestedWind})`} value={dWind} placeholder={String(suggestedWind)} onChangeText={setDWind} keyboardType="numeric" containerStyle={{ flex: 1 }} />
              </Row>
              <Button title="Зберегти борт" onPress={saveDrone} disabled={!dName.trim()} />
            </View>
          ) : null}
          {drones.map((d) => (
            <Row key={d.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Ionicons name="airplane" size={18} color={colors.accent} />
              <View style={{ flex: 1 }}>
                <Text style={styles.text}>{d.name}</Text>
                <Text style={styles.muted}>
                  {DRONE_CLASSES[d.cls].label} · {d.weightG} г · вітер до {d.maxWind} м/с
                </Text>
              </View>
              <Pressable onPress={() => removeDrone(d.id)} style={{ padding: 6 }}>
                <Ionicons name="trash-outline" size={18} color={colors.muted} />
              </Pressable>
            </Row>
          ))}
          {!drones.length ? <Text style={styles.muted}>Ще немає бортів.</Text> : null}
        </Card>

        <Card title="Історія логів" right={<Text style={styles.muted}>{logs.length}</Text>}>
          {!logs.length ? <Text style={styles.muted}>Відкрий лог на вкладці «Логи» — він з'явиться тут.</Text> : null}
          {logs.map((l) => {
            const open = expanded === l.id;
            return (
              <View key={l.id} style={{ borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 10 }}>
                <Pressable onPress={() => setExpanded(open ? null : l.id)}>
                  <Row>
                    <Ionicons name={l.issues ? 'warning' : 'checkmark-circle'} size={18} color={l.issues ? colors.warn : colors.ok} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.text} numberOfLines={1}>
                        {l.craftName !== '—' ? l.craftName : l.fileName}
                        {l.logIndex ? ` · політ ${l.logIndex + 1}` : ''}
                      </Text>
                      <Text style={styles.muted}>
                        {new Date(l.addedAt).toLocaleString('uk-UA', { dateStyle: 'short', timeStyle: 'short' })} · {formatDuration(l.durationSec)}
                        {l.mAh ? ` · ${l.mAh.toFixed(0)} мА·год` : ''}
                      </Text>
                    </View>
                    <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
                  </Row>
                </Pressable>
                {open ? (
                  <View style={{ marginTop: 8 }}>
                    <KV k="Файл" v={l.fileName} />
                    <KV k="Прошивка" v={l.firmware} />
                    {l.maxThrottle !== undefined ? <KV k="Макс газ" v={`${l.maxThrottle.toFixed(0)}%`} /> : null}
                    {l.minCellV !== undefined ? <KV k="Мін напруга" v={`${l.minCellV.toFixed(2)} В/банку`} /> : null}
                    {l.maxGyro !== undefined ? <KV k="Макс оберти" v={`${l.maxGyro.toFixed(0)} °/с`} /> : null}
                    {l.maxSpeedKmh ? <KV k="Макс швидкість" v={`${l.maxSpeedKmh.toFixed(0)} км/год`} /> : null}
                    <KV k="Попереджень" v={String(l.issues)} />
                    <Input label="Нотатки" value={l.notes ?? ''} onChangeText={(t) => updateLog(l.id, { notes: t })} placeholder="Місце, пропи, що змінив у PID…" multiline containerStyle={{ marginTop: 8 }} />
                    <Row>
                      <Button title="Відкрити" onPress={() => openLog(l)} style={{ flex: 1 }} />
                      <Button title="Поділитися" variant="ghost" onPress={() => setShareLog(sharedFromRecord(l))} style={{ flex: 1 }} />
                    </Row>
                    <Button title="Видалити" variant="ghost" onPress={() => confirmDeleteLog(l)} style={{ marginTop: 8 }} />
                  </View>
                ) : null}
              </View>
            );
          })}
        </Card>

        <Text style={[styles.muted, { fontSize: 11, textAlign: 'center' }]}>Дані акаунта зберігаються локально на пристрої.</Text>
      </ScrollView>
      <ShareLogSheet visible={!!shareLog} log={shareLog} onClose={() => setShareLog(null)} onLogin={() => navigation.navigate('Comms')} />
    </SafeAreaView>
  );
}

function formatHours(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h ? `${h} год ${m} хв` : `${m} хв`;
}
