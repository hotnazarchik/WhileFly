import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { UserProfile } from '../../api/client';
import { Avatar } from '../../components/social';
import { Button, Card, KV, Row, Stat, StatGrid, styles } from '../../components/ui';
import { DRONE_CLASSES, DroneClass } from '../../state/AppContext';
import { useAuth, useServerEvents } from '../../state/AuthContext';
import { colors } from '../../theme';

export default function UserProfileScreen({ route, navigation }: any) {
  const userId: number = route.params.userId;
  const { api } = useAuth();
  const [p, setP] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api.user(userId).then(setP).catch((e) => setError(e.message)), [api, userId]);
  useEffect(() => void load(), [load]);
  useServerEvents((e) => e.type === 'friends' && load());

  useEffect(() => {
    if (p) navigation.setOptions({ title: p.callsign });
  }, [p]);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const message = () =>
    act(async () => {
      const chat = await api.openDirect(userId);
      navigation.navigate('Chat', { chatId: chat.id, title: p?.callsign });
    });

  if (!p) {
    return (
      <View style={[styles.screen, { padding: 24 }]}>
        {error ? <Text style={{ color: colors.danger }}>{error}</Text> : <ActivityIndicator color={colors.accent} />}
      </View>
    );
  }

  const hours = (p.stats?.flightSec ?? 0) / 3600;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card>
        <Row style={{ gap: 14 }}>
          <Avatar name={p.callsign} size={64} online={p.online} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800' }}>{p.callsign}</Text>
            <Text style={styles.muted}>{p.name}</Text>
            <Text style={[styles.muted, { fontSize: 12 }]}>
              {p.online ? '● онлайн' : 'офлайн'} · з {new Date(p.createdAt).toLocaleDateString('uk-UA')}
            </Text>
          </View>
        </Row>
        {p.bio ? <Text style={[styles.text, { marginTop: 12 }]}>{p.bio}</Text> : null}
        <View style={{ marginTop: 14, gap: 8 }}>
          {busy ? <ActivityIndicator color={colors.accent} /> : null}
          {!busy && p.relation === 'none' ? <Button title="Додати в побратими" onPress={() => act(() => api.addFriend(userId))} /> : null}
          {!busy && p.relation === 'outgoing' ? <Button title="Скасувати запит" variant="ghost" onPress={() => act(() => api.removeFriend(userId))} /> : null}
          {!busy && p.relation === 'incoming' ? (
            <Row>
              <Button title="Прийняти" onPress={() => act(() => api.acceptFriend(userId))} style={{ flex: 1 }} />
              <Button title="Відхилити" variant="ghost" onPress={() => act(() => api.removeFriend(userId))} style={{ flex: 1 }} />
            </Row>
          ) : null}
          {!busy && p.relation === 'friend' ? (
            <>
              <Button title="Написати" onPress={message} />
              <Button title="Видалити з побратимів" variant="ghost" onPress={() => act(() => api.removeFriend(userId))} />
            </>
          ) : null}
        </View>
        {error ? <Text style={{ color: colors.danger, marginTop: 8 }}>{error}</Text> : null}
      </Card>

      {p.stats ? (
        <Card title="Наліт">
          <StatGrid>
            <Stat label="Польотів" value={String(p.stats.flights ?? 0)} small />
            <Stat label="Наліт" value={hours >= 1 ? hours.toFixed(1) : ((p.stats.flightSec ?? 0) / 60).toFixed(0)} unit={hours >= 1 ? 'год' : 'хв'} small />
            <Stat label="Рекорд" value={p.stats.fastestKmh ? p.stats.fastestKmh.toFixed(0) : '—'} unit="км/год" small />
          </StatGrid>
        </Card>
      ) : null}

      {p.drones ? (
        <Card title="Борти">
          {!p.drones.length ? <Text style={styles.muted}>Не вказано.</Text> : null}
          {p.drones.map((d, i) => (
            <KV key={i} k={d.name} v={`${DRONE_CLASSES[d.cls as DroneClass]?.label ?? d.cls} · ${d.weightG} г · до ${d.maxWind} м/с`} />
          ))}
        </Card>
      ) : (
        <Text style={[styles.muted, { textAlign: 'center' }]}>Борти й наліт видно лише побратимам.</Text>
      )}
    </ScrollView>
  );
}
