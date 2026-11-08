import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../../state/AuthContext';
import { colors } from '../../theme';
import AuthScreen from './AuthScreen';
import ChatScreen from './ChatScreen';
import ChatsListScreen from './ChatsListScreen';
import FriendsScreen from './FriendsScreen';
import { ChatInfoScreen, NewGroupScreen } from './GroupScreens';
import UserProfileScreen from './UserProfileScreen';

const Stack = createNativeStackNavigator();

export default function CommsStack() {
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (status === 'guest') return <AuthScreen />;

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.cardHeader },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="ChatsList" component={ChatsListScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Chat" component={ChatScreen} options={({ route }: any) => ({ title: route.params?.title ?? 'Чат' })} />
      <Stack.Screen name="Friends" component={FriendsScreen} options={{ title: 'Побратими' }} />
      <Stack.Screen name="UserProfile" component={UserProfileScreen} options={{ title: 'Пілот' }} />
      <Stack.Screen name="NewGroup" component={NewGroupScreen} options={{ title: 'Новий загін' }} />
      <Stack.Screen name="ChatInfo" component={ChatInfoScreen} options={{ title: 'Загін' }} />
    </Stack.Navigator>
  );
}
