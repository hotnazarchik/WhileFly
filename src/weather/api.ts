/** Open-Meteo (free, no API key) forecast + ensemble client. */

export interface Place {
  name: string;
  lat: number;
  lon: number;
  country?: string;
  admin?: string;
}

export interface HourlyForecast {
  time: string[]; // local ISO "YYYY-MM-DDTHH:00"
  temperature: number[];
  humidity: number[];
  dewPoint: number[];
  precipProb: number[];
  precip: number[];
  weatherCode: number[];
  cloudCover: number[];
  visibility: number[];
  wind10: number[];
  gust10: number[];
  windDir: number[];
  wind80: number[];
}

export interface Forecast {
  timezone: string;
  hourly: HourlyForecast;
  daily: { date: string[]; sunrise: string[]; sunset: string[] };
}

/** Per-hour ensemble members: members[var][hourIndex] = values of every member */
export interface Ensemble {
  time: string[];
  wind10: number[][];
  gust10: number[][];
  precip: number[][];
  temperature: number[][];
  members: number;
  model: string;
}

export async function searchPlaces(query: string): Promise<Place[]> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=8&language=uk&format=json`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('Пошук міста недоступний');
  const j = await r.json();
  return (j.results ?? []).map((x: any) => ({ name: x.name, lat: x.latitude, lon: x.longitude, country: x.country, admin: x.admin1 }));
}

export async function fetchForecast(lat: number, lon: number): Promise<Forecast> {
  const hourly = [
    'temperature_2m',
    'relative_humidity_2m',
    'dew_point_2m',
    'precipitation_probability',
    'precipitation',
    'weather_code',
    'cloud_cover',
    'visibility',
    'wind_speed_10m',
    'wind_gusts_10m',
    'wind_direction_10m',
    'wind_speed_80m',
  ].join(',');
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&hourly=${hourly}&daily=sunrise,sunset&wind_speed_unit=ms&timezone=auto&forecast_days=14`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('Прогноз погоди недоступний (' + r.status + ')');
  const j = await r.json();
  const h = j.hourly;
  return {
    timezone: j.timezone,
    hourly: {
      time: h.time,
      temperature: h.temperature_2m,
      humidity: h.relative_humidity_2m,
      dewPoint: h.dew_point_2m,
      precipProb: h.precipitation_probability ?? h.time.map(() => 0),
      precip: h.precipitation,
      weatherCode: h.weather_code,
      cloudCover: h.cloud_cover,
      visibility: h.visibility ?? h.time.map(() => 20000),
      wind10: h.wind_speed_10m,
      gust10: h.wind_gusts_10m,
      windDir: h.wind_direction_10m,
      wind80: h.wind_speed_80m ?? h.wind_speed_10m,
    },
    daily: { date: j.daily.time, sunrise: j.daily.sunrise, sunset: j.daily.sunset },
  };
}

/** Ensemble forecast: dozens of model runs with perturbed initial conditions → real probabilities. */
export async function fetchEnsemble(lat: number, lon: number): Promise<Ensemble | null> {
  const model = 'icon_seamless';
  const url =
    `https://ensemble-api.open-meteo.com/v1/ensemble?latitude=${lat}&longitude=${lon}` +
    `&hourly=wind_speed_10m,wind_gusts_10m,precipitation,temperature_2m&models=${model}` +
    `&wind_speed_unit=ms&timezone=auto&forecast_days=7`;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const j = await r.json();
    const h = j.hourly;
    if (!h?.time) return null;
    const collect = (prefix: string): number[][] => {
      const keys = Object.keys(h).filter((k) => k === prefix || k.startsWith(prefix + '_member'));
      return h.time.map((_: string, i: number) => keys.map((k) => h[k][i]).filter((v: any) => typeof v === 'number'));
    };
    const wind10 = collect('wind_speed_10m');
    const members = wind10[0]?.length ?? 0;
    if (members < 3) return null;
    return {
      time: h.time,
      wind10,
      gust10: collect('wind_gusts_10m'),
      precip: collect('precipitation'),
      temperature: collect('temperature_2m'),
      members,
      model,
    };
  } catch {
    return null;
  }
}
