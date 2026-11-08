import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text } from 'react-native';
import { FriendsList, PublicUser, Relation } from '../../api/client';
import { UserRow } from '../../components/social';
import { Card, Input, Row, styles } from '../../components/ui';
import { useAuth, useServerEvents } from '../../state/AuthContext';
import { colors, radius } from '../../theme';

export default function FriendsScreen({ navigation }: any) {
  const { api } = useAuth();
  const [list, setList] = useState<FriendsList | null>(null);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<(PublicUser & { relation: Relation })[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => api.friends().then(setList).catch((e) => setError(e.message)), [api]);
  useFocusEffect(useCallback(() => void load(), [load]));
  useServerEvents((e) => e.type === 'friends' && load());

  // debounced search
  useEffect(() => {
    const term = q.trim();
    if (term.length < 1) {
      setResults(null);
      return;
    }
    setSearching(true);
    const t = setTimeout(() => {
      api
        .searchUsers(term)
        .then(setResults)
        .catch((e) => setError(e.message))
        .finally(() => setSearching(false));
    }, 350);
    return () => clearTimeout(t);
  }, [q, api]);

  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await load();
      if (q.trim()) setResults(await api.searchUsers(q.trim()));
    } catch (e: any) {
      setError(e.message);
    }
  };

  const openDm = async (u: PublicUser) => {
    try {
      const chat = await api.openDirect(u.id);
      navigation.navigate('Chat', { chatId: chat.id, title: u.callsign });
    } catch (e: any) {
      setError(e.message);
    }
  };

  const profile = (u: PublicUser) => navigation.navigate('UserProfile', { userId: u.id });

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Card title="Знайти пілота">
        <Input placeholder="Позивний або ім'я" value={q} onChangeText={setQ} autoCapitalize="none" autoCorrect={false} />
        {searching ? <ActivityIndicator color={colors.accent} /> : null}
        {results?.length === 0 && !searching ? <Text style={styles.muted}>Нікого не знайдено.</Text> : null}
        {results?.map((u) => (
          <UserRow
            key={u.id}
            user={u}
            onPress={() => profile(u)}
            right={
              u.relation === 'none' ? (
                <SmallBtn icon="person-add" label="Додати" onPress={() => act(() => api.addFriend(u.id))} primary />
              ) : u.relation === 'incoming' ? (
                <SmallBtn icon="checkmark" label="Прийняти" onPress={() => act(() => api.acceptFriend(u.id))} primary />
              ) : u.relation === 'outgoing' ? (
                <Text style={styles.muted}>Запит надіслано</Text>
              ) : (
                <SmallBtn icon="chatbubble" label="Написати" onPress={() => openDm(u)} />
              )
            }
          />
        ))}
      </Card>

      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}

      {list?.incoming.length ? (
        <Card title={`Запити в побратими (${list.incoming.length})`}>
          {list.incoming.map((u) => (
            <UserRow
              key={u.id}
              user={u}
              onPress={() => profile(u)}
              right={
                <Row>
                  <SmallBtn icon="checkmark" label="Прийняти" onPress={() => act(() => api.acceptFriend(u.id))} primary />
                  <Pressable onPress={() => act(() => api.removeFriend(u.id))} hitSlop={8}>
                    <Ionicons name="close" size={20} color={colors.muted} />
                  </Pressable>
                </Row>
              }
            />
          ))}
        </Card>
      ) : null}

      <Card title={`Мої побратими${list ? ` (${list.friends.length})` : ''}`}>
        {!list ? <ActivityIndicator color={colors.accent} /> : null}
        {list && !list.friends.length ? <Text style={styles.muted}>Поки нікого. Знайди пілотів за позивним вище.</Text> : null}
        {list?.friends.map((u) => (
          <UserRow key={u.id} user={u} onPress={() => profile(u)} right={<SmallBtn icon="chatbubble" label="Написати" onPress={() => openDm(u)} />} />
        ))}
      </Card>

      {list?.outgoing.length ? (
        <Card title="Надіслані запити">
          {list.outgoing.map((u) => (
            <UserRow
              key={u.id}
              user={u}
              onPress={() => profile(u)}
              right={
                <Pressable onPress={() => act(() => api.removeFriend(u.id))}>
                  <Text style={{ color: colors.muted }}>Скасувати</Text>
                </Pressable>
              }
            />
          ))}
        </Card>
      ) : null}
    </ScrollView>
  );
}

export function SmallBtn({ icon, label, onPress, primary }: { icon: any; label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: radius.sm,
        backgroundColor: primary ? colors.accent : colors.cardAlt,
        borderWidth: primary ? 0 : 1,
        borderColor: colors.border,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Ionicons name={icon} size={14} color={primary ? colors.accentText : colors.text} />
      <Text style={{ color: primary ? colors.accentText : colors.text, fontWeight: '700', fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}
