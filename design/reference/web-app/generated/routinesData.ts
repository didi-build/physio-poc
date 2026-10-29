// v11 (DIDI-852, locked on DIDI-594, Oct 25, 2026): Routines are ready-made programs for common conditions.
// They mirror the exercise library: a community library anyone can add to or edit (with version history),
// plus a personal copy for each practitioner (My routines). Using a routine for a patient makes a separate
// program copy with a practitioner-picked name and a code. Routine edits are never pushed to existing copies.
import type { ExType, Params } from './programModel';

export type RRow = { ex: string; type: ExType; params: Params; note?: string };
export type RVersion = { v: number; by: 'you' | 'practitioner'; date: string; summary: string; changes: string[]; rows?: RRow[]; from?: number };
export type Routine = { id: string; name: string; condition: string; region: string; version: number; addedBy: 'you' | 'practitioner'; updated: string; uses: number; about: string; rows: RRow[]; draft?: boolean };
// v12 (locked Oct 25, 2026, 5:29 PM ET): a saved routine is a frozen copy at version v, like My exercises.
// When the community version moves on, it is flagged and the practitioner can adopt it or keep theirs.
export type MyRoutine = { savedAt: string; usedAt?: string; v: number; rows: RRow[]; changes?: string[]; seenV: number };

// v12 (locked Oct 25, 2026, 5:35 and 5:45 PM ET): a fixed list we set up, contents still to come from Kojo, possibly empty at launch.
// These five are SAMPLE values for the concept only, not real data.
export const SAMPLE_CONDITIONS = ['Arthritis', 'After surgery', 'Back pain', 'Neck and shoulder', 'Sprain'];
export const R_REGIONS = ['All', 'Knee', 'Hip', 'Ankle', 'Shoulder', 'Lower back', 'Neck'];

export const ROUTINES: Routine[] = [
  { id: 'rt-knee-oa', name: 'Knee osteoarthritis, starter', condition: 'Arthritis', region: 'Knee', version: 3, addedBy: 'practitioner', updated: 'Oct 12, 2026', uses: 31,
    about: 'Gentle range of motion and strength for knee osteoarthritis. Three days a week, about 15 minutes.',
    rows: [
      { ex: 'ex1', type: 'concentric', params: { reps: '10', hold: '2', sets: '2', daysPerWeek: '3' } },
      { ex: 'ex2', type: 'concentric', params: { reps: '10', hold: '2', sets: '3', daysPerWeek: '3' } },
      { ex: 'ex7', type: 'concentric', params: { reps: '8', hold: '2', sets: '2', daysPerWeek: '3' }, note: 'Use a higher chair to start' },
      { ex: 'ex4', type: 'isometric', params: { reps: '1', hold: '20', sets: '3', daysPerWeek: '3' } },
      { ex: 'ex13', type: 'stretching', params: { hold: '30', perDay: '1 to 2', daysPerWeek: '7' } },
    ] },
  { id: 'rt-lbp', name: 'Low back pain, first two weeks', condition: 'Back pain', region: 'Lower back', version: 4, addedBy: 'practitioner', updated: 'Oct 20, 2026', uses: 26,
    about: 'Early movement for non-specific low back pain. Short sessions, every day.',
    rows: [
      { ex: 'ex6', type: 'isometric', params: { reps: '1', hold: '10', sets: '3', daysPerWeek: '7' } },
      { ex: 'ex12', type: 'stretching', params: { hold: '30', perDay: '1 to 3', daysPerWeek: '7' } },
      { ex: 'ex5', type: 'concentric', params: { reps: '10', hold: '2', sets: '2', daysPerWeek: '7' } },
    ] },
  { id: 'rt-hip-oa', name: 'Hip osteoarthritis, mobility and strength', condition: 'Arthritis', region: 'Hip', version: 2, addedBy: 'you', updated: 'Sep 30, 2026', uses: 18,
    about: 'Hip strength and mobility for osteoarthritis. Three days a week.',
    rows: [
      { ex: 'ex6', type: 'concentric', params: { reps: '10', hold: '2', sets: '3', daysPerWeek: '3' } },
      { ex: 'ex5', type: 'concentric', params: { reps: '12', hold: '2', sets: '2', daysPerWeek: '3' } },
      { ex: 'ex7', type: 'concentric', params: { reps: '8', hold: '2', sets: '3', daysPerWeek: '3' } },
      { ex: 'ex12', type: 'stretching', params: { hold: '30', perDay: '1 to 2', daysPerWeek: '7' } },
    ] },
  { id: 'rt-tkr', name: 'Knee replacement, weeks 2 to 6', condition: 'After surgery', region: 'Knee', version: 2, addedBy: 'practitioner', updated: 'Oct 18, 2026', uses: 14,
    about: 'Range of motion and quad control after a total knee replacement. Follow the surgeon\'s protocol first.',
    rows: [
      { ex: 'ex1', type: 'concentric', params: { reps: '15', hold: '2', sets: '3', daysPerWeek: '7' } },
      { ex: 'ex2', type: 'concentric', params: { reps: '10', hold: '2', sets: '3', daysPerWeek: '7' } },
      { ex: 'ex3', type: 'isometric', params: { reps: '1', hold: '10', sets: '3', daysPerWeek: '7' } },
      { ex: 'ex12', type: 'stretching', params: { hold: '30', perDay: '2 to 3', daysPerWeek: '7' } },
    ] },
  { id: 'rt-ankle', name: 'Ankle sprain, phase 1', condition: 'Sprain', region: 'Ankle', version: 1, addedBy: 'practitioner', updated: 'Oct 5, 2026', uses: 9,
    about: 'First weeks after a lateral ankle sprain, once walking is comfortable.',
    rows: [
      { ex: 'ex13', type: 'stretching', params: { hold: '30', perDay: '1 to 3', daysPerWeek: '7' } },
      { ex: 'ex8', type: 'concentric', params: { reps: '12', hold: '2', sets: '2', daysPerWeek: '7' } },
      { ex: 'ex14', type: 'eccentric', params: { reps: '10', down: '4', sets: '2', daysPerWeek: '3' } },
    ] },
  { id: 'rt-neck', name: 'Neck and shoulder, desk posture', condition: 'Neck and shoulder', region: 'Neck', version: 1, addedBy: 'practitioner', updated: 'Sep 12, 2026', uses: 7,
    about: 'Short breaks for desk-related neck and shoulder pain.',
    rows: [
      { ex: 'ex10', type: 'isometric', params: { reps: '5', hold: '5', sets: '2', daysPerWeek: '7' } },
      { ex: 'ex9', type: 'concentric', params: { reps: '12', hold: '2', sets: '2', daysPerWeek: '3' } },
    ] },
];

const KNEE_V2: RRow[] = [
  { ex: 'ex1', type: 'concentric', params: { reps: '10', hold: '2', sets: '2', daysPerWeek: '3' } },
  { ex: 'ex2', type: 'concentric', params: { reps: '10', hold: '2', sets: '3', daysPerWeek: '3' } },
  { ex: 'ex7', type: 'concentric', params: { reps: '8', hold: '2', sets: '2', daysPerWeek: '3' }, note: 'Use a higher chair to start' },
  { ex: 'ex4', type: 'isometric', params: { reps: '1', hold: '15', sets: '3', daysPerWeek: '3' } },
];
const KNEE_V1: RRow[] = [
  { ex: 'ex1', type: 'concentric', params: { reps: '10', hold: '2', sets: '2', daysPerWeek: '3' } },
  { ex: 'ex2', type: 'concentric', params: { reps: '10', hold: '2', sets: '3', daysPerWeek: '3' } },
  { ex: 'ex7', type: 'concentric', params: { reps: '10', hold: '2', sets: '2', daysPerWeek: '3' } },
  { ex: 'ex4', type: 'isometric', params: { reps: '1', hold: '15', sets: '3', daysPerWeek: '3' } },
];
export const LBP_V3: RRow[] = [
  { ex: 'ex6', type: 'isometric', params: { reps: '1', hold: '10', sets: '3', daysPerWeek: '7' } },
  { ex: 'ex12', type: 'stretching', params: { hold: '30', perDay: '1 to 3', daysPerWeek: '7' } },
  { ex: 'ex5', type: 'concentric', params: { reps: '10', hold: '2', sets: '2', daysPerWeek: '3' } },
];
export const ROUTINE_HISTORY: Record<string, RVersion[]> = {
  'rt-knee-oa': [
    { v: 3, by: 'practitioner', date: 'Oct 12, 2026', summary: 'Added Calf stretch', changes: ['Added Calf stretch, 30s hold', 'Wall sit hold 15s to 20s'] },
    { v: 2, by: 'you', date: 'Sep 3, 2026', summary: 'Sit to stand easier start', changes: ['Sit to stand 10 to 8 reps', 'Added the note "Use a higher chair to start"'], rows: KNEE_V2 },
    { v: 1, by: 'practitioner', date: 'Aug 14, 2026', summary: 'First version', changes: ['Heel slides, Straight leg raise, Sit to stand, Wall sit'], rows: KNEE_V1 },
  ],
  'rt-lbp': [
    { v: 4, by: 'practitioner', date: 'Oct 20, 2026', summary: 'Clamshell every day', changes: ['Clamshell 3 to 7 days a week'] },
    { v: 3, by: 'practitioner', date: 'Sep 28, 2026', summary: 'Added Clamshell', changes: ['Added Clamshell, 2 sets of 10'], rows: LBP_V3 },
    { v: 2, by: 'you', date: 'Sep 10, 2026', summary: 'Shorter holds', changes: ['Glute bridge hold 15s to 10s'], rows: LBP_V3.slice(0, 2) },
    { v: 1, by: 'practitioner', date: 'Aug 30, 2026', summary: 'First version', changes: ['Glute bridge, Hamstring stretch'], rows: [{ ...LBP_V3[0], params: { ...LBP_V3[0].params, hold: '15' } }, LBP_V3[1]] },
  ],
};
export const historyForRoutine = (r: Routine, h: Record<string, RVersion[]>): RVersion[] =>
  h[r.id] ?? Array.from({ length: r.version }, (_, i) => r.version - i).map((v) => (v === 1
    ? { v, by: r.addedBy, date: v === r.version ? r.updated : 'Aug 20, 2026', summary: 'First version', changes: ['Created with ' + r.rows.length + ' exercises'], rows: r.rows }
    : { v, by: 'practitioner' as const, date: v === r.version ? r.updated : 'Sep 15, 2026', summary: 'Dose changes', changes: ['Sets and reps adjusted'], rows: r.rows }));
// Rows of a version: the live version uses the routine itself.
export const rowsOfVersion = (r: Routine, h: Record<string, RVersion[]>, v: number): RRow[] => (v === r.version ? r.rows : historyForRoutine(r, h).find((x) => x.v === v)?.rows ?? r.rows);

// Seed: My routines. Knee OA has one personal change. Low back pain was saved at v3, so it shows "Updated to v4".
export const SEED_MY_ROUTINES: Record<string, MyRoutine> = {
  'rt-knee-oa': { savedAt: 'Oct 2', usedAt: 'Oct 22', v: 3, seenV: 3, changes: ['Wall sit hold 20s to 30s'], rows: [
    { ex: 'ex1', type: 'concentric', params: { reps: '10', hold: '2', sets: '2', daysPerWeek: '3' } },
    { ex: 'ex2', type: 'concentric', params: { reps: '10', hold: '2', sets: '3', daysPerWeek: '3' } },
    { ex: 'ex7', type: 'concentric', params: { reps: '8', hold: '2', sets: '2', daysPerWeek: '3' }, note: 'Use a higher chair to start' },
    { ex: 'ex4', type: 'isometric', params: { reps: '1', hold: '30', sets: '3', daysPerWeek: '3' } },
    { ex: 'ex13', type: 'stretching', params: { hold: '30', perDay: '1 to 2', daysPerWeek: '7' } },
  ] },
  'rt-hip-oa': { savedAt: 'Sep 30', usedAt: 'Oct 23', v: 2, seenV: 2, rows: ROUTINES[2].rows },
  // Saved at v3. The community is now on v4, so this copy is flagged.
  'rt-lbp': { savedAt: 'Oct 10', v: 3, seenV: 3, rows: LBP_V3 },
  'rt-draft-shoulder': { savedAt: 'Oct 25', v: 0, seenV: 0, rows: [] },
};
// A routine you started and haven't published. Like exercise drafts, only you can see it.
export const DRAFT_ROUTINE: Routine = { id: 'rt-draft-shoulder', name: 'Shoulder impingement, early', condition: 'Neck and shoulder', region: 'Shoulder', version: 0, addedBy: 'you', updated: 'Oct 25, 2026', uses: 0, draft: true,
  about: 'Pain-free range and rotator cuff activation.',
  rows: [
    { ex: 'ex9', type: 'concentric', params: { reps: '12', hold: '2', sets: '2', daysPerWeek: '3' } },
    { ex: 'ex10', type: 'isometric', params: { reps: '5', hold: '5', sets: '2', daysPerWeek: '7' } },
  ] };

// Sent programs: each has a name the practitioner picked and a unique code. No patient details.
export type ProgFrom = { id: string; name: string; v: number; direct: boolean };
export type Prog = { code: string; t: string; n: number; s: string; from?: ProgFrom; note?: string; open: boolean; sent?: string };
export const SEED_PROGS: Prog[] = [
  { code: 'PRG-7K3Q', t: 'Knee rehab, week 1', n: 6, s: '', open: true, sent: 'Oct 24' },
  { code: 'PRG-4H7N', t: 'Knee OA, Tuesday group', n: 5, s: 'Link expires Oct 22, 2027', from: { id: 'rt-knee-oa', name: 'Knee osteoarthritis, starter', v: 3, direct: true }, open: true, sent: 'Oct 22' },
  { code: 'PRG-2M8D', t: 'Hip strength, phase 2', n: 4, s: 'Link never expires', from: { id: 'rt-hip-oa', name: 'Hip osteoarthritis, mobility and strength', v: 2, direct: false }, note: 'Edited after sending, Oct 23', open: true, sent: 'Oct 23' },
  { code: 'PRG-8R2V', t: 'Knee OA, Monday 9am group', n: 5, s: 'Link expires Oct 20, 2027', from: { id: 'rt-knee-oa', name: 'Knee osteoarthritis, starter', v: 2, direct: true }, open: true, sent: 'Oct 20' },
  { code: 'PRG-5C2W', t: 'Ankle mobility, general', n: 4, s: 'Link closed Oct 20. Program kept to reuse.', open: true, sent: 'Oct 1' },
];
