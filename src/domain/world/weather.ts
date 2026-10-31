// Per-zone weather state machine — fine, rain, snow or storm, plus a grade. Pure, with the injected
// rng standing in for urand and rand_norm_f. Cite: Weather.cpp ReGenerate ~81–205.

import type { Rng } from '../../engine/core/rng.ts';

/** Cite: SharedDefines.h WeatherType. */
export const WEATHER_TYPE = {
  FINE: 0,
  RAIN: 1,
  SNOW: 2,
  STORM: 3,
} as const;

export type WeatherType = (typeof WEATHER_TYPE)[keyof typeof WEATHER_TYPE];

/** Cite: Weather.h WEATHER_SEASONS 4 — spring, summer, fall, winter. */
export const WEATHER_SEASONS = 4;

export interface WeatherSeasonChances {
  rainChance: number;
  snowChance: number;
  stormChance: number;
}

/** game_weather-like rates: one chances row per season index 0..3. */
export interface ZoneWeatherRates {
  seasons: readonly WeatherSeasonChances[];
}

export interface WeatherState {
  type: WeatherType;
  /** Intensity 0..1. Cite: Weather::m_grade. */
  grade: number;
}

export const FINE_WEATHER: WeatherState = { type: WEATHER_TYPE.FINE, grade: 0 };

const GRADE_STEP = 0.33333334;

function clampGrade(g: number): number {
  if (g < 0) return 0;
  if (g > 1) return 1;
  return g;
}

// Season index from unix day-of-year (0=spring … 3=winter). Cite: Weather.cpp ReGenerate — `((tm_yday - 78
// + 365) / 91) % 4`.
export function seasonIndexFromDayOfYear(yday: number): number {
  return Math.floor((yday - 78 + 365) / 91) % WEATHER_SEASONS;
}

// One weather regeneration step for a zone, porting ReGenerate's control flow exactly: a 30% no-change
// band, then grade steps, then a re-type from the seasonal rain, snow and storm chances.
export function stepWeather(
  state: WeatherState,
  zoneRates: ZoneWeatherRates,
  rng: Rng,
  season = 0,
): WeatherState {
  // No chances table → force fine (Weather.cpp !m_weatherChances branch)
  if (!zoneRates.seasons.length) {
    return { ...FINE_WEATHER };
  }

  const chances =
    zoneRates.seasons[season % WEATHER_SEASONS] ?? zoneRates.seasons[0]!;

  const u = rng.int(0, 99);
  if (u < 30) {
    return { type: state.type, grade: state.grade };
  }

  let type: WeatherType = state.type;
  let grade = state.grade;

  // Get fair — clears to fine but does NOT return (falls through to type roll)
  if (u < 60 && grade < GRADE_STEP) {
    type = WEATHER_TYPE.FINE;
    grade = 0.0;
  }

  // Get better
  if (u < 60 && type !== WEATHER_TYPE.FINE) {
    return { type, grade: clampGrade(grade - GRADE_STEP) };
  }

  // Get worse
  if (u < 90 && type !== WEATHER_TYPE.FINE) {
    return { type, grade: clampGrade(grade + GRADE_STEP) };
  }

  if (type !== WEATHER_TYPE.FINE) {
    // Radical change
    if (grade < GRADE_STEP) {
      return { type, grade: 0.9999 };
    }
    if (grade > 0.6666667) {
      const rnd = rng.int(0, 99);
      if (rnd < 50) {
        return { type, grade: clampGrade(grade - 0.6666667) };
      }
    }
    // clear up then fall through to new type roll
    type = WEATHER_TYPE.FINE;
    grade = 0;
  }

  // New type from seasonal chances (urand 1..100)
  const chance1 = chances.rainChance;
  const chance2 = chance1 + chances.snowChance;
  const chance3 = chance2 + chances.stormChance;
  const rnd = rng.int(1, 100);
  if (rnd <= chance1) type = WEATHER_TYPE.RAIN;
  else if (rnd <= chance2) type = WEATHER_TYPE.SNOW;
  else if (rnd <= chance3) type = WEATHER_TYPE.STORM;
  else type = WEATHER_TYPE.FINE;

  if (type === WEATHER_TYPE.FINE) {
    grade = 0.0;
  } else if (u < 90) {
    // light
    grade = rng.next() * 0.3333;
  } else {
    const severe = rng.int(0, 99);
    if (severe < 50) grade = rng.next() * 0.3333 + 0.3334;
    else grade = rng.next() * 0.3333 + 0.6667;
  }

  return { type, grade: clampGrade(grade) };
}

/** Human-readable flavour for UI (not from CMaNGOS packets). */
export function weatherLabel(state: WeatherState): string {
  if (state.type === WEATHER_TYPE.FINE) return 'Fine';
  const intensity =
    state.grade < GRADE_STEP ? 'Light' : state.grade < 0.6666667 ? 'Medium' : 'Heavy';
  const kind =
    state.type === WEATHER_TYPE.RAIN
      ? 'Rain'
      : state.type === WEATHER_TYPE.SNOW
        ? 'Snow'
        : 'Storm';
  return `${intensity} ${kind}`;
}

// Bake → runtime rates (game_weather / DataBundle.zoneWeather)

// One game_weather / DataBundle.zoneWeather row (season chance percents). `zone` joins to ZoneDef.areaId
// (AreaTable id).
export interface ZoneWeatherBakeRow {
  zone: number;
  spring: { rain: number; snow: number; storm: number };
  summer: { rain: number; snow: number; storm: number };
  fall: { rain: number; snow: number; storm: number };
  winter: { rain: number; snow: number; storm: number };
}

function seasonChancesFromBake(s: {
  rain: number;
  snow: number;
  storm: number;
}): WeatherSeasonChances {
  return {
    rainChance: s.rain,
    snowChance: s.snow,
    stormChance: s.storm,
  };
}

/** Map a bake row → ZoneWeatherRates for `stepWeather` (spring…winter = seasons 0..3). */
export function ratesFromZoneWeatherRow(row: ZoneWeatherBakeRow): ZoneWeatherRates {
  return {
    seasons: [
      seasonChancesFromBake(row.spring),
      seasonChancesFromBake(row.summer),
      seasonChancesFromBake(row.fall),
      seasonChancesFromBake(row.winter),
    ],
  };
}

// Find rates for a ZoneDef by `areaId === row.zone`. Undefined when areaId is missing or no matching bake
// row.
export function weatherRatesForZone(
  zone: { areaId?: number },
  rows: readonly ZoneWeatherBakeRow[],
): ZoneWeatherRates | undefined {
  if (zone.areaId == null) return undefined;
  const row = rows.find((r) => r.zone === zone.areaId);
  return row ? ratesFromZoneWeatherRow(row) : undefined;
}

// Pure read: session weather for a zone key, or FINE when unset. Callers that store ephemeral weather pass
// the Map entry; missing → fine.
export function getWeather(
  byZone: ReadonlyMap<string, WeatherState> | undefined,
  zoneId: string,
): WeatherState {
  const s = byZone?.get(zoneId);
  return s ? { type: s.type, grade: s.grade } : { ...FINE_WEATHER };
}
