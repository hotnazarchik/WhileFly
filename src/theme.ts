/**
 * Palette inspired by the Betaflight Configurator dark theme:
 * charcoal panels with lighter title bars, signature yellow accent,
 * green / orange / red for status.
 */
export const colors = {
  bg: '#1C1C1C',
  card: '#2A2A2A',
  cardHeader: '#3A3A3A',
  cardAlt: '#333333',
  border: '#444444',
  text: '#E8E8E8',
  muted: '#A0A0A0',
  accent: '#FFBB00', // Betaflight-style yellow
  accentText: '#141414',
  ok: '#59AA29',
  blue: '#3D93D6',
  warn: '#F08A24',
  danger: '#E2123F',
  purple: '#A97BE0',
};

export const seriesColors = ['#E2123F', '#59AA29', '#3D93D6', '#FFBB00', '#A97BE0', '#21C2C2', '#F08A24', '#C8E65C'];

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };

export const radius = { sm: 3, md: 5 };

export function scoreColor(p: number): string {
  if (p >= 75) return colors.ok;
  if (p >= 50) return colors.accent;
  if (p >= 25) return colors.warn;
  return colors.danger;
}
