import React from 'react';
import Svg, { Circle, ClipPath, Defs, G, Line, Rect, Text as SvgText } from 'react-native-svg';
import { colors } from '../theme';

/** Artificial horizon: pitch/roll in degrees. */
export function Horizon({ pitch = 0, roll = 0, size = 160 }: { pitch?: number; roll?: number; size?: number }) {
  const r = size / 2;
  const pxPerDeg = r / 45;
  const offset = Math.max(-r * 1.5, Math.min(r * 1.5, pitch * pxPerDeg));
  return (
    <Svg width={size} height={size}>
      <Defs>
        <ClipPath id="clip">
          <Circle cx={r} cy={r} r={r - 2} />
        </ClipPath>
      </Defs>
      <G clipPath="url(#clip)">
        <G transform={`rotate(${-roll} ${r} ${r})`}>
          <Rect x={-size} y={-size * 2 + r + offset} width={size * 3} height={size * 2} fill="#1E4F7A" />
          <Rect x={-size} y={r + offset} width={size * 3} height={size * 2} fill="#5A3B22" />
          <Line x1={-size} x2={size * 2} y1={r + offset} y2={r + offset} stroke="#fff" strokeWidth={1.5} />
          {[-20, -10, 10, 20].map((d) => (
            <React.Fragment key={d}>
              <Line x1={r - 15} x2={r + 15} y1={r + offset - d * pxPerDeg} y2={r + offset - d * pxPerDeg} stroke="#ffffffaa" strokeWidth={1} />
              <SvgText x={r + 19} y={r + offset - d * pxPerDeg + 3} fill="#ffffffaa" fontSize={8}>
                {d}
              </SvgText>
            </React.Fragment>
          ))}
        </G>
      </G>
      <Line x1={r - 35} x2={r - 10} y1={r} y2={r} stroke={colors.warn} strokeWidth={3} />
      <Line x1={r + 10} x2={r + 35} y1={r} y2={r} stroke={colors.warn} strokeWidth={3} />
      <Circle cx={r} cy={r} r={3} fill={colors.warn} />
      <Circle cx={r} cy={r} r={r - 2} stroke={colors.border} strokeWidth={3} fill="none" />
    </Svg>
  );
}
