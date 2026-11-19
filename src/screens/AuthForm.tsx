import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Api } from '../api/client';
import { Button, Card, Chip, Input, Row, styles } from '../components/ui';
import { useAuth } from '../state/AuthContext';
import { colors } from '../theme';
import { tr } from '../i18n';

/** Sign in / sign up form (embedded in the Account tab). */
export default function AuthForm() {
  const { login, register, serverUrl, setServerUrl } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [callsign, setCallsign] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showServer, setShowServer] = useState(false);
  const [server, setServer] = useState(serverUrl);
  const [serverCheck, setServerCheck] = useState<'idle' | 'checking' | 'ok' | 'fail'>('idle');

  const submit = async () => {
    setError(null);
    if (mode === 'register') {
      if (!/^[A-Za-z0-9_-]{3,20}$/.test(callsign.trim())) return setError(tr("Позивний: 3–20 символів, латиниця, цифри, _ або -"));
      if (!name.trim()) return setError(tr("Вкажи ім'я"));
      if (password.length < 8) return setError(tr("Пароль: мінімум 8 символів"));
      if (password !== password2) return setError(tr("Паролі не збігаються"));
    }
    setBusy(true);
    try {
      if (server !== serverUrl) await setServerUrl(server);
      if (mode === 'login') await login(callsign, password);
      else await register(callsign, name, password);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const checkServer = async () => {
    setServerCheck('checking');
    try {
      await new Api(server, null).health();
      await setServerUrl(server);
      setServerCheck('ok');
    } catch {
      setServerCheck('fail');
    }
  };

  return (
    <>

          <Card title={mode === 'login' ? tr("Вхід") : tr("Реєстрація")}>
            <Row style={{ marginBottom: 12 }}>
              <Chip label={tr("Вхід")} active={mode === 'login'} onPress={() => setMode('login')} />
              <Chip label={tr("Реєстрація")} active={mode === 'register'} onPress={() => setMode('register')} />
            </Row>
            <Input label={tr("Позивний")} placeholder={tr("напр. Falcon")} value={callsign} onChangeText={setCallsign} autoCapitalize="none" autoCorrect={false} />
            {mode === 'register' ? <Input label={tr("Ім'я")} placeholder={tr("Як тебе звати")} value={name} onChangeText={setName} /> : null}
            <Input label={tr("Пароль")} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" />
            {mode === 'register' ? <Input label={tr("Повтори пароль")} value={password2} onChangeText={setPassword2} secureTextEntry autoCapitalize="none" /> : null}
            {error ? <Text style={{ color: colors.danger, marginBottom: 10 }}>{error}</Text> : null}
            {busy ? <ActivityIndicator color={colors.accent} /> : <Button title={mode === 'login' ? tr("Увійти") : tr("Створити акаунт")} onPress={submit} />}
            {mode === 'register' ? (
              <Text style={[styles.muted, { marginTop: 10, fontSize: 12 }]}>{tr("Позивний — твій тег у WhileFly. Змінити його потім не можна.")}</Text>
            ) : null}
          </Card>

          <Card>
            <Pressable onPress={() => setShowServer((x) => !x)}>
              <Row>
                <Ionicons name="server-outline" size={16} color={colors.muted} />
                <Text style={[styles.muted, { flex: 1 }]} numberOfLines={1}>
                  {tr("Сервер: ")}{serverUrl}
                </Text>
                <Ionicons name={showServer ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
              </Row>
            </Pressable>
            {showServer ? (
              <View style={{ marginTop: 12 }}>
                <Input label={tr("Адреса сервера WhileFly")} value={server} onChangeText={(t) => { setServer(t); setServerCheck('idle'); }} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
                <Row>
                  <Button title={tr("Перевірити")} variant="ghost" onPress={checkServer} style={{ flex: 1 }} />
                  {serverCheck === 'checking' ? <ActivityIndicator color={colors.accent} /> : null}
                  {serverCheck === 'ok' ? <Ionicons name="checkmark-circle" size={22} color={colors.ok} /> : null}
                  {serverCheck === 'fail' ? <Ionicons name="close-circle" size={22} color={colors.danger} /> : null}
                </Row>
                {serverCheck === 'fail' ? (
                  <Text style={[styles.muted, { marginTop: 8, fontSize: 12 }]}>{tr("Сервер недоступний. Перевір, що він запущений (cd server; npm start) і телефон у тій самій мережі.")}</Text>
                ) : null}
              </View>
            ) : null}
          </Card>
    </>
  );
}
