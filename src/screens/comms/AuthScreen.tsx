import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Api } from '../../api/client';
import { Button, Card, Chip, Input, Row, ScreenHeader, styles } from '../../components/ui';
import { useAuth } from '../../state/AuthContext';
import { colors } from '../../theme';

export default function AuthScreen() {
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
      if (!/^[A-Za-z0-9_-]{3,20}$/.test(callsign.trim())) return setError('Позивний: 3–20 символів, латиниця, цифри, _ або -');
      if (!name.trim()) return setError("Вкажи ім'я");
      if (password.length < 8) return setError('Пароль: мінімум 8 символів');
      if (password !== password2) return setError('Паролі не збігаються');
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
    <SafeAreaView style={styles.screen} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ScreenHeader title="Побратими" subtitle="Переписка, загони і обмін польотами між пілотами" />

          <Card title={mode === 'login' ? 'Вхід' : 'Реєстрація'}>
            <Row style={{ marginBottom: 12 }}>
              <Chip label="Вхід" active={mode === 'login'} onPress={() => setMode('login')} />
              <Chip label="Реєстрація" active={mode === 'register'} onPress={() => setMode('register')} />
            </Row>
            <Input label="Позивний" placeholder="напр. Falcon" value={callsign} onChangeText={setCallsign} autoCapitalize="none" autoCorrect={false} />
            {mode === 'register' ? <Input label="Ім'я" placeholder="Як тебе звати" value={name} onChangeText={setName} /> : null}
            <Input label="Пароль" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" />
            {mode === 'register' ? <Input label="Повтори пароль" value={password2} onChangeText={setPassword2} secureTextEntry autoCapitalize="none" /> : null}
            {error ? <Text style={{ color: colors.danger, marginBottom: 10 }}>{error}</Text> : null}
            {busy ? <ActivityIndicator color={colors.accent} /> : <Button title={mode === 'login' ? 'Увійти' : 'Створити акаунт'} onPress={submit} />}
            {mode === 'register' ? (
              <Text style={[styles.muted, { marginTop: 10, fontSize: 12 }]}>Позивний бачать інші пілоти і за ним тебе знаходять. Змінити його потім не можна.</Text>
            ) : null}
          </Card>

          <Card>
            <Pressable onPress={() => setShowServer((x) => !x)}>
              <Row>
                <Ionicons name="server-outline" size={16} color={colors.muted} />
                <Text style={[styles.muted, { flex: 1 }]} numberOfLines={1}>
                  Сервер: {serverUrl}
                </Text>
                <Ionicons name={showServer ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
              </Row>
            </Pressable>
            {showServer ? (
              <View style={{ marginTop: 12 }}>
                <Input label="Адреса сервера WhileFly" value={server} onChangeText={(t) => { setServer(t); setServerCheck('idle'); }} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
                <Row>
                  <Button title="Перевірити" variant="ghost" onPress={checkServer} style={{ flex: 1 }} />
                  {serverCheck === 'checking' ? <ActivityIndicator color={colors.accent} /> : null}
                  {serverCheck === 'ok' ? <Ionicons name="checkmark-circle" size={22} color={colors.ok} /> : null}
                  {serverCheck === 'fail' ? <Ionicons name="close-circle" size={22} color={colors.danger} /> : null}
                </Row>
                {serverCheck === 'fail' ? (
                  <Text style={[styles.muted, { marginTop: 8, fontSize: 12 }]}>Сервер недоступний. Перевір, що він запущений (cd server; npm start) і телефон у тій самій мережі.</Text>
                ) : null}
              </View>
            ) : null}
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
