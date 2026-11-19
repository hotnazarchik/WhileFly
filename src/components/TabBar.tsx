import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';

type IconPair = [keyof typeof Ionicons.glyphMap, keyof typeof Ionicons.glyphMap];

/**
 * Bottom navigation in the configurator style: dark bar, active tab marked by a thin
 * yellow line on top and a yellow "pill" behind the icon. Labels never get clipped.
 */
export function TabBar({ state, descriptors, navigation, icons }: BottomTabBarProps & { icons: Record<string, IconPair> }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: '#202020',
        borderTopWidth: 1,
        borderTopColor: colors.border,
        paddingBottom: Math.max(insets.bottom, 6),
      }}
    >
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const focused = state.index === index;
        const label = typeof options.title === 'string' ? options.title : route.name;
        const badge = options.tabBarBadge;
        const [on, off] = icons[route.name] ?? ['ellipse', 'ellipse-outline'];

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
        };

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={label}
            style={({ pressed }) => ({ flex: 1, alignItems: 'center', paddingTop: 0, opacity: pressed ? 0.7 : 1 })}
          >
            {/* active marker on top edge */}
            <View style={{ height: 3, width: '60%', borderBottomLeftRadius: 3, borderBottomRightRadius: 3, backgroundColor: focused ? colors.accent : 'transparent' }} />
            <View
              style={{
                marginTop: 6,
                width: 46,
                height: 28,
                borderRadius: 14,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: focused ? 'rgba(255,187,0,0.16)' : 'transparent',
              }}
            >
              <Ionicons name={focused ? on : off} size={21} color={focused ? colors.accent : colors.muted} />
              {badge !== undefined ? (
                <View
                  style={{
                    position: 'absolute',
                    top: -3,
                    right: 2,
                    minWidth: 17,
                    height: 17,
                    paddingHorizontal: 4,
                    borderRadius: 9,
                    backgroundColor: colors.danger,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 2,
                    borderColor: '#202020',
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>{String(badge)}</Text>
                </View>
              ) : null}
            </View>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              style={{
                marginTop: 3,
                marginBottom: 2,
                paddingHorizontal: 2,
                fontSize: 10.5,
                fontWeight: focused ? '800' : '600',
                color: focused ? colors.accent : colors.muted,
              }}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
