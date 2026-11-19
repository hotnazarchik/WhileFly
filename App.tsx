import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNavigationContainerRef, DarkTheme, NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import React, { useRef } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TabBar } from './src/components/TabBar';
import { LanguageProvider, tr } from './src/i18n';
import AccountScreen from './src/screens/AccountScreen';
import LogsScreen from './src/screens/LogsScreen';
import TelemetryScreen from './src/screens/TelemetryScreen';
import WeatherScreen from './src/screens/WeatherScreen';
import { AuthProvider } from './src/state/AuthContext';
import { colors } from './src/theme';

const Tab = createBottomTabNavigator();
const navRef = createNavigationContainerRef<any>();

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg, card: colors.card, border: colors.border, primary: colors.accent, text: colors.text },
};

const ICONS: Record<string, [keyof typeof Ionicons.glyphMap, keyof typeof Ionicons.glyphMap]> = {
  Logs: ['analytics', 'analytics-outline'],
  Telemetry: ['radio', 'radio-outline'],
  Weather: ['partly-sunny', 'partly-sunny-outline'],
  Account: ['person-circle', 'person-circle-outline'],
};

function Tabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} icons={ICONS} />}>
      <Tab.Screen name="Logs" component={LogsScreen} options={{ title: tr('Логи') }} />
      <Tab.Screen name="Telemetry" component={TelemetryScreen} options={{ title: tr('Телеметрія') }} />
      <Tab.Screen name="Weather" component={WeatherScreen} options={{ title: tr('Погода') }} />
      <Tab.Screen name="Account" component={AccountScreen} options={{ title: tr('Акаунт') }} />
    </Tab.Navigator>
  );
}

export default function App() {
  // survives the language remount so the user stays on the same screen
  const navState = useRef<any>(undefined);
  return (
    <SafeAreaProvider>
      <AuthProvider>
        {/* remounts the UI (not the auth state) when the language changes */}
        <LanguageProvider>
          <NavigationContainer
            ref={navRef}
            theme={theme}
            onStateChange={(s) => (navState.current = s)}
            onReady={() => {
              // restore the screen the user was on before the language remount
              if (navState.current) navRef.resetRoot(navState.current);
            }}
          >
            <StatusBar style="light" />
            <Tabs />
          </NavigationContainer>
        </LanguageProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
