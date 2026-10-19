import type { Weather } from './types';

// Open-Meteo（免费、无需 key）：取头痛开始那个小时的气压、温度、湿度，以及 3 小时气压变化。
const K_COORDS = 'hl:coords';

function getCoords(): Promise<{ lat: number; lon: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(cached());
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const c = { lat: +p.coords.latitude.toFixed(2), lon: +p.coords.longitude.toFixed(2) };
        localStorage.setItem(K_COORDS, JSON.stringify(c));
        resolve(c);
      },
      () => resolve(cached()),
      { maximumAge: 6 * 3_600_000, timeout: 8000 },
    );
  });
}

function cached() {
  try {
    return JSON.parse(localStorage.getItem(K_COORDS) || 'null');
  } catch {
    return null;
  }
}

export async function fetchWeather(startIso: string): Promise<Weather | null> {
  const start = new Date(startIso);
  const ageDays = (Date.now() - start.getTime()) / 86_400_000;
  if (ageDays > 80 || ageDays < -1) return null;
  const c = await getCoords();
  if (!c) return null;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}`
    + `&hourly=surface_pressure,temperature_2m,relative_humidity_2m&timezone=auto`
    + `&past_days=${Math.min(92, Math.ceil(ageDays) + 1)}&forecast_days=1`;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const d = await r.json();
    const times: string[] = d.hourly.time;
    const pad = (n: number) => String(n).padStart(2, '0');
    const key = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}T${pad(start.getHours())}:00`;
    const i = times.indexOf(key);
    if (i < 0) return null;
    const p = d.hourly.surface_pressure;
    return {
      pressure: Math.round(p[i]),
      pressureDelta3h: i >= 3 ? Math.round((p[i] - p[i - 3]) * 10) / 10 : null,
      temp: Math.round(d.hourly.temperature_2m[i]),
      humidity: Math.round(d.hourly.relative_humidity_2m[i]),
    };
  } catch {
    return null;
  }
}
