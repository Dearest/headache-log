export type PainTypeId =
  | 'throb' | 'band' | 'dull' | 'distend' | 'stab'
  | 'electric' | 'burn' | 'boring' | 'allodynia' | 'thunderclap';

export interface Mark {
  x: number; y: number; z: number;
  nx: number; ny: number; nz: number;
  type: PainTypeId;
  region: string;
}

export interface Weather {
  pressure: number;
  pressureDelta3h: number | null;
  temp: number;
  humidity: number;
}

export type MedEffect = 'unknown' | 'good' | 'partial' | 'none';

interface Base {
  id: string;
  day: string;
  updatedAt: number;
  deleted?: boolean;
}

export interface Headache extends Base {
  kind: 'headache';
  start: string;
  end: string | null;
  marks: Mark[];
  intensity: number;
  symptoms: string[];
  meds: string[];
  medEffect: MedEffect;
  before: string;
  weather: Weather | null;
}

export interface CheckIn extends Base {
  kind: 'checkin';
  text: string;
}

export type Entry = Headache | CheckIn;
