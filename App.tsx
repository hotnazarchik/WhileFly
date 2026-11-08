import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AccountScreen from './src/screens/AccountScreen';
import CommsStack from './src/screens/comms/CommsStack';
import LogsScreen from './src/screens/LogsScreen';
import TelemetryScreen from './src/screens/TelemetryScreen';
import WeatherScreen from './src/screens/WeatherScreen';
import { AppProvider } from './src/state/AppContext';
import { AuthProvider, useAuth } from './src/state/AuthContext';
import { Background } from './src/state/Background';
import { colors } from './src/theme';

const Tab = createBottomTabNavigator();

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg, card: colors.card, border: colors.border, primary: colors.accent, text: colors.text },
};

const ICONS: Record<string, [keyof typeof Ionicons.glyphMap, keyof typeof Ionicons.glyphMap]> = {
  Logs: ['analytics', 'analytics-outline'],
  Telemetry: ['radio', 'radio-outline'],
  Weather: ['partly-sunny', 'partly-sunny-outline'],
  Comms: ['people', 'people-outline'],
  Account: ['person-circle', 'person-circle-outline'],
};

function Tabs() {
  const { unreadTotal } = useAuth();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.accentText,
        tabBarActiveBackgroundColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: '#242424', borderTopColor: colors.accent, borderTopWidth: 2 },
        tabBarLabelStyle: { fontWeight: '700', fontSize: 10 },
        tabBarBadgeStyle: { backgroundColor: colors.danger, color: '#fff', fontSize: 10 },
        tabBarIcon: ({ focused, color, size }) => <Ionicons name={ICONS[route.name][focused ? 0 : 1]} size={size} color={color} />,
      })}
    >
      <Tab.Screen name="Logs" component={LogsScreen} options={{ title: 'Логи' }} />
      <Tab.Screen name="Telemetry" component={TelemetryScreen} options={{ title: 'Телеметрія' }} />
      <Tab.Screen name="Weather" component={WeatherScreen} options={{ title: 'Погода' }} />
      <Tab.Screen name="Comms" component={CommsStack} options={{ title: 'Побратими', tabBarBadge: unreadTotal > 0 ? (unreadTotal > 99 ? '99+' : unreadTotal) : undefined }} />
      <Tab.Screen name="Account" component={AccountScreen} options={{ title: 'Акаунт' }} />
    </Tab.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <AuthProvider>
          <Background />
          <NavigationContainer theme={theme}>
            <StatusBar style="light" />
            <Tabs />
          </NavigationContainer>
        </AuthProvider>
      </AppProvider>
    </SafeAreaProvider>
  );
}
