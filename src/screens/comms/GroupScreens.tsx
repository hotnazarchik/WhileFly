import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { Chat, PublicUser } from '../../api/client';
import { UserRow } from '../../components/social';
import { Button, Card, Input, styles } from '../../components/ui';
import { useAuth, useServerEvents } from '../../state/AuthContext';
import { colors } from '../../theme';

function FriendPicker({ friends, selected, toggle, exclude }: { friends: PublicUser[]; selected: Set<number>; toggle: (id: number) => void; exclude?: Set<number> }) {
  const list = friends.filter((f) => !exclude?.has(f.id));
  if (!list.length) return <Text style={styles.muted}>Немає побратимів, яких можна додати.</Text>;
  return (
    <>
      {list.map((f) => (
        <UserRow
          key={f.id}
          user={f}
          onPress={() => toggle(f.id)}
          right={<Ionicons name={selected.has(f.id) ? 'checkbox' : 'square-outline'} size={22} color={selected.has(f.id) ? colors.accent : colors.muted} />}
        />
      ))}
    </>
  );
}

export function NewGroupScreen({ navigation }: any) {
  const { api } = useAuth();
  const [title, setTitle] = useState('');
  const [friends, setFriends] = useState<PublicUser[] | null>(null);
  const [selected, setSelected] = useState(new Set<number>());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.friends().then((f) => setFriends(f.friends)).catch((e) => setError(e.message));
  }, [api]);

  const toggle = (id: number) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const chat = await api.createGroup(title.trim(), [...selected]);
      navigation.replace('Chat', { chatId: chat.id, title: chat.title });
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Card title="Назва загону">
        <Input placeholder="напр. Ранкові польоти" value={title} onChangeText={setTitle} maxLength={60} />
      </Card>
      <Card title={`Учасники${selected.size ? ` (${selected.size})` : ''}`}>
        {friends ? <FriendPicker friends={friends} selected={selected} toggle={toggle} /> : <ActivityIndicator color={colors.accent} />}
      </Card>
      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
      <Button title={busy ? 'Створюю…' : 'Створити загін'} onPress={create} disabled={busy || !title.trim() || !selected.size} />
    </ScrollView>
  );
}

export function ChatInfoScreen({ route, navigation }: any) {
  const chatId: number = route.params.chatId;
  const { api, user } = useAuth();
  const [chat, setChat] = useState<Chat | null>(null);
  const [friends, setFriends] = useState<PublicUser[]>([]);
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState(new Set<number>());
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => api.chat(chatId).then(setChat).catch((e) => setError(e.message)), [api, chatId]);
  useEffect(() => {
    load();
    api.friends().then((f) => setFriends(f.friends)).catch(() => {});
  }, [load]);
  useServerEvents((e) => e.type === 'chat' && e.chatId === chatId && load());

  const add = async () => {
    try {
      setChat(await api.addMembers(chatId, [...selected]));
      setSelected(new Set());
      setAdding(false);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const leave = () =>
    Alert.alert('Вийти із загону?', 'Ти більше не бачитимеш повідомлення цієї групи.', [
      { text: 'Скасувати', style: 'cancel' },
      {
        text: 'Вийти',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.leaveGroup(chatId);
            navigation.popToTop();
          } catch (e: any) {
            setError(e.message);
          }
        },
      },
    ]);

  if (!chat) return <View style={[styles.screen, { padding: 24 }]}>{error ? <Text style={{ color: colors.danger }}>{error}</Text> : <ActivityIndicator color={colors.accent} />}</View>;

  const memberIds = new Set(chat.members.map((m) => m.id));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card title={chat.title}>
        <Text style={styles.muted}>Створено {new Date(chat.createdAt).toLocaleDateString('uk-UA')} · {chat.members.length} учасників</Text>
      </Card>
      <Card
        title="Учасники"
        right={
          <Pressable onPress={() => setAdding((x) => !x)}>
            <Text style={{ color: colors.accent, fontWeight: '700' }}>{adding ? 'Скасувати' : '+ Додати'}</Text>
          </Pressable>
        }
      >
        {adding ? (
          <View style={{ marginBottom: 12 }}>
            <FriendPicker
              friends={friends}
              exclude={memberIds}
              selected={selected}
              toggle={(id) =>
                setSelected((s) => {
                  const n = new Set(s);
                  n.has(id) ? n.delete(id) : n.add(id);
                  return n;
                })
              }
            />
            <Button title="Додати вибраних" onPress={add} disabled={!selected.size} style={{ marginTop: 10 }} />
          </View>
        ) : null}
        {chat.members.map((m) => (
          <UserRow
            key={m.id}
            user={m}
            onPress={() => m.id !== user!.id && navigation.navigate('UserProfile', { userId: m.id })}
            right={m.id === chat.createdBy ? <Text style={[styles.muted, { fontSize: 11 }]}>засновник</Text> : m.id === user!.id ? <Text style={[styles.muted, { fontSize: 11 }]}>ти</Text> : null}
          />
        ))}
      </Card>
      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
      <Button title="Вийти із загону" variant="danger" onPress={leave} />
    </ScrollView>
  );
}
