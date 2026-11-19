import React from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Chip, Row, ScreenHeader, styles } from '../components/ui';
import { LANGUAGES, tr, useLang } from '../i18n';
import { useAuth } from '../state/AuthContext';
import { colors, radius } from '../theme';
import AuthForm from './AuthForm';

export default function AccountScreen() {
  const { status, user, logout } = useAuth();
  const { lang, setLang } = useLang();

  const confirmLogout = () => {
    if (Platform.OS === 'web') return void logout();
    Alert.alert(tr('Вийти з акаунта?'), undefined, [
      { text: tr('Скасувати'), style: 'cancel' },
      { text: tr('Вийти'), style: 'destructive', onPress: () => logout() },
    ]);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ScreenHeader title={tr('Акаунт')} />

          {status === 'loading' ? <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} /> : null}

          {status === 'authed' && user ? (
            <Card>
              <Text style={styles.muted}>{tr('Твій тег')}</Text>
              <View
                style={{
                  alignSelf: 'flex-start',
                  marginTop: 8,
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: radius.md,
                  backgroundColor: colors.accent,
                }}
              >
                <Text style={{ color: colors.accentText, fontSize: 22, fontWeight: '900', letterSpacing: 0.5 }}>@{user.callsign}</Text>
              </View>
              <Button title={tr('Вийти')} variant="ghost" onPress={confirmLogout} style={{ marginTop: 16 }} />
            </Card>
          ) : null}

          {status === 'guest' ? <AuthForm /> : null}

          <Card title="Мова · Language">
            <Row style={{ flexWrap: 'wrap' }}>
              {LANGUAGES.map((l) => (
                <Chip key={l.key} label={`${l.flag} ${l.label}`} active={lang === l.key} onPress={() => setLang(l.key)} />
              ))}
            </Row>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
