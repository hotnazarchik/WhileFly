import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Chat, chatTitle, PublicUser, SharedLog } from '../api/client';
import { formatDuration } from '../blackbox/analyze';
import { useAuth } from '../state/AuthContext';
import { colors, radius } from '../theme';
import { Button, Row, styles } from './ui';

export function Avatar({ name, size = 40, online }: { name: string; size?: number; online?: boolean }) {
  const initials = name.replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase() || '?';
  return (
    <View style={{ width: size, height: size }}>
      <View style={{ width: size, height: size, borderRadius: radius.md, backgroundColor: colors.cardHeader, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
        <Text style={{ color: colors.accent, fontWeight: '800', fontSize: size * 0.38 }}>{initials}</Text>
      </View>
      {online !== undefined ? (
        <View
          style={{
            position: 'absolute',
            right: -2,
            bottom: -2,
            width: 12,
            height: 12,
            borderRadius: 6,
            backgroundColor: online ? colors.ok : colors.muted,
            borderWidth: 2,
            borderColor: colors.card,
          }}
        />
      ) : null}
    </View>
  );
}

export function UserRow({ user, right, onPress }: { user: PublicUser; right?: React.ReactNode; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <Avatar name={user.callsign} online={user.online} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.text, { fontWeight: '700' }]}>{user.callsign}</Text>
        <Text style={styles.muted} numberOfLines={1}>
          {user.name}
        </Text>
      </View>
      {right}
    </Pressable>
  );
}

/** Flight log summary as it appears inside chat bubbles. */
export function LogCard({ log, dark }: { log: SharedLog; dark?: boolean }) {
  const fg = dark ? colors.accentText : colors.text;
  const mutedFg = dark ? '#3A3A3A' : colors.muted;
  const items: [string, string][] = [];
  items.push(['Тривалість', formatDuration(log.durationSec)]);
  if (log.cells) items.push(['АКБ', `${log.cells}S`]);
  if (log.minCellV) items.push(['Мін', `${log.minCellV.toFixed(2)} В/б`]);
  if (log.mAh) items.push(['Спожито', `${log.mAh.toFixed(0)} мА·год`]);
  if (log.maxAmps) items.push(['Пік', `${log.maxAmps.toFixed(0)} А`]);
  if (log.maxThrottle !== undefined) items.push(['Газ', `${log.maxThrottle.toFixed(0)}%`]);
  if (log.maxSpeedKmh) items.push(['Швидкість', `${log.maxSpeedKmh.toFixed(0)} км/год`]);
  return (
    <View style={{ minWidth: 220 }}>
      <Row style={{ marginBottom: 6 }}>
        <Ionicons name="analytics" size={16} color={fg} />
        <Text style={{ color: fg, fontWeight: '800', flex: 1 }} numberOfLines={1}>
          {log.craftName || log.fileName || 'Blackbox лог'}
        </Text>
      </Row>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {items.map(([k, v]) => (
          <View key={k}>
            <Text style={{ color: mutedFg, fontSize: 10, textTransform: 'uppercase' }}>{k}</Text>
            <Text style={{ color: fg, fontWeight: '700', fontSize: 13 }}>{v}</Text>
          </View>
        ))}
      </View>
      {log.issues.length ? (
        <View style={{ marginTop: 6, gap: 2 }}>
          {log.issues.slice(0, 3).map((t, i) => (
            <Text key={i} style={{ color: fg, fontSize: 12 }}>
              ⚠ {t}
            </Text>
          ))}
        </View>
      ) : null}
      <Text style={{ color: mutedFg, fontSize: 10, marginTop: 6 }} numberOfLines={1}>
        {log.firmware}
      </Text>
    </View>
  );
}

/** Bottom sheet: pick a chat (or a comrade) and send a flight log summary there. */
export function ShareLogSheet({ log, visible, onClose, onLogin }: { log: SharedLog | null; visible: boolean; onClose: () => void; onLogin?: () => void }) {
  const { api, status, user } = useAuth();
  const [chats, setChats] = useState<Chat[] | null>(null);
  const [friends, setFriends] = useState<PublicUser[]>([]);
  const [sending, setSending] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || status !== 'authed') return;
    setDone(null);
    setError(null);
    setChats(null);
    Promise.all([api.chats(), api.friends()])
      .then(([c, f]) => {
        setChats(c);
        const withChat = new Set(c.filter((x) => x.kind === 'direct').flatMap((x) => x.members.map((m) => m.id)));
        setFriends(f.friends.filter((fr) => !withChat.has(fr.id)));
      })
      .catch((e) => setError(e.message));
  }, [visible, status]);

  const send = async (key: string, getChatId: () => Promise<number>, label: string) => {
    if (!log) return;
    setSending(key);
    setError(null);
    try {
      await api.sendLog(await getChatId(), log);
      setDone(label);
      setTimeout(onClose, 900);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSending(null);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: '#000a' }} onPress={onClose} />
      <SafeAreaView edges={['bottom']} style={{ backgroundColor: colors.card, borderTopWidth: 2, borderTopColor: colors.accent, maxHeight: '75%' }}>
        <View style={{ padding: 16, gap: 12 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={[styles.cardTitle, { fontSize: 17 }]}>Поділитися польотом</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={colors.text} />
            </Pressable>
          </Row>
          {log ? (
            <View style={{ backgroundColor: colors.cardAlt, padding: 10, borderRadius: radius.md }}>
              <LogCard log={log} />
            </View>
          ) : null}
          {status !== 'authed' ? (
            <>
              <Text style={styles.muted}>Щоб ділитися логами з побратимами, увійди в акаунт.</Text>
              <Button title="Увійти" onPress={() => { onClose(); onLogin?.(); }} />
            </>
          ) : done ? (
            <Row>
              <Ionicons name="checkmark-circle" size={20} color={colors.ok} />
              <Text style={styles.text}>Надіслано: {done}</Text>
            </Row>
          ) : chats === null && !error ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <FlatList
              data={[
                ...(chats ?? []).map((c) => ({ key: 'c' + c.id, label: chatTitle(c, user!.id), sub: c.kind === 'group' ? `${c.members.length} учасників` : 'Особистий чат', icon: c.kind === 'group' ? 'people' : 'person', go: async () => c.id })),
                ...friends.map((f) => ({ key: 'f' + f.id, label: f.callsign, sub: 'Новий чат', icon: 'person-add', go: async () => (await api.openDirect(f.id)).id })),
              ]}
              keyExtractor={(i) => i.key}
              ListEmptyComponent={<Text style={styles.muted}>Немає чатів. Додай побратимів у вкладці «Побратими».</Text>}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => send(item.key, item.go, item.label)}
                  disabled={!!sending}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}
                >
                  <Ionicons name={item.icon as any} size={20} color={colors.accent} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.text}>{item.label}</Text>
                    <Text style={styles.muted}>{item.sub}</Text>
                  </View>
                  {sending === item.key ? <ActivityIndicator color={colors.accent} /> : <Ionicons name="send" size={18} color={colors.muted} />}
                </Pressable>
              )}
            />
          )}
          {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
        </View>
      </SafeAreaView>
    </Modal>
  );
}
