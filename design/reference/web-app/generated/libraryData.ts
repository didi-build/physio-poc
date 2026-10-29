// v8 (Oct 24, 2026): DIDI-828 answers and DIDI-829 picks, locked on DIDI-594. Merges are permanent, regeneration is capped at 5 per practitioner per day,
// programs save as drafts and only Publish changes the live link.
// v7 (Oct 24, 2026, Diadem's 8 picks, locked on DIDI-594 at 2:43 PM ET):
// - 1A keep both: Edit for everyone (shared entry) plus private Edit my copy.
// - 2C requests and drafts are visible to all practitioners; any practitioner can approve.
// - 3C similar exercises on Request it, plus Report duplicate and a simple merge that keeps history.
// - 4A regenerated media on an approved exercise goes live as a new version, restorable.
// - 5A the same share link always shows the latest program.
// - 6A one link per program; Never is the path for general programs.
// - 7B expiry adds a custom date (per program only, not as a default).
// - 8B a program can be deleted; that closes any open link.
//
// v6 (Oct 24, 2026, locked Product direction on DIDI-594):
// - The shared library is open to edit, wiki style. Any practitioner can edit an approved
//   exercise. Saving creates the next version for everyone. Every version is kept in
//   Version history, and anyone can restore an older one (restoring saves a new version).
// - Program rows still pin the version they were built with, so edits never change shared programs.
// - Kept from v5 until Diadem answers the open questions: author-only drafts and requests,
//   and the private My exercises layer below.
//
// v5 data model (CTO, DIDI-809):
// - The library is shared. Approved exercises are visible to every practitioner.
//   Drafts and requests are visible only to their author.
// - "My exercises" is an override layer, not a full copy. Per exercise it stores:
//   pinned (favourite), saved and last used dates, text overrides for changed fields only
//   (title, description, cue per type) and parameter overrides keyed by TYPE.
//   Images and video always come from the library and can't be overridden.
// - A text override remembers the library value it was based on. If the library changes
//   later, the field shows "Library updated" and offers "Use library version".
// - Precedence for a new program row: my exercise override, then my type defaults, then global.
// - A program row snapshots the resolved parameters and text when it is added.
import { DEFAULT_TYPE_CUES, ExType, Kind, Params } from './programModel';

export type AddedBy = 'library' | 'practitioner' | 'you';
export type Exercise = {
  id: string; name: string; aliases: string[]; region: string; equipment: string; version: number; pose: string; kind: Kind;
  addedBy: AddedBy; updated: string; description: string; cues?: Partial<Record<ExType, string>>; steps?: string[]; precautions?: string[];
};
export type TextKey5 = 'title' | 'description' | 'cue_stretching' | 'cue_isometric' | 'cue_concentric' | 'cue_eccentric';
export type TextOverride = { value: string; base: string };
export type MyExercise = { pinned: boolean; savedAt: string; lastUsed?: string; text: Partial<Record<TextKey5, TextOverride>>; params: Partial<Record<ExType, Params>>; notes: string };
export type MyExercises = Record<string, MyExercise>;

export const cueKey = (t: ExType) => `cue_${t}` as TextKey5;
const STRETCH_CUE = 'Ease into the stretch and breathe. No bouncing.';

export const LIBRARY: Exercise[] = [
  { id: 'ex11', name: 'Squat', aliases: ['Bodyweight squat', 'Sit back squat'], region: 'Knee, hip', equipment: 'None, or a chair behind you', version: 3, pose: 'squat', kind: 'strength', addedBy: 'library', updated: 'Oct 22, 2026',
    description: 'Stand with feet hip width apart. Sit the hips back and down as if to a chair, then stand tall.',
    cues: { isometric: 'Hold at a comfortable depth for 10s.', concentric: 'Stand up with control, 2s up.', eccentric: 'Lower slowly over 4s, knees tracking over toes.' },
    steps: ['Stand with feet hip width apart, arms forward.', 'Push the hips back and bend the knees.', 'Go as low as is comfortable, chest up.', 'Push through the whole foot to stand tall.'],
    precautions: ['Keep knees in line with the second toe.', 'Use a chair behind you as a depth target if balance is limited.'] },
  { id: 'ex12', name: 'Hamstring stretch', aliases: ['Seated hamstring stretch', 'Long sit reach'], region: 'Knee, hip', equipment: 'Mat', version: 1, pose: 'hamstring-stretch', kind: 'stretch', addedBy: 'library', updated: 'Sep 30, 2026',
    description: 'Sit with one leg straight and reach forward from the hips until a gentle stretch is felt behind the thigh.',
    cues: { stretching: 'Hinge from the hips, keep the back long.' },
    steps: ['Sit on a mat with one leg straight, the other bent.', 'Sit tall, then hinge forward from the hips.', 'Stop at a gentle stretch and hold.', 'Return slowly and switch sides.'] },
  { id: 'ex13', name: 'Calf stretch', aliases: ['Wall calf stretch', 'Gastrocnemius stretch'], region: 'Ankle', equipment: 'Wall', version: 1, pose: 'calf-stretch', kind: 'stretch', addedBy: 'practitioner', updated: 'Oct 8, 2026',
    description: 'Hands on a wall, one foot back with the heel down, lean forward until the calf stretches.',
    cues: { stretching: 'Back heel stays down, back knee straight.' } },
  { id: 'ex1', name: 'Heel slides', aliases: ['Heel slide', 'Supine knee flexion'], region: 'Knee', equipment: 'None', version: 2, pose: 'heel-slides', kind: 'strength', addedBy: 'library', updated: 'Aug 14, 2026',
    description: 'Lying on your back, slide the heel toward you to bend the knee, then slide it back out.' },
  { id: 'ex2', name: 'Straight leg raise', aliases: ['SLR', 'Supine leg raise'], region: 'Knee, hip', equipment: 'None', version: 1, pose: 'straight-leg-raise', kind: 'strength', addedBy: 'library', updated: 'Jul 2, 2026',
    description: 'Lying on your back with one knee bent, tighten the thigh of the straight leg and lift it to the height of the other knee.' },
  { id: 'ex3', name: 'Terminal knee extension', aliases: ['TKE', 'Band knee extension'], region: 'Knee', equipment: 'Resistance band', version: 1, pose: 'terminal-knee-extension', kind: 'strength', addedBy: 'library', updated: 'Jul 2, 2026',
    description: 'With a band behind the knee, straighten the knee fully against the band, then let it bend slightly.' },
  { id: 'ex4', name: 'Wall sit', aliases: ['Wall squat hold'], region: 'Knee', equipment: 'Wall', version: 1, pose: 'wall-sit', kind: 'strength', addedBy: 'library', updated: 'Jun 18, 2026',
    description: 'Back against a wall, slide down until the knees are bent, and hold.' },
  { id: 'ex5', name: 'Clamshell', aliases: ['Side-lying clam', 'Clams'], region: 'Hip', equipment: 'Optional band', version: 3, pose: 'clamshell', kind: 'strength', addedBy: 'practitioner', updated: 'Sep 9, 2026',
    description: 'Lying on your side with knees bent, keep the feet together and lift the top knee.' },
  { id: 'ex6', name: 'Glute bridge', aliases: ['Bridge', 'Supine bridge'], region: 'Hip, lower back', equipment: 'Mat', version: 2, pose: 'glute-bridge', kind: 'strength', addedBy: 'library', updated: 'Aug 30, 2026',
    description: 'Lying on your back with knees bent, squeeze the glutes and lift the hips into a straight line.' },
  { id: 'ex7', name: 'Sit to stand', aliases: ['Chair stand', 'STS'], region: 'Knee, hip', equipment: 'Chair', version: 1, pose: 'sit-to-stand', kind: 'strength', addedBy: 'library', updated: 'Jun 18, 2026',
    description: 'From sitting on a chair, lean forward and stand up without using the hands, then sit back down with control.' },
  { id: 'ex8', name: 'Calf raise', aliases: ['Heel raise'], region: 'Ankle', equipment: 'None', version: 1, pose: 'calf-raise', kind: 'strength', addedBy: 'library', updated: 'Jun 18, 2026',
    description: 'Standing, rise up onto the balls of the feet, then lower the heels.' },
  { id: 'ex9', name: 'Band external rotation', aliases: ['Shoulder ER with band'], region: 'Shoulder', equipment: 'Resistance band', version: 1, pose: 'band-external-rotation', kind: 'strength', addedBy: 'practitioner', updated: 'Sep 22, 2026',
    description: 'Elbow at your side and bent to 90 degrees, rotate the forearm outward against a band.' },
  { id: 'ex10', name: 'Chin tuck', aliases: ['Cervical retraction'], region: 'Neck', equipment: 'None', version: 1, pose: 'chin-tuck', kind: 'strength', addedBy: 'practitioner', updated: 'Sep 22, 2026',
    description: 'Sitting tall, draw the chin straight back to make a gentle double chin, then relax.' },
  // Demo duplicate of Calf raise, added by another practitioner. Used for Report duplicate and merge.
  { id: 'ex14', name: 'Standing heel raises', aliases: ['Heel raises, standing'], region: 'Ankle', equipment: 'Wall for balance', version: 1, pose: 'calf-raise', kind: 'strength', addedBy: 'practitioner', updated: 'Oct 19, 2026',
    description: 'Stand holding a wall, rise up onto your toes, then lower slowly.' },
];

export const libCue = (e: Exercise, t: ExType) => e.cues?.[t] ?? (t === 'stretching' ? STRETCH_CUE : DEFAULT_TYPE_CUES[t]);
export const libText = (e: Exercise, k: TextKey5): string => (k === 'title' ? e.name : k === 'description' ? e.description : libCue(e, k.slice(4) as ExType));
export const myText = (e: Exercise, m: MyExercise | undefined, k: TextKey5) => m?.text[k]?.value ?? libText(e, k);
export const isLibUpdated = (e: Exercise, m: MyExercise | undefined, k: TextKey5) => !!m?.text[k] && m.text[k]!.base !== libText(e, k);
export const editCount = (m?: MyExercise) => (m ? Object.keys(m.text).length + Object.keys(m.params).length : 0);
export const updatedFields = (e: Exercise, m?: MyExercise) => (m ? (Object.keys(m.text) as TextKey5[]).filter((k) => isLibUpdated(e, m, k)) : []);
export const stepsFor = (e: Exercise) => e.steps ?? ['Set up in the start position shown in the image.', 'Move slowly to the end position.', 'Return with control. Keep breathing throughout.'];
export const GENERAL_PRECAUTIONS = ['Stop if pain is sharp, or keeps rising during or after the set.', 'Work in a range that feels controlled and comfortable.'];
export const ADDED_BY_LABEL: Record<AddedBy, string> = { library: 'Didi library team', practitioner: 'Added by a practitioner', you: 'Added by you' };

// Suggested extras shown on the full details screen (tempo and rest), on top of the seeded type defaults.
export const SUGGESTED_EXTRAS: Record<ExType, Params> = {
  stretching: { reps: '3', rest: '15' },
  isometric: { rest: '60', perDay: '1' },
  concentric: { up: '2', down: '2', rest: '60', perDay: '1' },
  eccentric: { up: '1', rest: '90', perDay: '1' },
};

// Demo seed for Kojo. Squat's eccentric cue was edited before the library changed it on Oct 21.
export const SEED_MY: MyExercises = {
  ex11: { pinned: true, savedAt: 'Oct 2', lastUsed: 'Oct 22', notes: 'Good first loaded exercise. A chair behind works well as a depth target.',
    text: {
      description: { value: 'Sit back to a chair, tap it lightly, then stand. Weight through the whole foot.', base: LIBRARY[0].description },
      cue_eccentric: { value: 'Lower over 5s until you touch the chair.', base: 'Lower slowly over 4s.' },
    },
    params: { eccentric: { reps: '8', down: '5', sets: '3', daysPerWeek: '3' } } },
  ex1: { pinned: true, savedAt: 'Sep 28', lastUsed: 'Oct 22', notes: '', text: {}, params: {} },
  ex13: { pinned: true, savedAt: 'Oct 15', notes: '', text: {}, params: { stretching: { hold: '45', perDay: '2', daysPerWeek: '7' } } },
  ex12: { pinned: false, savedAt: 'Oct 5', lastUsed: 'Oct 22', notes: '', text: {}, params: {} },
  ex3: { pinned: false, savedAt: 'Oct 22', lastUsed: 'Oct 22', notes: '', text: {}, params: {} },
  ex4: { pinned: false, savedAt: 'Oct 22', lastUsed: 'Oct 22', notes: 'Shorter holds for the first week.', text: { cue_isometric: { value: 'Hold where you feel the thighs working, not the knees.', base: 'Hold still at the midpoint for 10s.' } }, params: {} },
  ex6: { pinned: false, savedAt: 'Oct 12', notes: '', text: {}, params: {} },
};
const ORDER = (d?: string) => (d ? new Date(`${d}, 2026`).getTime() : 0);
export const sortMine = (ids: string[], my: MyExercises) => [...ids].sort((a, b) => Number(my[b].pinned) - Number(my[a].pinned) || Math.max(ORDER(my[b].lastUsed), ORDER(my[b].savedAt)) - Math.max(ORDER(my[a].lastUsed), ORDER(my[a].savedAt)));

// ---------- v6: version history for the shared library (open editing) ----------
export type LibSnap = { name: string; description: string; aliases: string[]; cues?: Partial<Record<ExType, string>>; steps?: string[] };
export type LibVersion = { v: number; by: AddedBy; date: string; summary: string; changes: string[]; snap?: LibSnap; media?: boolean; from?: string; merge?: boolean };
export const HISTORY_BY_LABEL: Record<AddedBy, string> = { library: 'Didi library team', practitioner: 'A practitioner', you: 'You' };
export const snapOf = (e: Exercise): LibSnap => ({ name: e.name, description: e.description, aliases: [...e.aliases], cues: e.cues ? { ...e.cues } : undefined, steps: e.steps ? [...e.steps] : undefined });

const sq = LIBRARY[0];
export const SEED_HISTORY: Record<string, LibVersion[]> = {
  ex11: [
    { v: 3, by: 'practitioner', date: 'Oct 22, 2026', summary: 'Regenerated the end image', changes: ['End image regenerated with the note "deeper squat, chair behind"', 'Text unchanged'], snap: snapOf(sq), media: true },
    { v: 2, by: 'practitioner', date: 'Oct 21, 2026', summary: 'Clearer eccentric cue', changes: ['Eccentric cue: added "knees tracking over toes"', 'Precautions: added the chair depth target'], snap: snapOf(sq) },
    { v: 1, by: 'library', date: 'Sep 12, 2026', summary: 'First approved version', changes: ['Approved after the AI draft review'], snap: { ...snapOf(sq), cues: { ...sq.cues, eccentric: 'Lower slowly over 4s.' } } },
  ],
  ex5: [
    { v: 3, by: 'practitioner', date: 'Sep 9, 2026', summary: 'Band made optional', changes: ['Equipment: "Resistance band" to "Optional band"'] },
    { v: 2, by: 'you', date: 'Aug 20, 2026', summary: 'Fixed a typo in the description', changes: ['Description: "lift the top knee"'] },
    { v: 1, by: 'practitioner', date: 'Aug 2, 2026', summary: 'First approved version', changes: ['Approved after the AI draft review'] },
  ],
};
export const historyFor = (e: Exercise, h: Record<string, LibVersion[]>): LibVersion[] =>
  h[e.id] ?? Array.from({ length: e.version }, (_, i) => e.version - i).map((v) => (v === 1
    ? { v, by: e.addedBy, date: v === e.version ? e.updated : 'Jun 2, 2026', summary: 'First approved version', changes: ['Approved after the AI draft review'] }
    : { v, by: 'practitioner' as AddedBy, date: v === e.version ? e.updated : 'Jul 2, 2026', summary: 'Text edits', changes: ['Steps and cues reworded'] }));

// ---------- v6: share link expiry ----------
// Default 1 year (changed Oct 25, 2026 from 90 days, DIDI-851, locked on DIDI-594). Each practitioner can set their own default, and each program can override it, including Never.
export type Expiry = '7' | '30' | '90' | '365' | 'never' | 'custom';
export const EXPIRY_OPTIONS: { id: Expiry; label: string; date: string }[] = [
  { id: '7', label: '1 week', date: 'Oct 30, 2026' },
  { id: '30', label: '30 days', date: 'Nov 22, 2026' },
  { id: '90', label: '90 days', date: 'Jan 21, 2027' },
  { id: '365', label: '1 year', date: 'Oct 23, 2027' },
  { id: 'never', label: 'Never', date: '' },
  { id: 'custom', label: 'Pick a date', date: '' },
];
// Custom dates are per program only. A fixed date can't be a default for future links.
export const DEFAULT_EXPIRY_OPTIONS = EXPIRY_OPTIONS.filter((o) => o.id !== 'custom');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const fmtDate = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return y && m && d ? `${MONTHS[m - 1]} ${d}, ${y}` : 'on a date you pick'; };
export const expiryDate = (x: Expiry, custom = '') => (x === 'custom' ? fmtDate(custom) : EXPIRY_OPTIONS.find((o) => o.id === x)!.date);
export const expiryLabel = (x: Expiry) => EXPIRY_OPTIONS.find((o) => o.id === x)!.label;
export const expiryLine = (x: Expiry, custom = '') => (x === 'never' ? 'Link never expires' : x === 'custom' ? `Link expires on ${expiryDate(x, custom)}` : `Link expires ${expiryDate(x, custom)}`);

// 3: 5 media regenerations per practitioner per day (DIDI-829, locked on DIDI-594).
export const REGEN_CAP = 5;
export const regenLeftText = (left: number) => `${left} of ${REGEN_CAP} left today`;
