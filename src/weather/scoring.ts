import { Drone } from '../state/AppContext';
import { Ensemble, Forecast } from './api';

/**
 * Flyability algorithm.
 *
 * Each weather factor is mapped to a 0..1 "suitability" with smooth (logistic) curves
 * tuned for FPV quads, scaled by the selected drone's wind tolerance. The product of
 * factors is the flight-success score for one weather scenario.
 *
 * Probability: if an ensemble forecast is available (ICON-EPS, ~40 members), the score is
 * evaluated for every member and averaged → a genuine probability that conditions will be
 * flyable. Otherwise the deterministic score is used and blended toward 50% as lead time grows.
 */

export interface Factor {
  key: string;
  label: string;
  value: string;
  score: number; // 0..1
  note?: string;
}

export interface HourVerdict {
  time: string;
  probability: number; // 0..100
  deterministic: number; // 0..100
  confidence: number; // 0..100 (how much we trust the forecast itself)
  method: 'ensemble' | 'deterministic';
  members?: number;
  windRange?: [number, number];
  pWindOk?: number;
  pDry?: number;
  factors: Factor[];
  verdict: string;
  advice: string[];
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

function windScore(wind: number, limit: number) {
  return sigmoid((limit - wind) / (0.12 * limit));
}
function gustScore(gust: number, limit: number) {
  const gl = limit * 1.45;
  return sigmoid((gl - gust) / (0.12 * gl));
}
function rainAmountScore(mm: number) {
  if (mm <= 0.05) return 1;
  if (mm <= 0.3) return 0.6;
  if (mm <= 1) return 0.3;
  return 0.08;
}
function tempScore(t: number) {
  if (t < -15) return 0.15;
  if (t < 0) return 0.45 + ((t + 15) / 15) * 0.4; // LiPo sag in the cold
  if (t < 5) return 0.85 + (t / 5) * 0.15;
  if (t <= 32) return 1;
  if (t <= 40) return 1 - ((t - 32) / 8) * 0.4;
  return 0.5;
}
function visibilityScore(m: number) {
  if (m < 500) return 0.2;
  if (m < 1500) return 0.55;
  if (m < 3000) return 0.85;
  return 1;
}
function weatherCodeScore(code: number): { s: number; label: string } {
  if (code >= 95) return { s: 0.02, label: 'Гроза' };
  if ([56, 57, 66, 67].includes(code)) return { s: 0.15, label: 'Крижаний дощ' };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { s: 0.35, label: 'Сніг' };
  if (code === 65 || code === 82) return { s: 0.1, label: 'Злива' };
  if (code >= 61 && code <= 64) return { s: 0.4, label: 'Дощ' };
  if (code >= 80) return { s: 0.4, label: 'Короткочасний дощ' };
  if (code >= 51) return { s: 0.65, label: 'Мряка' };
  if (code === 45 || code === 48) return { s: 0.6, label: 'Туман' };
  if (code === 3) return { s: 1, label: 'Хмарно' };
  if (code === 2) return { s: 1, label: 'Мінлива хмарність' };
  return { s: 1, label: 'Ясно' };
}

function lightScore(time: string, sunrise?: string, sunset?: string): { s: number; label: string } {
  if (!sunrise || !sunset) return { s: 1, label: '—' };
  const t = time.slice(11, 16);
  const sr = sunrise.slice(11, 16);
  const ss = sunset.slice(11, 16);
  const toMin = (x: string) => parseInt(x.slice(0, 2), 10) * 60 + parseInt(x.slice(3, 5), 10);
  const m = toMin(t);
  if (m < toMin(sr) - 30 || m > toMin(ss) + 30) return { s: 0.45, label: `Темно (схід ${sr}, захід ${ss})` };
  if (m < toMin(sr) + 30 || m > toMin(ss) - 30) return { s: 0.85, label: `Сутінки (схід ${sr}, захід ${ss})` };
  return { s: 1, label: `Світло до ${ss}` };
}

export function hoursAhead(time: string): number {
  // `time` is in the location's local time; device clock is close enough for lead-time estimation
  const target = new Date(time).getTime();
  return Math.max(0, (target - Date.now()) / 3.6e6);
}

/** How much a deterministic forecast can be trusted at a given lead time (empirical skill decay). */
export function leadTimeConfidence(h: number): number {
  return Math.max(0.3, Math.min(0.97, 0.97 * Math.exp(-h / 160)));
}

export function evaluateHour(fc: Forecast, ens: Ensemble | null, time: string, drone: Drone): HourVerdict | null {
  const i = fc.hourly.time.indexOf(time);
  if (i < 0) return null;
  const H = fc.hourly;
  const limit = drone.maxWind;

  const day = fc.daily.date.indexOf(time.slice(0, 10));
  const light = lightScore(time, fc.daily.sunrise[day], fc.daily.sunset[day]);
  const code = weatherCodeScore(H.weatherCode[i]);
  const fVis = visibilityScore(H.visibility[i]);
  const fWind = windScore(H.wind10[i], limit);
  const fGust = gustScore(H.gust10[i], limit);
  const wetness = Math.max(H.precipProb[i] / 100, H.precip[i] > 0.1 ? 0.8 : 0);
  const fRain = 1 - wetness * (1 - rainAmountScore(Math.max(H.precip[i], 0.4)));
  const fTemp = tempScore(H.temperature[i]);
  const spread = H.temperature[i] - H.dewPoint[i];
  const fDew = spread < 1.5 && H.temperature[i] < 10 ? 0.85 : 1;

  const staticFactors = code.s * fVis * light.s * fDew; // not perturbed by ensemble
  const deterministic = fWind * fGust * fRain * fTemp * staticFactors;

  const factors: Factor[] = [
    { key: 'wind', label: 'Вітер (10 м)', value: `${H.wind10[i].toFixed(1)} м/с  (ліміт ${limit} м/с)`, score: fWind, note: `На 80 м: ${H.wind80[i].toFixed(1)} м/с, напрям ${compass(H.windDir[i])}` },
    { key: 'gust', label: 'Пориви', value: `${H.gust10[i].toFixed(1)} м/с`, score: fGust },
    { key: 'rain', label: 'Опади', value: `${H.precipProb[i]}% · ${H.precip[i].toFixed(1)} мм`, score: fRain },
    { key: 'temp', label: 'Температура', value: `${H.temperature[i].toFixed(0)}°C`, score: fTemp, note: H.temperature[i] < 5 ? 'Холод: тримай LiPo в теплі до зльоту' : undefined },
    { key: 'sky', label: 'Погода', value: code.label + ` · хмари ${H.cloudCover[i]}%`, score: code.s },
    { key: 'vis', label: 'Видимість', value: `${(H.visibility[i] / 1000).toFixed(1)} км`, score: fVis },
    { key: 'light', label: 'Освітлення', value: light.label, score: light.s },
  ];
  if (fDew < 1) factors.push({ key: 'dew', label: 'Конденсат', value: `Точка роси ${H.dewPoint[i].toFixed(0)}°C`, score: fDew, note: 'Ризик запотівання камери' });

  let probability: number;
  let method: HourVerdict['method'] = 'deterministic';
  let members: number | undefined;
  let windRange: [number, number] | undefined;
  let pWindOk: number | undefined;
  let pDry: number | undefined;
  let confidence: number;
  const lead = hoursAhead(time);

  const ei = ens ? ens.time.indexOf(time) : -1;
  if (ens && ei >= 0 && ens.wind10[ei].length >= 3) {
    method = 'ensemble';
    const w = ens.wind10[ei];
    const g = ens.gust10[ei];
    const p = ens.precip[ei];
    const t = ens.temperature[ei];
    members = w.length;
    let sum = 0;
    let windOk = 0;
    let dry = 0;
    for (let m = 0; m < members; m++) {
      const fw = windScore(w[m], limit);
      const fg = g[m] !== undefined ? gustScore(g[m], limit) : fGust;
      const fr = p[m] !== undefined ? rainAmountScore(p[m]) : fRain;
      const ft = t[m] !== undefined ? tempScore(t[m]) : fTemp;
      sum += fw * fg * fr * ft;
      if (w[m] <= limit && (g[m] ?? 0) <= limit * 1.45) windOk++;
      if ((p[m] ?? 0) <= 0.1) dry++;
    }
    probability = (sum / members) * staticFactors;
    windRange = [Math.min(...w), Math.max(...w)];
    pWindOk = (windOk / members) * 100;
    pDry = (dry / members) * 100;
    // confidence = agreement between members (low spread relative to the drone's limit)
    const mean = w.reduce((a, b) => a + b, 0) / members;
    const sd = Math.sqrt(w.reduce((a, b) => a + (b - mean) ** 2, 0) / members);
    confidence = Math.max(0.2, Math.min(0.98, 1 - sd / (limit * 0.6)));
  } else {
    confidence = leadTimeConfidence(lead);
    // the further ahead, the more the deterministic answer regresses toward climatological 50/50
    probability = deterministic * confidence + 0.5 * staticFactors * (1 - confidence);
  }

  const pct = Math.round(probability * 100);
  const verdict = pct >= 75 ? 'Летимо! Чудові умови' : pct >= 50 ? 'Можна летіти, але обережно' : pct >= 25 ? 'Ризиковано' : 'Не радимо летіти';

  const advice: string[] = [];
  if (fWind < 0.5) advice.push(`Вітер вище комфортного для «${drone.name}». Обери важчий борт або сховайся за лісом/будівлями.`);
  else if (fWind < 0.8) advice.push('Вітер відчутний: тримай запас батареї на повернення проти вітру.');
  if (fGust < 0.6) advice.push('Сильні пориви — уникай польотів біля перешкод і на малій висоті.');
  if (fRain < 0.6) advice.push('Ймовірні опади: електроніка без захисту (конформне покриття) може постраждати.');
  if (fTemp < 0.85) advice.push('Холодно: прогрій акумулятори, очікуй коротший політ і просідання.');
  if (light.s < 1) advice.push('Мало світла: аналогове/цифрове відео буде шумним, перевір правила VLOS.');
  if (code.s < 0.1) advice.push('Гроза! Політ небезпечний.');
  if (H.wind80[i] > limit * 1.2 && fWind > 0.6) advice.push(`На висоті 80 м вітер сильніший (${H.wind80[i].toFixed(1)} м/с) — не піднімайся високо.`);
  if (!advice.length) advice.push('Умови хороші. Перевір пропи, батареї і зону польоту.');

  return {
    time,
    probability: pct,
    deterministic: Math.round(deterministic * 100),
    confidence: Math.round(confidence * 100),
    method,
    members,
    windRange,
    pWindOk,
    pDry,
    factors,
    verdict,
    advice,
  };
}

/** Best hours of a given day (daylight only), sorted by probability. */
export function bestHours(fc: Forecast, ens: Ensemble | null, date: string, drone: Drone, top = 3): HourVerdict[] {
  const out: HourVerdict[] = [];
  for (const t of fc.hourly.time) {
    if (!t.startsWith(date)) continue;
    const v = evaluateHour(fc, ens, t, drone);
    if (v && v.factors.find((f) => f.key === 'light')!.score >= 0.85) out.push(v);
  }
  return out.sort((a, b) => b.probability - a.probability).slice(0, top);
}

function compass(deg: number): string {
  const dirs = ['Пн', 'ПнСх', 'Сх', 'ПдСх', 'Пд', 'ПдЗх', 'Зх', 'ПнЗх'];
  return dirs[Math.round(deg / 45) % 8];
}
