import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { colors, radius, spacing } from '../theme';

/** Configurator-style panel: grey title bar on top, content below. */
export function Card({ children, style, title, right }: { children: React.ReactNode; style?: ViewStyle; title?: string; right?: React.ReactNode }) {
  return (
    <View style={[styles.card, style]}>
      {title ? (
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {title}
          </Text>
          {right}
        </View>
      ) : null}
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

/** Screen title with the yellow underline used for tab titles in the configurator. */
export function ScreenHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <View style={styles.screenHeader}>
      <View style={styles.brandRow}>
        <View style={styles.brandMark}>
          <Text style={styles.brandMarkText}>W</Text>
        </View>
        <Text style={styles.brandText}>
          WHILE<Text style={{ color: colors.accent }}>FLY</Text>
        </Text>
        <View style={{ flex: 1 }} />
        {right}
      </View>
      <Text style={styles.h1}>{title}</Text>
      <View style={styles.titleUnderline} />
      {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
    </View>
  );
}

export function Stat({ label, value, unit, color, small }: { label: string; value: string; unit?: string; color?: string; small?: boolean }) {
  return (
    <View style={[styles.stat, small ? { minWidth: '30%' } : null]}>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.statValue, small ? { fontSize: 17 } : null, color ? { color } : null]} numberOfLines={1}>
        {value}
        {unit ? <Text style={styles.statUnit}> {unit}</Text> : null}
      </Text>
    </View>
  );
}

export function StatGrid({ children }: { children: React.ReactNode }) {
  return <View style={styles.grid}>{children}</View>;
}

export function Button({ title, onPress, variant = 'primary', disabled, style }: { title: string; onPress: () => void; variant?: 'primary' | 'ghost' | 'danger'; disabled?: boolean; style?: ViewStyle }) {
  const bg = variant === 'primary' ? colors.accent : variant === 'danger' ? colors.danger : colors.cardAlt;
  const fg = variant === 'primary' ? colors.accentText : '#FFFFFF';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.8 : 1 },
        variant === 'ghost' ? { borderWidth: 1, borderColor: colors.border } : null,
        style,
      ]}
    >
      <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active ? styles.chipActive : null]}>
      <Text style={[styles.chipText, active ? { color: colors.accentText } : null]}>{label}</Text>
    </Pressable>
  );
}

export function Input(props: TextInputProps & { label?: string; containerStyle?: ViewStyle }) {
  const { label, style, containerStyle, ...rest } = props;
  return (
    <View style={[{ marginBottom: spacing.sm }, containerStyle]}>
      {label ? <Text style={styles.inputLabel}>{label}</Text> : null}
      <TextInput placeholderTextColor={colors.muted} selectionColor={colors.accent} style={[styles.input, style]} {...rest} />
    </View>
  );
}

export function Row({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, style]}>{children}</View>;
}

export function KV({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.kv}>
      <Text style={styles.kvKey}>{k}</Text>
      <Text style={styles.kvVal} selectable>
        {v}
      </Text>
    </View>
  );
}

export function Bar({ value, color }: { value: number; color: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <View style={styles.barTrack}>
      <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: color }]} />
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, paddingBottom: 48, gap: spacing.md },
  screenHeader: { marginBottom: spacing.xs },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.md },
  brandMark: { width: 26, height: 26, borderRadius: radius.sm, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  brandMarkText: { color: colors.accentText, fontWeight: '900', fontSize: 16 },
  brandText: { color: colors.text, fontWeight: '800', fontSize: 15, letterSpacing: 2 },
  h1: { color: colors.text, fontSize: 24, fontWeight: '700' },
  titleUnderline: { height: 3, width: 48, backgroundColor: colors.accent, marginTop: 6, borderRadius: 2 },
  sub: { color: colors.muted, fontSize: 13, marginTop: 8 },
  text: { color: colors.text, fontSize: 14 },
  muted: { color: colors.muted, fontSize: 13 },
  card: { backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.cardHeader,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 8,
  },
  cardTitle: { color: colors.text, fontSize: 14, fontWeight: '700', flexShrink: 1 },
  cardBody: { padding: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  stat: { minWidth: '45%', flexGrow: 1 },
  statLabel: { color: colors.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  statValue: { color: colors.text, fontSize: 22, fontWeight: '700', marginTop: 2 },
  statUnit: { color: colors.muted, fontSize: 13, fontWeight: '500' },
  button: { paddingVertical: 12, paddingHorizontal: 18, borderRadius: radius.sm, alignItems: 'center' },
  buttonText: { fontSize: 14, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  chip: { paddingVertical: 6, paddingHorizontal: 11, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardAlt },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  inputLabel: { color: colors.muted, fontSize: 12, marginBottom: 4 },
  input: { backgroundColor: '#232323', color: colors.text, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 9, fontSize: 15 },
  kv: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: 12 },
  kvKey: { color: colors.muted, fontSize: 13, flexShrink: 0, maxWidth: '45%' },
  kvVal: { color: colors.text, fontSize: 13, flex: 1, textAlign: 'right' },
  barTrack: { height: 8, borderRadius: 2, backgroundColor: '#1F1F1F', overflow: 'hidden', flex: 1 },
  barFill: { height: 8, borderRadius: 2 },
});
