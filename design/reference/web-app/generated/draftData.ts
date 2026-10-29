export type ListKey = 'steps' | 'cues' | 'mistakes' | 'regressions' | 'progressions' | 'precautions';
export type TextKey = 'name' | 'aliases' | 'region' | 'equipment' | 'start' | 'sets' | 'reps' | 'cueIsometric' | 'cueConcentric' | 'cueEccentric';
export type DraftFields = Record<TextKey, string> & Record<ListKey, string[]>;

export const COPENHAGEN_DRAFT: DraftFields = {
  name: 'Copenhagen plank, short lever',
  aliases: 'Short lever Copenhagen, Adductor side plank, Bent knee Copenhagen',
  region: 'Hip, groin (adductors)',
  equipment: 'Bench or sturdy chair, mat',
  start: 'Lie on your side on a mat, propped on your forearm with the elbow under the shoulder. Rest the inside of your top knee on the bench. Bottom leg bent on the floor.',
  steps: [
    'Brace your trunk.',
    'Press the top knee into the bench and lift your hips until your body is in a straight line.',
    'Hold for the set time, keep breathing.',
    'Lower your hips slowly to the mat.',
  ],
  cues: ['Squeeze the knee down into the bench.', 'Keep hips stacked.', 'Long neck, look forward.'],
  mistakes: ['Hips sagging or rolling back.', 'Shoulder shrugging toward the ear.', 'Holding the breath.'],
  regressions: ['Shorter hold (5 to 10s).', 'Lower bench.', 'Keep the bottom knee on the floor for support.'],
  progressions: ['Longer hold.', 'Lift the bottom leg up to the bench.', 'Move to the long lever version (foot on bench).'],
  precautions: [
    'Stop if there is sharp groin pain.',
    'Use a cushion under the knee if the bench is hard.',
    'Avoid with an acute shoulder injury on the support side.',
  ],
  sets: '3',
  reps: '20s hold each side',
  cueIsometric: 'Hold your hips up and still for 10s, each side.',
  cueConcentric: 'Lift your hips with control, 2s up, then lower.',
  cueEccentric: 'Lift your hips, then lower them slowly over 4s.',
};

// Demo only: what "Rewrite with AI" returns for each text field.
export const AI_REWRITES: Partial<Record<TextKey, string>> = {
  name: 'Copenhagen plank, short lever',
  aliases: 'Short lever Copenhagen, Bent knee Copenhagen plank, Adductor side plank',
  region: 'Hip and inner thigh (adductors)',
  equipment: 'Mat and a bench or sturdy chair',
  cueIsometric: 'Keep your hips lifted and still for 10s on each side.',
  start: 'Lie on your side with your forearm on the mat and your elbow under your shoulder. Put the inside of your top knee on the bench. Bend your bottom leg and rest it on the floor.',
};

export const TEXT_META: { key: TextKey; label: string; multiline?: boolean }[] = [
  { key: 'name', label: 'Name' },
  { key: 'aliases', label: 'Aliases' },
  { key: 'region', label: 'Body region' },
  { key: 'equipment', label: 'Equipment' },
];

export const LIST_META: { key: ListKey; label: string; numbered?: boolean; defaultOpen?: boolean }[] = [
  { key: 'steps', label: 'Steps', numbered: true, defaultOpen: true },
  { key: 'cues', label: 'Cues' },
  { key: 'mistakes', label: 'Common mistakes' },
  { key: 'regressions', label: 'Regressions' },
  { key: 'progressions', label: 'Progressions' },
  { key: 'precautions', label: 'Precautions' },
];
