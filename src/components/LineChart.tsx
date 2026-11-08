import React, { useState } from 'react';
import { LayoutChangeEvent, Text, View } from 'react-native';
import Svg, { Line, Polyline, Text as SvgText } from 'react-native-svg';
import { colors } from '../theme';

export interface Series {
  name: string;
  color: string;
  data: number[];
}

/** Lightweight multi-series line chart (all series share the same x index). */
export function LineChart({
  series,
  height = 160,
  xLabels,
  unit,
  fixedMin,
  fixedMax,
}: {
  series: Series[];
  height?: number;
  xLabels?: [string, string];
  unit?: string;
  fixedMin?: number;
  fixedMax?: number;
}) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  let min = Infinity;
  let max = -Infinity;
  for (const s of series) {
    for (const v of s.data) {
      if (Number.isFinite(v)) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
  }
  if (fixedMin !== undefined) min = fixedMin;
  if (fixedMax !== undefined) max = fixedMax;
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    min = 0;
    max = 1;
  }
  if (max === min) {
    max += 1;
    min -= 1;
  }

  const padL = 40;
  const padB = xLabels ? 16 : 4;
  const w = Math.max(1, width - padL);
  const h = height - padB;
  const y = (v: number) => h - ((v - min) / (max - min)) * h;

  return (
    <View onLayout={onLayout}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          {[0, 0.5, 1].map((t) => {
            const v = min + (max - min) * (1 - t);
            return (
              <React.Fragment key={t}>
                <Line x1={padL} x2={width} y1={t * h} y2={t * h} stroke={colors.border} strokeWidth={1} />
                <SvgText x={padL - 4} y={Math.min(h - 2, Math.max(10, t * h + 4))} fill={colors.muted} fontSize={10} textAnchor="end">
                  {formatTick(v)}
                </SvgText>
              </React.Fragment>
            );
          })}
          {series.map((s) => {
            const n = s.data.length;
            if (n < 2) return null;
            const step = Math.max(1, Math.floor(n / (w * 1.5)));
            const pts: string[] = [];
            for (let i = 0; i < n; i += step) {
              const v = s.data[i];
              if (!Number.isFinite(v)) continue;
              const px = padL + (i / (n - 1)) * w;
              const py = y(Math.max(min, Math.min(max, v)));
              pts.push(px.toFixed(1) + ',' + py.toFixed(1));
            }
            return <Polyline key={s.name} points={pts.join(' ')} fill="none" stroke={s.color} strokeWidth={1.5} />;
          })}
          {xLabels ? (
            <>
              <SvgText x={padL} y={height - 3} fill={colors.muted} fontSize={10}>
                {xLabels[0]}
              </SvgText>
              <SvgText x={width} y={height - 3} fill={colors.muted} fontSize={10} textAnchor="end">
                {xLabels[1]}
              </SvgText>
            </>
          ) : null}
        </Svg>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 6 }}>
        {series.map((s) => (
          <View key={s.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 10, height: 3, backgroundColor: s.color, borderRadius: 2 }} />
            <Text style={{ color: colors.muted, fontSize: 11 }}>
              {s.name}
              {unit ? ' (' + unit + ')' : ''}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function formatTick(v: number): string {
  const a = Math.abs(v);
  if (a >= 10000) return (v / 1000).toFixed(0) + 'k';
  if (a >= 100) return v.toFixed(0);
  if (a >= 10) return v.toFixed(1);
  return v.toFixed(2);
}
