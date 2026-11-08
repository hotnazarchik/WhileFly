import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Chat, chatPeer, chatTitle, Message } from '../../api/client';
import { sharedFromRecord } from '../../api/logShare';
import { formatDuration } from '../../blackbox/analyze';
import { LogCard } from '../../components/social';
import { Row, styles } from '../../components/ui';
import { useApp } from '../../state/AppContext';
import { useAuth, useServerEvents } from '../../state/AuthContext';
import { colors, radius } from '../../theme';

export default function ChatScreen({ route, navigation }: any) {
  const chatId: number = route.params.chatId;
  const { api, user, notify } = useAuth();
  const { logs } = useApp();
  const me = user!;
  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickLog, setPickLog] = useState(false);
  const lastReadSent = useRef(0);

  const markRead = useCallback(
    (msgs: Message[]) => {
      const last = msgs[msgs.length - 1];
      if (!last || last.id <= lastReadSent.current) return;
      lastReadSent.current = last.id;
      api.markRead(chatId, last.id).then(() => notify({ type: 'chat', chatId })).catch(() => {});
    },
    [api, chatId],
  );

  const loadChat = useCallback(() => api.chat(chatId).then(setChat).catch((e) => setError(e.message)), [api, chatId]);

  useEffect(() => {
    loadChat();
    api
      .messages(chatId)
      .then((m) => {
        setMessages(m);
        setHasMore(m.length === 50);
        markRead(m);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [chatId, api]);

  useLayoutEffect(() => {
    if (!chat) return;
    const peer = chatPeer(chat, me.id);
    navigation.setOptions({
      title: chatTitle(chat, me.id),
      headerRight: () => (
        <Pressable
          hitSlop={10}
          onPress={() => (chat.kind === 'group' ? navigation.navigate('ChatInfo', { chatId }) : peer && navigation.navigate('UserProfile', { userId: peer.id }))}
        >
          <Ionicons name={chat.kind === 'group' ? 'information-circle-outline' : 'person-circle-outline'} size={24} color={colors.text} />
        </Pressable>
      ),
    });
  }, [chat, navigation]);

  useServerEvents((e) => {
    if (e.type === 'message' && e.chatId === chatId) {
      setMessages((prev) => {
        if (prev.some((m) => m.id === e.message.id)) return prev;
        const next = [...prev, e.message];
        markRead(next);
        return next;
      });
    } else if (e.type === 'chat' && e.chatId === chatId) {
      loadChat();
    } else if (e.type === 'chat_removed' && e.chatId === chatId) {
      navigation.popToTop();
    }
  });

  const loadOlder = async () => {
    if (loadingOlder || !hasMore || !messages.length) return;
    setLoadingOlder(true);
    try {
      const older = await api.messages(chatId, messages[0].id);
      setHasMore(older.length === 50);
      setMessages((prev) => [...older.filter((o) => !prev.some((p) => p.id === o.id)), ...prev]);
    } catch {}
    setLoadingOlder(false);
  };

  const append = (m: Message) => setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));

  const send = async () => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    setError(null);
    try {
      append(await api.sendText(chatId, t));
      setText('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  };

  const sendLog = async (idx: number) => {
    setPickLog(false);
    setSending(true);
    try {
      append(await api.sendLog(chatId, sharedFromRecord(logs[idx])));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  };

  const nameOf = (id: number) => chat?.members.find((m) => m.id === id)?.callsign ?? 'колишній учасник';
  const reversed = [...messages].reverse();

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            inverted
            data={reversed}
            keyExtractor={(m) => String(m.id)}
            contentContainerStyle={{ padding: 12, gap: 6 }}
            onEndReached={loadOlder}
            onEndReachedThreshold={0.3}
            ListFooterComponent={loadingOlder ? <ActivityIndicator color={colors.accent} /> : undefined}
            ListEmptyComponent={
              <View style={{ transform: [{ scaleY: -1 }], alignItems: 'center', padding: 24 }}>
                <Text style={styles.muted}>Напиши перше повідомлення 👋</Text>
              </View>
            }
            renderItem={({ item, index }) => {
              if (item.kind === 'system') {
                return (
                  <Text style={[styles.muted, { textAlign: 'center', fontSize: 12, marginVertical: 4 }]}>{item.text}</Text>
                );
              }
              const mine = item.senderId === me.id;
              const older = reversed[index + 1];
              const showName = chat?.kind === 'group' && !mine && (!older || older.senderId !== item.senderId || older.kind === 'system');
              return (
                <View style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}>
                  {showName ? <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '700', marginLeft: 6, marginBottom: 2 }}>{nameOf(item.senderId)}</Text> : null}
                  <View
                    style={{
                      maxWidth: '85%',
                      backgroundColor: mine ? colors.accent : colors.card,
                      borderWidth: mine ? 0 : 1,
                      borderColor: colors.border,
                      borderRadius: radius.md,
                      paddingHorizontal: 10,
                      paddingVertical: 7,
                    }}
                  >
                    {item.kind === 'log' && item.log ? <LogCard log={item.log} dark={mine} /> : null}
                    {item.text ? <Text style={{ color: mine ? colors.accentText : colors.text, fontSize: 15, marginTop: item.kind === 'log' ? 6 : 0 }}>{item.text}</Text> : null}
                    <Text style={{ color: mine ? '#5A4A00' : colors.muted, fontSize: 10, alignSelf: 'flex-end', marginTop: 2 }}>
                      {new Date(item.createdAt).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                </View>
              );
            }}
          />
        )}

        {error ? <Text style={{ color: colors.danger, paddingHorizontal: 12 }}>{error}</Text> : null}

        <Row style={{ padding: 8, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card, alignItems: 'flex-end' }}>
          <Pressable onPress={() => setPickLog(true)} hitSlop={8} style={{ padding: 8 }}>
            <Ionicons name="analytics" size={22} color={colors.accent} />
          </Pressable>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Повідомлення"
            placeholderTextColor={colors.muted}
            selectionColor={colors.accent}
            multiline
            maxLength={4000}
            style={[styles.input, { flex: 1, maxHeight: 120 }]}
          />
          <Pressable onPress={send} disabled={!text.trim() || sending} style={{ padding: 8, opacity: !text.trim() || sending ? 0.4 : 1 }}>
            {sending ? <ActivityIndicator color={colors.accent} /> : <Ionicons name="send" size={22} color={colors.accent} />}
          </Pressable>
        </Row>
      </KeyboardAvoidingView>

      <Modal visible={pickLog} transparent animationType="slide" onRequestClose={() => setPickLog(false)}>
        <Pressable style={{ flex: 1, backgroundColor: '#000a' }} onPress={() => setPickLog(false)} />
        <SafeAreaView edges={['bottom']} style={{ backgroundColor: colors.card, borderTopWidth: 2, borderTopColor: colors.accent, maxHeight: '60%' }}>
          <Text style={[styles.cardTitle, { padding: 16, paddingBottom: 8 }]}>Надіслати лог польоту</Text>
          <FlatList
            data={logs.map((l, i) => ({ l, i }))}
            keyExtractor={(x) => x.l.id}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
            ListEmptyComponent={<Text style={styles.muted}>Історія логів порожня — відкрий лог на вкладці «Логи».</Text>}
            renderItem={({ item: { l, i } }) => (
              <Pressable onPress={() => sendLog(i)} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <Text style={styles.text}>{l.craftName !== '—' ? l.craftName : l.fileName}</Text>
                <Text style={styles.muted}>
                  {new Date(l.addedAt).toLocaleDateString('uk-UA')} · {formatDuration(l.durationSec)}
                  {l.mAh ? ` · ${l.mAh.toFixed(0)} мА·год` : ''}
                </Text>
              </Pressable>
            )}
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
