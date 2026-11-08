import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Chat, chatPeer, chatTitle } from '../../api/client';
import { Avatar } from '../../components/social';
import { Button, Card, Row, ScreenHeader, styles } from '../../components/ui';
import { useAuth, useServerEvents } from '../../state/AuthContext';
import { colors, radius } from '../../theme';

export default function ChatsListScreen({ navigation }: any) {
  const { api, user, connected, setUnreadTotal } = useAuth();
  const [chats, setChats] = useState<Chat[] | null>(null);
  const [incoming, setIncoming] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [c, f] = await Promise.all([api.chats(), api.friends()]);
      setChats(c);
      setIncoming(f.incoming.length);
      setUnreadTotal(c.reduce((s, x) => s + x.unread, 0));
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  }, [api]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useServerEvents((e) => {
    if (e.type === 'message' || e.type === 'chat' || e.type === 'chat_removed' || e.type === 'friends') load();
  });

  const me = user!;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <FlatList
        data={chats ?? []}
        keyExtractor={(c) => String(c.id)}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.accent} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            <ScreenHeader
              title="Побратими"
              subtitle={`@${me.callsign} · ${connected ? 'онлайн' : "з'єднання…"}`}
              right={<View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: connected ? colors.ok : colors.warn }} />}
            />
            <Row>
              <Pressable onPress={() => navigation.navigate('Friends')} style={tileStyle}>
                <Ionicons name="people" size={20} color={colors.accent} />
                <Text style={styles.text}>Побратими</Text>
                {incoming ? (
                  <View style={badgeStyle}>
                    <Text style={badgeText}>{incoming}</Text>
                  </View>
                ) : null}
              </Pressable>
              <Pressable onPress={() => navigation.navigate('NewGroup')} style={tileStyle}>
                <Ionicons name="add-circle" size={20} color={colors.accent} />
                <Text style={styles.text}>Новий загін</Text>
              </Pressable>
            </Row>
            {error ? (
              <Card style={{ borderColor: colors.danger }}>
                <Text style={{ color: colors.danger }}>{error}</Text>
              </Card>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          chats ? (
            <Card title="Ще немає чатів">
              <Text style={[styles.muted, { marginBottom: 12 }]}>Знайди побратимів за позивним, додай їх і напиши перше повідомлення або створи загін.</Text>
              <Button title="Знайти побратимів" onPress={() => navigation.navigate('Friends')} />
            </Card>
          ) : undefined
        }
        renderItem={({ item }) => {
          const peer = chatPeer(item, me.id);
          const title = chatTitle(item, me.id);
          const last = item.lastMessage;
          const sender = last && item.kind === 'group' && last.kind !== 'system' ? (last.senderId === me.id ? 'Ти: ' : `${item.members.find((m) => m.id === last.senderId)?.callsign ?? '?'}: `) : last?.senderId === me.id && last.kind !== 'system' ? 'Ти: ' : '';
          const preview = last ? (last.kind === 'log' ? '📊 Лог польоту' + (last.text ? ` — ${last.text}` : '') : last.text) : 'Немає повідомлень';
          return (
            <Pressable onPress={() => navigation.navigate('Chat', { chatId: item.id, title })} style={rowStyle}>
              {item.kind === 'group' ? (
                <View style={[groupIcon]}>
                  <Ionicons name="people" size={20} color={colors.accentText} />
                </View>
              ) : (
                <Avatar name={title} online={peer?.online} />
              )}
              <View style={{ flex: 1 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text style={[styles.text, { fontWeight: '700', flex: 1 }]} numberOfLines={1}>
                    {title}
                  </Text>
                  {last ? <Text style={[styles.muted, { fontSize: 11 }]}>{timeLabel(last.createdAt)}</Text> : null}
                </Row>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text style={[styles.muted, { flex: 1 }]} numberOfLines={1}>
                    {sender}
                    {preview}
                  </Text>
                  {item.unread ? (
                    <View style={badgeStyle}>
                      <Text style={badgeText}>{item.unread}</Text>
                    </View>
                  ) : null}
                </Row>
              </View>
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

export function timeLabel(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' });
}

const tileStyle = {
  flex: 1,
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  gap: 8,
  backgroundColor: colors.card,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: radius.md,
  padding: 12,
};
const rowStyle = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  gap: 12,
  backgroundColor: colors.card,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: radius.md,
  padding: 10,
};
const groupIcon = { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.accent, alignItems: 'center' as const, justifyContent: 'center' as const };
const badgeStyle = { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.accent, alignItems: 'center' as const, justifyContent: 'center' as const, paddingHorizontal: 6 };
const badgeText = { color: colors.accentText, fontSize: 11, fontWeight: '800' as const };
