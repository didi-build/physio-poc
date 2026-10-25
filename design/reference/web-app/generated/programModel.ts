// Data model assumption (CTO decision, DIDI-594):
// 4 exercise types. Stretch exercises are only "stretching". Every strengthening
// exercise can be done as isometric, concentric or eccentric. One image set per exercise.
// The type is chosen per program row. Rows copy (snapshot) their values when added.
export type ExType = 'stretching' | 'isometric' | 'concentric' | 'eccentric';
export type StrengthType = Exclude<ExType, 'stretching'>;
export type Kind = 'stretch' | 'strength';
export type ParamKey = 'reps' | 'sets' | 'hold' | 'up' | 'down' | 'rest' | 'perDay' | 'daysPerWeek';
export type Params = Partial<Record<ParamKey, string>>;

export const TYPES: ExType[] = ['stretching', 'isometric', 'concentric', 'eccentric'];
export const STRENGTH_TYPES: StrengthType[] = ['isometric', 'concentric', 'eccentric'];
export const TYPE_LABEL: Record<ExType, string> = { stretching: 'Stretching', isometric: 'Isometric', concentric: 'Concentric', eccentric: 'Eccentric' };
export const TYPE_HINT: Record<ExType, string> = {
  stretching: 'Hold a stretch',
  isometric: 'Hold still under load',
  concentric: 'Lift or push with control',
  eccentric: 'Lower slowly',
};

// Fixed parameter keys. The order here is the order they are shown and read out.
export const PARAM_ORDER: ParamKey[] = ['reps', 'hold', 'up', 'down', 'sets', 'rest', 'perDay', 'daysPerWeek'];
export const PARAM_META: Record<ParamKey, { label: string; short?: string; unit?: 's'; min: number; max: number }> = {
  reps: { label: 'Reps', min: 1, max: 50 },
  sets: { label: 'Sets', min: 1, max: 10 },
  hold: { label: 'Hold', unit: 's', min: 1, max: 120 },
  up: { label: 'Up', unit: 's', min: 1, max: 10 },
  down: { label: 'Down', unit: 's', min: 1, max: 10 },
  rest: { label: 'Rest between sets', short: 'Rest', unit: 's', min: 10, max: 300 },
  perDay: { label: 'Times per day', min: 1, max: 5 },
  daysPerWeek: { label: 'Days per week', min: 1, max: 7 },
};
export const PER_DAY_OPTIONS = ['1', '2', '3', '1 to 2', '1 to 3', '2 to 3'];
// Core set shown by default for each type.
export const CORE: Record<ExType, ParamKey[]> = {
  stretching: ['hold', 'perDay', 'daysPerWeek'],
  isometric: ['reps', 'hold', 'sets', 'daysPerWeek'],
  concentric: ['reps', 'hold', 'sets', 'daysPerWeek'],
  eccentric: ['reps', 'down', 'sets', 'daysPerWeek'],
};
// Only these can be added with "+ Add parameter".
export const ADDABLE: ParamKey[] = ['up', 'down', 'rest'];
export const addableFor = (t: ExType, p: Params) => ADDABLE.filter((k) => !CORE[t].includes(k) && p[k] === undefined);

// Seeded config for all practitioners. No admin UI.
export const GLOBAL_DEFAULTS: Record<ExType, Params> = {
  stretching: { hold: '30', perDay: '1 to 3', daysPerWeek: '7' },
  isometric: { reps: '1', hold: '10', sets: '3', daysPerWeek: '7' },
  concentric: { reps: '10', hold: '2', sets: '3', daysPerWeek: '3' },
  eccentric: { reps: '10', down: '4', sets: '3', daysPerWeek: '3' },
};

// Default cue line per type in the text template. Each exercise can edit its own.
export const DEFAULT_TYPE_CUES: Record<StrengthType, string> = {
  isometric: 'Hold still at the midpoint for 10s.',
  concentric: 'Lift with control, 2s up.',
  eccentric: 'Lower slowly over 4s.',
};

export const keysOf = (p: Params) => PARAM_ORDER.filter((k) => p[k] !== undefined);
const perDayText = (v: string) => (v === '1' ? 'once a day' : v === '2' ? 'twice a day' : `${v} times a day`);
export const paramText = (k: ParamKey, v: string) => {
  switch (k) {
    case 'reps': return `${v} ${v === '1' ? 'rep' : 'reps'}`;
    case 'sets': return `${v} ${v === '1' ? 'set' : 'sets'}`;
    case 'hold': return `${v}s hold`;
    case 'up': return `${v}s up`;
    case 'down': return `${v}s down`;
    case 'rest': return `${v}s rest between sets`;
    case 'perDay': return perDayText(v);
    case 'daysPerWeek': return v === '7' ? 'every day' : `${v}x a week`;
  }
};
export const formatParams = (p: Params) => keysOf(p).map((k) => paramText(k, p[k] as string)).join(', ');
export const valueText = (k: ParamKey, v: string) => (k === 'daysPerWeek' ? (v === '7' ? 'Every day' : `${v} days`) : PARAM_META[k].unit ? `${v}s` : v);
export const sameParams = (a: Params, b: Params) => { const ka = keysOf(a), kb = keysOf(b); return ka.length === kb.length && ka.every((k) => a[k] === b[k]); };
