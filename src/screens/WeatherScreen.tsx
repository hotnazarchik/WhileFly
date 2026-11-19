import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader, styles } from '../components/ui';
import { tr } from '../i18n';
import { colors, radius } from '../theme';

/** Placeholder until the flight-weather feature returns. */
export default function WeatherScreen() {
  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.content}>
        <ScreenHeader title={tr('Погода для польоту')} />
      </View>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, marginTop: -60 }}>
        <View
          style={{
            width: 96,
            height: 96,
            borderRadius: 48,
            backgroundColor: 'rgba(255,187,0,0.12)',
            borderWidth: 2,
            borderColor: colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="construct" size={44} color={colors.accent} />
        </View>
        <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800', marginTop: 20 }}>{tr('В розробці')}</Text>
        <Text style={[styles.muted, { textAlign: 'center', marginTop: 8, lineHeight: 19 }]}>
          {tr('Прогноз погоди для польотів з’явиться в одному з наступних оновлень.')}
        </Text>
        <View style={{ marginTop: 18, paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '700', letterSpacing: 1 }}>{tr('СКОРО')}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
