import { useEffect, useMemo, useRef, useState } from 'react';
import { LoopVideo, PoseImage } from './ExerciseMedia';
import { EXERCISE_IMAGES } from './exerciseImages';
import { DRAFT_ROUTINE, MyRoutine, Prog, ProgFrom, R_REGIONS, ROUTINES, ROUTINE_HISTORY, RRow, RVersion, Routine, SAMPLE_CONDITIONS, SEED_MY_ROUTINES, SEED_PROGS, historyForRoutine, rowsOfVersion } from './routinesData';
import { AI_REWRITES, COPENHAGEN_DRAFT, DraftFields, LIST_META, TEXT_META, TextKey, ListKey } from './draftData';
import { CORE, DEFAULT_TYPE_CUES, ExType, GLOBAL_DEFAULTS, Kind, PARAM_META, PER_DAY_OPTIONS, ParamKey, Params, STRENGTH_TYPES, StrengthType, TYPES, TYPE_HINT, TYPE_LABEL, addableFor, formatParams, keysOf, sameParams, valueText } from './programModel';
import { ADDED_BY_LABEL, REGEN_CAP, regenLeftText, DEFAULT_EXPIRY_OPTIONS, EXPIRY_OPTIONS, Exercise, Expiry, expiryDate, fmtDate, GENERAL_PRECAUTIONS, HISTORY_BY_LABEL, LIBRARY, LibVersion, MyExercise, MyExercises, SEED_HISTORY, SEED_MY, SUGGESTED_EXTRAS, TextKey5, cueKey, editCount, expiryLabel, expiryLine, historyFor, isLibUpdated, libText, myText, snapOf, sortMine, stepsFor, updatedFields } from './libraryData';

type View = 'library' | 'requests' | 'review' | 'programs' | 'builder' | 'share' | 'defaults' | 'details' | 'mycopy' | 'libedit' | 'history' | 'linkpage' | 'dup' | 'conflict' | 'routines' | 'routine' | 'routinehistory' | 'routineedit';
type ProgState = { title: string; rows: Row[]; pub: { rows: Row[]; title: string; at: string }; saved: { rows: Row[]; title: string; at: string }; origin: ProgFrom | null; shareState: ShareState };
type REdit = { mode: 'new' | 'community' | 'mine'; id?: string; name: string; condition: string; region: string; about: string; rows: RRow[]; note: string; tried?: boolean };
type ReqStatus = 'drafting' | 'draft' | 'approved';
type Who = 'you' | 'practitioner';
const WHO: Record<Who, string> = { you: 'you', practitioner: 'a practitioner' };
type Req = { id: string; name: string; note: string; status: ReqStatus; when: string; by: Who; approvedBy?: Who; approvedOn?: string; t?: number };
type Source = 'exercise' | 'mine' | 'global' | 'routine';
type Row = { id: string; exerciseId?: string; name: string; type: ExType; params: Params; source: Source; cue?: string; edited?: boolean; notes: string; pending?: boolean; libV?: number };
type MyDefaults = Partial<Record<ExType, Params>>;
type Resolved = { params: Params; source: Source };
type DefaultFor = (t: ExType) => Resolved;
type ShareState = 'active' | 'confirm' | 'closed';
type KindFilter = 'All' | Kind;

// Fixed list of body regions (not free text).
const REGIONS = ['All', 'Knee', 'Hip', 'Ankle', 'Shoulder', 'Lower back', 'Neck'];
// v9 (#10, #11): two type pills, both on by default. The sub line explains each type, so there is no separate legend.
// v10 (#13): the type filter is a dropdown. (#16): filters and sort live in a collapsible "Filters & sort" section.
type TypeChoice = 'both' | 'strength' | 'stretch';
const TYPE_CHOICES: { id: TypeChoice; label: string; hint: string }[] = [
  { id: 'both', label: 'Strengthening & stretching', hint: 'Every exercise' },
  { id: 'strength', label: 'Strengthening', hint: 'Isometric, concentric, eccentric' },
  { id: 'stretch', label: 'Stretching', hint: 'Hold a stretch' },
];
type SortBy = 'used' | 'newest' | 'az';
const SORTS: { id: SortBy; label: string }[] = [{ id: 'used', label: 'Most used' }, { id: 'newest', label: 'Newest' }, { id: 'az', label: 'A to Z' }];
// Demo usage counts across all practitioners (concept data).
const USES: Record<string, number> = { ex11: 24, ex1: 21, ex3: 18, ex4: 15, ex2: 14, ex12: 12, ex6: 11, ex5: 9, ex7: 8, ex13: 7, ex8: 6, ex9: 4, ex10: 3, ex14: 1 };
const cphExercise = (f: DraftFields, by: 'you' | 'practitioner'): Exercise => ({ id: 'ex-cph', name: f.name, aliases: f.aliases.split(',').map((x) => x.trim()), region: 'Hip', equipment: f.equipment, version: 1, pose: CPH, kind: 'strength', addedBy: by, updated: 'Oct 24, 2026', description: f.start, cues: { isometric: f.cueIsometric, concentric: f.cueConcentric, eccentric: f.cueEccentric } });
const KIND_PILLS: { k: Kind; hint: string }[] = [{ k: 'stretch', hint: 'Hold a stretch' }, { k: 'strength', hint: 'Isometric, concentric, eccentric' }];
const SEED_MINE: MyDefaults = { concentric: { reps: '12', hold: '2', sets: '3', rest: '60', daysPerWeek: '3' } };
const TODAY = 'Oct 24';
// Precedence: my exercise override, then my type defaults, then global.
const resolveWith = (my: MyExercises, mine: MyDefaults, id: string | undefined, t: ExType): Resolved => {
  const o = id ? my[id]?.params[t] : undefined;
  if (o) return { params: { ...o }, source: 'exercise' };
  return mine[t] ? { params: { ...mine[t] }, source: 'mine' } : { params: { ...GLOBAL_DEFAULTS[t] }, source: 'global' };
};
const typeFallback = (mine: MyDefaults, t: ExType): Resolved => (mine[t] ? { params: { ...mine[t] }, source: 'mine' } : { params: { ...GLOBAL_DEFAULTS[t] }, source: 'global' });
// A new row snapshots the resolved parameters and text. Later edits to My exercises never change it.
const snapRow = (e: Exercise | { id?: string; name: string }, t: ExType, my: MyExercises, mine: MyDefaults, extra: Partial<Row> = {}): Row => {
  const ex = 'pose' in e ? (e as Exercise) : undefined;
  const m = e.id ? my[e.id] : undefined;
  return { id: `r${Math.random().toString(36).slice(2, 8)}`, exerciseId: e.id, name: ex ? myText(ex, m, 'title') : e.name, cue: ex ? myText(ex, m, cueKey(t)) : undefined, type: t, ...resolveWith(my, mine, e.id, t), notes: '', libV: ex?.version, ...extra };
};
const LINK = 'https://physio.didi.build/p/7K3Q-9XLM';
const CPH = 'copenhagen-plank-short-lever';

const cx = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(' ');
const btn = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';
const primary = `${btn} bg-teal-700 text-white hover:bg-teal-800 active:bg-teal-900`;
const secondary = `${btn} border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 active:bg-slate-100`;
const ghost = `${btn} text-slate-600 hover:bg-slate-100 active:bg-slate-200`;
const input = 'w-full min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base text-slate-900 placeholder:text-slate-400 transition focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20 lg:text-sm';
const iconBtn = 'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 active:bg-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:opacity-30';
const linkBtn = 'inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-teal-800 hover:bg-teal-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600';

const Icon = ({ d, className = 'h-5 w-5', sw = 1.8, fill }: { d: string; className?: string; sw?: number; fill?: boolean }) => (
  <svg viewBox="0 0 24 24" className={className} fill={fill ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
);
const I = {
  routine: 'M4 6h11M4 12h11M4 18h7M18 15l3 3-3 3M18 4v8',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  library: 'M4 5h4v14H4zM10 5h4v14h-4zM16 6l3.5-1 2 13.5-3.5 1z',
  inbox: 'M4 13l2.5-7h11l2.5 7v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 13h4.5l1 2h5l1-2H20',
  programs: 'M8 4h8v3H8zM6 5.5H5v14h14v-14h-1M8.5 11h7M8.5 15h5',
  refresh: 'M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4',
  pencil: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  sparkle: 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  trash: 'M5 7h14M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  close: 'M6 6l12 12M18 6L6 18',
  chevron: 'M6 9l6 6 6-6',
  right: 'M9 5l7 7-7 7',
  back: 'M15 5l-7 7 7 7',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  share: 'M12 15V4M8 8l4-4 4 4M6 12v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-7',
  check: 'M5 12.5l4.5 4.5L19 7',
  alert: 'M12 4l9 16H3zM12 10v4M12 17h.01',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  sliders: 'M4 7h10M18 7h2M4 17h4M12 17h8M14 4v6M8 14v6',
  grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  pin: 'M9 3h6M10 3v5.5L7 13h10l-3-4.5V3M12 13v8',
  bookmark: 'M6 4h12v16l-6-4-6 4z',
  bookmarkPlus: 'M6 4h12v16l-6-4-6 4zM12 7.5v5M9.5 10h5',
  stretch: 'M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4',
  dumbbell: 'M6.5 7v10M3.5 9.5v5M17.5 7v10M20.5 9.5v5M6.5 12h11',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v9H5z',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7M22 21v-1a6 6 0 0 0-4-5.6',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  printer: 'M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  merge: 'M6 4v6a6 6 0 0 0 6 6h6M6 20v-4M15 13l3 3-3 3',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
};

// Category colour coding: two calm tints that sit next to the teal brand.
const CAT: Record<Kind, { label: string; icon: string; card: string; badge: string; chipOn: string; chipOff: string; text: string; stripe: string }> = {
  stretch: { label: 'Stretching', icon: I.stretch, card: 'border-sky-200 bg-sky-50 hover:border-sky-300', badge: 'bg-white text-sky-700 ring-sky-200', chipOn: 'border-sky-700 bg-sky-700 text-white', chipOff: 'border-sky-200 bg-sky-50 text-sky-900 hover:border-sky-300', text: 'text-sky-800', stripe: 'border-l-sky-400' },
  strength: { label: 'Strengthening', icon: I.dumbbell, card: 'border-violet-200 bg-violet-50 hover:border-violet-300', badge: 'bg-white text-violet-700 ring-violet-200', chipOn: 'border-violet-700 bg-violet-700 text-white', chipOff: 'border-violet-200 bg-violet-50 text-violet-900 hover:border-violet-300', text: 'text-violet-800', stripe: 'border-l-violet-400' },
};
const CatIcon = ({ kind, className = 'h-7 w-7' }: { kind: Kind; className?: string }) => (
  <span className={cx('flex shrink-0 items-center justify-center rounded-full ring-1', CAT[kind].badge, className)} title={CAT[kind].label} aria-hidden><Icon d={CAT[kind].icon} className="h-4 w-4" sw={2} /></span>
);
const CatLine = ({ kind, label }: { kind: Kind; label?: string }) => (
  <span className={cx('text-xs font-semibold', CAT[kind].text)}><Icon d={CAT[kind].icon} className="mr-1 inline h-3.5 w-3.5 align-[-3px]" sw={2.2} />{label ?? CAT[kind].label}</span>
);

const Thumb = ({ pose, size = 'h-12 w-16' }: { pose: string; size?: string }) => {
  const img = EXERCISE_IMAGES[pose];
  if (!img) return <div className={cx('flex shrink-0 items-center justify-center rounded-lg border border-dashed border-amber-300 bg-amber-50 text-base font-semibold text-amber-700', size)} aria-label="Image pending review">?</div>;
  return <div className={cx('shrink-0 overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200', size)}><img src={img.start} alt="" loading="lazy" className="h-full w-full object-cover" /></div>;
};

const Badge = ({ tone, children }: { tone: 'green' | 'amber' | 'slate' | 'red' | 'teal'; children: React.ReactNode }) => {
  const t = { green: 'bg-emerald-50 text-emerald-700 ring-emerald-200', amber: 'bg-amber-50 text-amber-800 ring-amber-200', slate: 'bg-slate-100 text-slate-700 ring-slate-200', red: 'bg-red-50 text-red-700 ring-red-200', teal: 'bg-teal-50 text-teal-800 ring-teal-200' }[tone];
  return <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset', t)}>{children}</span>;
};
const Spinner = () => <span className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden />;
const UpdatedTag = () => <span className="inline-flex items-center gap-1 rounded-full bg-teal-700 px-2 py-0.5 text-[11px] font-semibold text-white shadow-sm"><Icon d={I.check} className="h-3 w-3" sw={2.6} />Updated</span>;

// Bottom sheet on phones, centered dialog from 1024 up.
const Sheet = ({ open, onClose, title, subtitle, children, footer, labelId, headerExtra }: { open: boolean; onClose: () => void; title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode; labelId: string; headerExtra?: React.ReactNode }) => {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center lg:p-6" role="dialog" aria-modal="true" aria-labelledby={labelId}>
      <button type="button" aria-label="Close" tabIndex={-1} onClick={onClose} className="absolute inset-0 bg-slate-900/45 animate-in fade-in" />
      <div className="relative flex max-h-[88vh] w-full flex-col rounded-t-3xl bg-white shadow-2xl animate-in slide-in-from-bottom-8 lg:max-w-lg lg:rounded-3xl lg:zoom-in-95">
        <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-slate-300 lg:hidden" aria-hidden />
        <div className="flex shrink-0 items-start gap-2 px-5 pb-2 pt-3">
          <div className="min-w-0 flex-1 pt-1.5">
            <h2 id={labelId} className="text-lg font-semibold">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
            {headerExtra}
          </div>
          <button type="button" onClick={onClose} aria-label="Close sheet" className={iconBtn}><Icon d={I.close} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">{children}</div>
        {footer && <div className="shrink-0 border-t border-slate-100 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">{footer}</div>}
      </div>
    </div>
  );
};

// Fixed bar above the phone tab bar. Hidden from 1024 up.
const MobileActionBar = ({ children }: { children: React.ReactNode }) => (
  <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
    <div className="mx-auto flex max-w-xl gap-2">{children}</div>
  </div>
);

const BackLink = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
  <button type="button" onClick={onClick} className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-xl px-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"><Icon d={I.back} className="h-4 w-4" sw={2.2} />{children}</button>
);

const KindTag = ({ kind }: { kind: Kind }) => (
  <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset', kind === 'stretch' ? 'bg-sky-50 text-sky-800 ring-sky-200' : 'bg-violet-50 text-violet-800 ring-violet-200')}><Icon d={CAT[kind].icon} className="h-3.5 w-3.5" sw={2.2} />{CAT[kind].label}</span>
);

const Segmented = <T extends string>({ options, value, onChange, label, labels }: { options: T[]; value: T; onChange: (v: T) => void; label: string; labels: Record<string, string> }) => (
  <div role="radiogroup" aria-label={label} className="grid rounded-xl bg-slate-100 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
    {options.map((o) => (
      <button key={o} type="button" role="radio" aria-checked={value === o} onClick={() => onChange(o)} className={cx('min-h-11 min-w-0 truncate rounded-lg px-1 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600', value === o ? 'bg-white text-teal-800 shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:text-slate-900')}>{labels[o]}</button>
    ))}
  </div>
);

const Tabs = <T extends string>({ tabs, value, onChange, label }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void; label: string }) => (
  <div role="tablist" aria-label={label} className="flex border-b border-slate-200">
    {tabs.map((t) => (
      <button key={t.id} type="button" role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)} className={cx('relative -mb-px flex min-h-12 flex-1 items-center justify-center gap-2 border-b-2 px-2 text-[15px] font-semibold transition focus:outline-none focus-visible:bg-teal-50 lg:flex-none lg:px-5', value === t.id ? 'border-teal-700 text-teal-800' : 'border-transparent text-slate-500 hover:text-slate-800')}>
        {t.label}{t.count !== undefined && <span className={cx('rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums', value === t.id ? 'bg-teal-50 text-teal-800' : 'bg-slate-100 text-slate-600')}>{t.count}</span>}
      </button>
    ))}
  </div>
);

const SOURCE_TEXT: Record<Source, string> = { exercise: 'From my exercise', mine: 'From my defaults', global: 'From global defaults', routine: 'From the routine' };
const SourceNote = ({ source }: { source: Source }) => (
  <span className={cx('inline-flex items-center gap-1 text-xs font-medium', source === 'global' ? 'text-slate-500' : 'text-teal-800')}>
    <span className={cx('h-1.5 w-1.5 rounded-full', source === 'global' ? 'bg-slate-400' : 'bg-teal-600')} aria-hidden />
    {SOURCE_TEXT[source]}
  </span>
);

// One stepper per parameter. "Times per day" also allows ranges.
const ParamStepper = ({ k, value, onChange, onRemove }: { k: ParamKey; value: string; onChange: (v: string) => void; onRemove?: () => void }) => {
  const m = PARAM_META[k];
  const step = (d: number) => {
    if (k === 'perDay') { const i = PER_DAY_OPTIONS.indexOf(value); onChange(PER_DAY_OPTIONS[Math.min(PER_DAY_OPTIONS.length - 1, Math.max(0, (i < 0 ? 0 : i) + d))]); return; }
    const inc = k === 'rest' ? 15 : k === 'hold' && +value >= 10 ? 5 : 1;
    onChange(String(Math.min(m.max, Math.max(m.min, (+value || 0) + d * inc))));
  };
  const atMin = k === 'perDay' ? PER_DAY_OPTIONS.indexOf(value) <= 0 : +value <= m.min;
  const atMax = k === 'perDay' ? PER_DAY_OPTIONS.indexOf(value) >= PER_DAY_OPTIONS.length - 1 : +value >= m.max;
  return (
    <div className="min-w-0">
      <div className="mb-1 flex min-h-5 items-center justify-between gap-1">
        <span className="truncate text-xs font-medium uppercase tracking-wide text-slate-500">{m.short ?? m.label}{m.unit ? ' (s)' : ''}</span>
        {onRemove && <button type="button" onClick={onRemove} aria-label={`Remove ${m.label.toLowerCase()}`} className="-my-3 -mr-2 inline-flex h-11 w-9 items-center justify-center text-slate-400 hover:text-red-600"><Icon d={I.close} className="h-4 w-4" sw={2} /></button>}
      </div>
      <div className="flex items-center rounded-xl border border-slate-200 bg-white">
        <button type="button" aria-label={`Less ${m.label.toLowerCase()}`} onClick={() => step(-1)} disabled={atMin} className={cx(iconBtn, 'rounded-r-none text-teal-800')}><Icon d={I.minus} sw={2.2} /></button>
        <span className="min-w-0 flex-1 truncate text-center text-sm font-semibold tabular-nums" aria-live="polite">{valueText(k, value)}</span>
        <button type="button" aria-label={`More ${m.label.toLowerCase()}`} onClick={() => step(1)} disabled={atMax} className={cx(iconBtn, 'rounded-l-none text-teal-800')}><Icon d={I.plus} sw={2.2} /></button>
      </div>
    </div>
  );
};

const ADD_START: Partial<Record<ParamKey, string>> = { up: '2', down: '3', rest: '60' };
const ParamEditor = ({ type, params, onChange }: { type: ExType; params: Params; onChange: (p: Params) => void }) => {
  const [menu, setMenu] = useState(false);
  const extra = addableFor(type, params);
  return (
    <div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-3">
        {keysOf(params).map((k) => (
          <ParamStepper key={k} k={k} value={params[k] as string} onChange={(v) => onChange({ ...params, [k]: v })} onRemove={CORE[type].includes(k) ? undefined : () => { const n = { ...params }; delete n[k]; onChange(n); }} />
        ))}
      </div>
      {extra.length > 0 && (
        <div className="mt-2">
          {!menu ? (
            <button type="button" onClick={() => setMenu(true)} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm font-semibold text-teal-800 hover:bg-teal-50"><Icon d={I.plus} className="h-4 w-4" sw={2.2} />Add parameter</button>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-2" role="group" aria-label="Add parameter">
              <div className="px-1 pb-1 text-xs font-medium text-slate-500">Add parameter</div>
              <div className="flex flex-wrap gap-2">
                {extra.map((k) => (
                  <button key={k} type="button" onClick={() => { onChange({ ...params, [k]: ADD_START[k] }); setMenu(false); }} className="min-h-11 rounded-full border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:border-teal-300 hover:bg-teal-50">{PARAM_META[k].label} ({PARAM_META[k].unit})</button>
                ))}
                <button type="button" onClick={() => setMenu(false)} className="min-h-11 rounded-full px-3 text-sm font-medium text-slate-500 hover:bg-slate-100">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const typesOf = (e: Exercise): ExType[] => (e.kind === 'stretch' ? ['stretching'] : STRENGTH_TYPES);
const moveItem = <T,>(xs: T[], from: number, to: number) => { const ys = [...xs]; const [m] = ys.splice(from, 1); ys.splice(to, 0, m); return ys; };

export type WebAppProps = {
  initialView?: View; initialQuery?: string; initialRequested?: boolean; initialShareState?: ShareState;
  initialSheet?: 'add' | 'share' | 'exercise' | 'choose' | 'delete' | 'publish' | 'useRoutine' | 'newProgram' | 'routineAdd' | 'routinePublish' | null; initialKind?: KindFilter; initialTab?: 'mine' | 'all'; initialAddTab?: 'mine' | 'all';
  initialExerciseId?: string; initialToast?: string; initialDrag?: { id: string; over: number } | null; initialSaved?: string[];
  initialExpiry?: Expiry; initialDefaultExpiry?: Expiry; initialRestore?: number | null;
  initialCustomDate?: string; initialRequester?: Who; initialSimilar?: boolean; initialDupReport?: boolean; initialDupStep?: 'pick' | 'keep' | 'confirm'; initialRegen?: boolean;
  initialRegenUsed?: number; initialProgramState?: 'published' | 'unsaved' | 'draft'; initialDeleted?: boolean;
  initialConflict?: boolean;
  initialFiltersOpen?: boolean; initialTypeOpen?: boolean; initialSort?: SortBy; initialApprovedFromRequest?: boolean; initialRegion?: string; autoSaveMs?: number;
  // v11 (DIDI-852)
  initialRoutineTab?: 'mine' | 'all'; initialRoutineQuery?: string; initialRoutineFiltersOpen?: boolean; initialCondition?: string; initialRoutineId?: string; initialRoutineSource?: 'community' | 'mine';
  initialProgQuery?: string; initialProgCode?: string; initialFromRoutine?: string; initialRoutineEdit?: 'new' | 'draft' | 'community' | 'mine';
  // v12: condition list is fixed and may be empty at launch. 'sample' shows clearly labelled sample values.
  initialConditionList?: 'empty' | 'sample'; initialProgramName?: string; initialRoutineRestore?: number; initialRoutineTried?: boolean;
};

export const WebAppClickableConcept = ({ initialView = 'library', initialQuery = '', initialRequested = false, initialShareState = 'active', initialSheet = null, initialKind = 'All', initialTab = 'mine', initialAddTab = 'mine', initialExerciseId = 'ex11', initialToast, initialDrag = null, initialSaved = [], initialExpiry, initialDefaultExpiry = '365', initialRestore = null, initialCustomDate = '2026-12-15', initialRequester, initialSimilar = false, initialDupReport = false, initialDupStep = 'pick', initialRegen = false, initialRegenUsed = 2, initialProgramState = 'published', initialDeleted = false, initialConflict = false, initialFiltersOpen = false, initialTypeOpen = false, initialSort = 'used', initialApprovedFromRequest = false, initialRegion, autoSaveMs = 900, initialRoutineTab = 'all', initialRoutineQuery = '', initialRoutineFiltersOpen = false, initialCondition = 'All', initialRoutineId = 'rt-knee-oa', initialRoutineSource = 'community', initialProgQuery = '', initialProgCode, initialFromRoutine, initialRoutineEdit, initialConditionList = 'empty', initialProgramName, initialRoutineRestore, initialRoutineTried = false }: WebAppProps) => {
  const [view, setViewRaw] = useState<View>(initialView);
  const [query, setQuery] = useState(initialQuery);
  const [region, setRegion] = useState(initialRegion ?? 'All');
  const [libTab, setLibTab] = useState<'mine' | 'all'>(initialTab);
  const [library, setLibrary] = useState<Exercise[]>(() => (initialApprovedFromRequest ? [...LIBRARY, cphExercise(COPENHAGEN_DRAFT, 'you')] : LIBRARY));
  // v10 (#18): an approved request goes straight into the requester's My exercises, tagged as new.
  const [fromRequest, setFromRequest] = useState<Record<string, boolean>>(initialApprovedFromRequest ? { 'ex-cph': true } : {});
  const [history, setHistory] = useState<Record<string, LibVersion[]>>(SEED_HISTORY);
  const [defaultExpiry, setDefaultExpiry] = useState<Expiry>(initialDefaultExpiry);
  const [expiry, setExpiry] = useState<Expiry>(initialExpiry ?? initialDefaultExpiry);
  const [customDate, setCustomDate] = useState(initialCustomDate);
  const [regenSeed, setRegenSeed] = useState(initialRegen);
  const [dupReports, setDupReports] = useState<Record<string, string>>(initialDupReport ? { ex14: 'ex8', ex8: 'ex14' } : {});
  const [similarFor, setSimilarFor] = useState<string | null>(initialSimilar ? initialQuery : null);
  const [programDeleted, setProgramDeleted] = useState(initialDeleted);
  // v8 (8B, 3): 5 regenerations per practitioner per day.
  const [regenUsed, setRegenUsed] = useState(Math.min(initialRegenUsed, REGEN_CAP));
  const regenLeft = REGEN_CAP - regenUsed;
  const useRegen = () => setRegenUsed((u) => Math.min(REGEN_CAP, u + 1));
  // v8 (2B, 2C): deleted programs can be restored for 30 days.
  const [trash, setTrash] = useState([{ t: 'Shoulder warm-up, draft', id: 'PRG-3J8N', n: 5, on: 'Oct 10, 2026', until: 'Nov 9, 2026' }]);
  const [restored, setRestored] = useState<{ t: string; id: string; n: number }[]>([]);
  // v8 (Q1): library updates never change programs on their own. The builder asks to update or keep the original.
  const [keptOriginal, setKeptOriginal] = useState<Record<string, number>>({});
  const [libSeed, setLibSeed] = useState<{ id: string; alias: string; note: string } | null>(null);
  const [delOpen, setDelOpen] = useState(initialSheet === 'delete');
  const cphBy: Who = initialRequester ?? (initialView === 'review' ? 'practitioner' : 'you');
  const [my, setMy] = useState<MyExercises>(() => ({ ...SEED_MY, ...(initialApprovedFromRequest ? { 'ex-cph': { pinned: false, savedAt: 'Oct 24', notes: '', text: {}, params: {} } } : {}), ...Object.fromEntries(initialSaved.map((id) => [id, { pinned: false, savedAt: TODAY, notes: '', text: {}, params: {} }])) }));
  const [requests, setRequests] = useState<Req[]>(() => {
    const base: Req[] = [
      { id: 'rq1', name: 'Bridge marching', note: 'Slow, keep pelvis level', status: 'drafting', when: 'Today, 2:10 PM', by: 'you' },
      { id: 'rq3', name: 'Side plank, knees bent', note: 'Beginner version', status: 'drafting', when: 'Today, 11:05 AM', by: 'practitioner' },
      { id: 'rq0', name: 'Standing heel raises', note: '', status: 'approved', when: 'Oct 18', by: 'practitioner', approvedBy: 'practitioner', approvedOn: 'Oct 19' },
    ];
    if (initialRequested || initialView === 'review' || initialView === 'requests') base.unshift({ id: 'rq2', name: COPENHAGEN_DRAFT.name, note: 'Short lever, knee on bench', status: initialRequested && initialView !== 'review' && initialView !== 'requests' ? 'drafting' : 'draft', when: cphBy === 'you' ? 'Just now' : 'Today, 9:40 AM', by: cphBy });
    return base;
  });
  const [reqNote, setReqNote] = useState('');
  const [justRequested, setJustRequested] = useState<string | null>(initialRequested ? COPENHAGEN_DRAFT.name : null);
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(initialToast ? { text: initialToast, undo: () => {} } : null);
  const [myDefaults, setMyDefaults] = useState<MyDefaults>(SEED_MINE);
  const resolve = (id: string | undefined, t: ExType) => resolveWith(my, myDefaults, id, t);
  const defaultFor: DefaultFor = (t) => typeFallback(myDefaults, t);
  const [kinds, setKinds] = useState<Record<Kind, boolean>>(initialKind === 'All' ? { stretch: true, strength: true } : { stretch: initialKind === 'stretch', strength: initialKind === 'strength' });
  // Rule: at least one type stays on. Removing the last one turns both back on.
  const typeChoice: TypeChoice = kinds.stretch && kinds.strength ? 'both' : kinds.strength ? 'strength' : 'stretch';
  const setTypeChoice = (t: TypeChoice) => setKinds({ stretch: t !== 'strength', strength: t !== 'stretch' });
  const [filtersOpen, setFiltersOpen] = useState(initialFiltersOpen || initialTypeOpen);
  const [typeOpen, setTypeOpen] = useState(initialTypeOpen);
  const [sortBy, setSortBy] = useState<SortBy>(initialSort);
  const toggleKind = (k: Kind) => setKinds((x) => { const n = { ...x, [k]: !x[k] }; if (!n.stretch && !n.strength) { setToast({ text: 'Showing both types. At least one type stays on.' }); return { stretch: true, strength: true }; } return n; });
  // v9 (#12): conflict check on save. Only requests submitted while this form was open count.
  const [formStart, setFormStart] = useState(() => Date.now());
  const [demoConflict, setDemoConflict] = useState(initialConflict);
  const [conflict, setConflict] = useState<{ name: string; note: string; ids: string[] } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [choose, setChoose] = useState<Exercise | null>(initialSheet === 'choose' ? LIBRARY[10] : null);
  const [chooseType, setChooseType] = useState<StrengthType>('concentric');
  const [peekType, setPeekType] = useState<StrengthType>('eccentric');
  const [openRows, setOpenRows] = useState<Record<string, boolean>>({});
  const [rows, setRows] = useState<Row[]>(() => {
    const L = (id: string) => LIBRARY.find((e) => e.id === id)!;
    const heel = snapRow(L('ex1'), 'concentric', SEED_MY, SEED_MINE, { id: 'r-heel', notes: 'Slow and controlled' });
    return [
      { ...heel, params: { ...heel.params, reps: '15' }, edited: true },
      snapRow(L('ex11'), 'eccentric', SEED_MY, SEED_MINE, { id: 'r-squat', notes: 'Chair behind you for safety', libV: 2 }),
      snapRow(L('ex11'), 'isometric', SEED_MY, SEED_MINE, { id: 'r-squat2', notes: 'Second version, hold at the bottom', libV: 2 }),
      snapRow(L('ex3'), 'isometric', SEED_MY, SEED_MINE, { id: 'r-tke', notes: 'Light band' }),
      snapRow(L('ex12'), 'stretching', SEED_MY, SEED_MINE, { id: 'r-ham' }),
      snapRow({ name: 'Bridge marching' }, 'concentric', SEED_MY, SEED_MINE, { id: 'r-bm', pending: true }),
    ];
  });
  const [drag, setDrag] = useState<{ id: string; over: number } | null>(initialDrag);
  const pressTimer = useRef<number | undefined>(undefined);
  const listRef = useRef<HTMLOListElement>(null);
  const [title, setTitle] = useState('Knee rehab, week 1');
  // v8 (DIDI-829 1A): save and publish are separate. Edits save as a draft. Only Publish changes the live link.
  const sigOf = (t: string, rs: Row[]) => JSON.stringify({ t, rs: rs.map(({ id, exerciseId, name, type, params, cue, notes, libV }) => ({ id, exerciseId, name, type, params, cue, notes, libV })) });
  const olderRows = (rs: Row[]) => rs.map((r) => (r.id === 'r-heel' ? { ...r, params: { ...r.params, reps: '10' }, edited: false } : r));
  const [pub, setPub] = useState(() => ({ rows: initialProgramState === 'published' ? rows : olderRows(rows), title: 'Knee rehab, week 1', at: 'Oct 24, 2:10 PM' }));
  const [saved, setSaved] = useState(() => ({ rows: initialProgramState === 'unsaved' ? olderRows(rows) : rows, title: 'Knee rehab, week 1', at: initialProgramState === 'draft' ? 'Today, 6:40 PM' : 'Oct 24, 2:10 PM' }));
  const dirty = sigOf(title, rows) !== sigOf(saved.title, saved.rows);
  const unpublished = sigOf(saved.title, saved.rows) !== sigOf(pub.title, pub.rows);
  const [pubOpen, setPubOpen] = useState(initialSheet === 'publish');
  // v10 (#17, locked on DIDI-594): edits save automatically. There is no Save draft button. Publish is the only step that changes the live link.
  useEffect(() => { if (!dirty) return; const t = setTimeout(() => setSaved({ rows, title, at: 'just now' }), autoSaveMs); return () => clearTimeout(t); }, [title, rows, dirty, autoSaveMs]);
  const pending = dirty || unpublished;
  // v10 (#15): publishing is sharing. The publish dialog carries the link, Copy and the expiry.
  const publishProgram = () => { const wasClosed = shareState === 'closed' || pub.at === ''; setSaved({ rows, title, at: 'just now' }); setPub({ rows, title, at: 'Today, 7:05 PM' }); if (wasClosed) setShareState('active'); setPubOpen(false); setToast({ text: wasClosed ? 'Published. Your new link is ready to send.' : 'Published. Your patient sees it on the same link now.' }); };
  const pubChanges = (() => {
    const ids = new Set(pub.rows.map((r) => r.id)); const now = new Set(rows.map((r) => r.id));
    const out: string[] = [];
    if (title !== pub.title) out.push('Title changed');
    rows.filter((r) => !ids.has(r.id)).forEach((r) => out.push(`Added ${r.name}`));
    pub.rows.filter((r) => !now.has(r.id)).forEach((r) => out.push(`Removed ${r.name}`));
    rows.forEach((r) => { const o = pub.rows.find((x) => x.id === r.id); if (!o) return; if (o.libV !== r.libV) out.push(`${r.name} updated to library version ${r.libV}`); else if (sigOf('', [o]) !== sigOf('', [r])) out.push(`${r.name}: ${formatParams(r.params)}`); });
    const order = rows.filter((r) => ids.has(r.id)).map((r) => r.id).join(); const was = pub.rows.filter((r) => now.has(r.id)).map((r) => r.id).join();
    if (order !== was) out.push('Exercises reordered');
    return out;
  })();
  const [shareState, setShareState] = useState<ShareState>(initialShareState);
  const [addOpen, setAddOpen] = useState(initialSheet === 'add');
  const [addTab, setAddTab] = useState<'mine' | 'all'>(initialAddTab);
  const [shareOpen, setShareOpen] = useState(initialSheet === 'share');
  const [peek, setPeek] = useState<Exercise | null>(initialSheet === 'exercise' ? LIBRARY.find((e) => e.id === initialExerciseId) ?? null : null);
  const [focusId, setFocusId] = useState<string>(initialExerciseId);
  const [addQuery, setAddQuery] = useState('');

  const setView = (v: View) => { setViewRaw(v); setAddOpen(false); setShareOpen(false); setPeek(null); setChoose(null); setMenuOpen(false); if (typeof window !== 'undefined') window.scrollTo({ top: 0 }); };

  // ---------- v11: Routines (DIDI-852, locked on DIDI-594) and sent-program lookup ----------
  const LX = (id: string) => LIBRARY.find((e) => e.id === id)!;
  const [routines, setRoutines] = useState<Routine[]>([DRAFT_ROUTINE, ...ROUTINES]);
  const conditions = initialConditionList === 'sample' ? SAMPLE_CONDITIONS : [];
  const hasConds = conditions.length > 0;
  const [rHistory, setRHistory] = useState<Record<string, RVersion[]>>(ROUTINE_HISTORY);
  const [myRoutines, setMyRoutines] = useState<Record<string, MyRoutine>>(SEED_MY_ROUTINES);
  const [rTab, setRTab] = useState<'mine' | 'all'>(initialRoutineTab);
  const [rQuery, setRQuery] = useState(initialRoutineQuery);
  const [rCond, setRCond] = useState(initialCondition);
  const [rRegion, setRRegion] = useState('All');
  const [rSort, setRSort] = useState<SortBy>('used');
  const [rFiltersOpen, setRFiltersOpen] = useState(initialRoutineFiltersOpen);
  const [routineId, setRoutineId] = useState(initialRoutineId);
  const [rSource, setRSource] = useState<'community' | 'mine'>(initialRoutineSource);
  const [rPubOpen, setRPubOpen] = useState(initialSheet === 'routinePublish');
  const [rRestore, setRRestore] = useState<RVersion | null>(null);
  const [rSave, setRSave] = useState<'saving' | 'saved'>('saved');
  const [newProgOpen, setNewProgOpen] = useState(initialSheet === 'newProgram');
  const [pickForProgram, setPickForProgram] = useState(false);
  const [progs, setProgs] = useState<Prog[]>(SEED_PROGS);
  const [progQuery, setProgQuery] = useState(initialProgQuery);
  const [progFilter, setProgFilter] = useState<'all' | 'routine' | 'scratch'>('all');
  const [progCode, setProgCode] = useState('PRG-7K3Q');
  const [origin, setOrigin] = useState<ProgFrom | null>(null);
  const [store, setStore] = useState<Record<string, ProgState>>({});
  const codeSeq = useRef(0);
  const NEW_CODES = ['PRG-6T2P', 'PRG-9W4L', 'PRG-3B7Z', 'PRG-1N5X', 'PRG-7D4C'];
  const nextCode = () => NEW_CODES[codeSeq.current++ % NEW_CODES.length];
  const routine = routines.find((r) => r.id === routineId) ?? routines[1];
  // v12: a saved routine is a frozen copy. 'mine' reads the copy, 'community' reads the live version.
  const rowsOf = (r: Routine, src: 'community' | 'mine') => (src === 'mine' && myRoutines[r.id] && !r.draft ? myRoutines[r.id].rows : r.rows);
  const verOf = (r: Routine, src: 'community' | 'mine') => (src === 'mine' && myRoutines[r.id] && !r.draft ? myRoutines[r.id].v : r.version);
  const toRows = (rr: RRow[]) => rr.map((x, i) => snapRow(LX(x.ex), x.type, my, myDefaults, { id: `rr${i}${Math.random().toString(36).slice(2, 6)}`, params: { ...x.params }, source: 'routine', notes: x.note ?? '' }));
  const seedState = (p: Prog): ProgState => {
    const r = p.from ? routines.find((x) => x.id === p.from!.id) : undefined;
    const base = r ? (p.from!.id === 'rt-knee-oa' && p.from!.v === 2 ? r.rows.filter((x) => x.ex !== 'ex13').map((x) => (x.ex === 'ex4' ? { ...x, params: { ...x.params, hold: '15' } } : x)) : r.rows) : [{ ex: 'ex13', type: 'stretching' as ExType, params: { hold: '30', perDay: '1 to 2', daysPerWeek: '7' } }, { ex: 'ex8', type: 'concentric' as ExType, params: { reps: '12', hold: '2', sets: '2', daysPerWeek: '3' } }, { ex: 'ex14', type: 'eccentric' as ExType, params: { reps: '10', down: '4', sets: '2', daysPerWeek: '3' } }, { ex: 'ex1', type: 'concentric' as ExType, params: { reps: '10', hold: '2', sets: '2', daysPerWeek: '3' } }];
    const rs = toRows(p.code === 'PRG-2M8D' ? base.map((x) => (x.ex === 'ex5' ? { ...x, params: { ...x.params, reps: '15' }, note: 'Changed after sending' } : x)) : base);
    const at = `${p.sent ?? 'Oct 20'}, 10:00 AM`;
    return { title: p.t, rows: rs, pub: { rows: rs, title: p.t, at }, saved: { rows: rs, title: p.t, at }, origin: p.from ?? null, shareState: p.s.startsWith('Link closed') ? 'closed' : 'active' };
  };
  const loadProg = (code: string, st: ProgState) => { setStore((m) => ({ ...m, [progCode]: { title, rows, pub, saved, origin, shareState } })); setTitle(st.title); setRows(st.rows); setPub(st.pub); setSaved(st.saved); setOrigin(st.origin); setShareState(st.shareState); setProgCode(code); setOpenRows({}); };
  const openProgram = (p: Prog) => { if (p.code !== progCode) loadProg(p.code, store[p.code] ?? seedState(p)); setView('builder'); };
  const createFromRoutine = (r: Routine, src: 'community' | 'mine') => {
    const code = nextCode(); const rs = toRows(rowsOf(r, src));
    const from: ProgFrom = { id: r.id, name: r.name, v: verOf(r, src), direct: false };
    loadProg(code, { title: r.name, rows: rs, pub: { rows: [], title: '', at: '' }, saved: { rows: rs, title: r.name, at: 'just now' }, origin: from, shareState: 'active' });
    setExpiry(defaultExpiry);
    setProgs((ps) => [{ code, t: r.name, n: rs.length, s: 'No link yet', from, open: true }, ...ps]);
    if (myRoutines[r.id]) setMyRoutines((m) => ({ ...m, [r.id]: { ...m[r.id], usedAt: TODAY } }));
    setPickForProgram(false); setView('builder');
    setToast({ text: `Program created from ${r.name}. Tweak it, then publish.` });
  };
  // v12 (locked Oct 25, 2026, 5:33 and 5:35 PM ET): Use for a patient makes the patient's copy as a draft
  // program, prefilled with the routine's name, and lands on the existing "Publish to the live link?" sheet.
  // Publish now creates the link. Not yet keeps it as a draft in Programs.
  const openUse = (r: Routine, src: 'community' | 'mine', nameIn?: string) => {
    const code = nextCode(); const rs = toRows(rowsOf(r, src)); const name = nameIn ?? r.name;
    const from: ProgFrom = { id: r.id, name: r.name, v: verOf(r, src), direct: true };
    loadProg(code, { title: name, rows: rs, pub: { rows: [], title: '', at: '' }, saved: { rows: rs, title: name, at: 'just now' }, origin: from, shareState: 'active' });
    setExpiry(defaultExpiry);
    setProgs((ps) => [{ code, t: name || 'Untitled program', n: rs.length, s: 'No link yet', from, open: true }, ...ps]);
    if (myRoutines[r.id]) setMyRoutines((m) => ({ ...m, [r.id]: { ...m[r.id], usedAt: TODAY } }));
    setPickForProgram(false); setView('builder'); setPubOpen(true);
  };
  const openRoutine = (r: Routine) => { setRoutineId(r.id); setRSource(myRoutines[r.id] && !r.draft ? 'mine' : 'community'); setView('routine'); };
  // Mirrors My exercises: save with Undo, remove with Undo, flag community updates, adopt or keep mine.
  const saveRoutine = (r: Routine) => {
    setMyRoutines((m) => ({ ...m, [r.id]: { savedAt: TODAY, v: r.version, seenV: r.version, rows: r.rows } }));
    setToast({ text: `Saved ${r.name} to My routines`, undo: () => setMyRoutines((m) => { const n = { ...m }; delete n[r.id]; return n; }) });
  };
  const removeRoutine = (r: Routine) => {
    const prev = myRoutines[r.id]; if (!prev) return;
    setMyRoutines((m) => { const n = { ...m }; delete n[r.id]; return n; });
    if (r.draft) { setRoutines((rs) => rs.filter((x) => x.id !== r.id)); setView('routines'); }
    else setRSource('community');
    setToast({ text: r.draft ? `Discarded the draft ${r.name || 'Untitled routine'}` : `Removed ${r.name} from My routines`, undo: () => { setMyRoutines((m) => ({ ...m, [r.id]: prev })); if (r.draft) setRoutines((rs) => (rs.some((x) => x.id === r.id) ? rs : [r, ...rs])); } });
  };
  const adoptRoutine = (r: Routine) => {
    const prev = myRoutines[r.id]; if (!prev) return;
    setMyRoutines((m) => ({ ...m, [r.id]: { ...prev, v: r.version, seenV: r.version, rows: r.rows, changes: undefined } }));
    setRSource('mine');
    setToast({ text: `Your copy is now version ${r.version}`, undo: () => setMyRoutines((m) => ({ ...m, [r.id]: prev })) });
  };
  const keepMine = (r: Routine) => {
    const prev = myRoutines[r.id]; if (!prev) return;
    setMyRoutines((m) => ({ ...m, [r.id]: { ...prev, seenV: r.version } }));
    setToast({ text: `Kept your copy on version ${prev.v}. You can still update it from this page.`, undo: () => setMyRoutines((m) => ({ ...m, [r.id]: prev })) });
  };
  // Mirrors exercise HistoryView: restoring saves the old version as a new version, so nothing is lost.
  const restoreRoutine = (r: Routine, old: RVersion) => {
    const v = r.version + 1; const rs = rowsOfVersion(r, rHistory, old.v);
    setRHistory((h) => ({ ...h, [r.id]: [{ v, by: 'you', date: 'Oct 25, 2026', summary: `Restored version ${old.v}`, changes: [`Exercises and doses from version ${old.v}`], rows: rs, from: old.v }, ...historyForRoutine(r, h).map((x) => (x.v === r.version && !x.rows ? { ...x, rows: r.rows } : x))] }));
    setRoutines((xs) => xs.map((x) => (x.id === r.id ? { ...x, rows: rs, version: v, updated: 'Oct 25, 2026' } : x)));
    setToast({ text: `Version ${old.v} restored as version ${v}. Programs already sent did not change.` });
  };
  const [rEdit, setREdit] = useState<REdit | null>(() => {
    if (!initialRoutineEdit || initialRoutineEdit === 'new' || initialRoutineEdit === 'draft') return null;
    const r = ROUTINES.find((x) => x.id === initialRoutineId)!;
    return { mode: initialRoutineEdit, id: r.id, name: r.name, condition: r.condition, region: r.region, about: r.about, rows: initialRoutineEdit === 'mine' ? (SEED_MY_ROUTINES[r.id]?.rows ?? r.rows) : r.rows, note: '', tried: initialRoutineTried };
  });
  const [rAddOpen, setRAddOpen] = useState(initialSheet === 'routineAdd');
  // v12 (locked Oct 25, 2026, 5:32 PM ET): no review step for routines. A new routine is a draft that saves
  // automatically and only you can see, until you publish it as version 1. Edit for everyone saves as a new version, like exercises.
  const startEdit = (mode: REdit['mode'], r?: Routine) => {
    if (mode === 'new' && !r) {
      const id = `rt-new-${Date.now().toString(36)}`;
      const nr: Routine = { id, name: '', condition: hasConds ? conditions[0] : '', region: 'Knee', version: 0, addedBy: 'you', updated: 'Oct 25, 2026', uses: 0, about: '', rows: [], draft: true };
      setRoutines((rs) => [nr, ...rs]); setMyRoutines((m) => ({ ...m, [id]: { savedAt: TODAY, v: 0, seenV: 0, rows: [] } }));
      setRoutineId(id); setREdit({ mode: 'new', id, name: '', condition: nr.condition, region: 'Knee', about: '', rows: [], note: '' });
    } else if (r) setREdit({ mode, id: r.id, name: r.name, condition: r.condition, region: r.region, about: r.about, rows: mode === 'mine' ? rowsOf(r, 'mine') : r.rows, note: '' });
    setView('routineedit');
  };
  // Draft auto-save, like the program builder (v10 #17): there is no Save draft button.
  useEffect(() => {
    if (!rEdit || rEdit.mode !== 'new' || !rEdit.id) return;
    setRSave('saving');
    const t = setTimeout(() => { setRoutines((rs) => rs.map((x) => (x.id === rEdit.id ? { ...x, name: rEdit.name.trim(), condition: rEdit.condition, region: rEdit.region, about: rEdit.about.trim(), rows: rEdit.rows, updated: 'Oct 25, 2026' } : x))); setRSave('saved'); }, autoSaveMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rEdit]);
  const draftOk = (r: { name: string; rows: RRow[] }) => !!r.name.trim() && r.rows.length > 0;
  const askPublish = () => {
    if (rEdit && rEdit.mode === 'new') {
      if (!draftOk(rEdit)) { setREdit({ ...rEdit, tried: true }); return; }
      setRoutines((rs) => rs.map((x) => (x.id === rEdit.id ? { ...x, name: rEdit.name.trim(), condition: rEdit.condition, region: rEdit.region, about: rEdit.about.trim(), rows: rEdit.rows } : x))); setRSave('saved');
    }
    setRPubOpen(true);
  };
  const publishDraft = () => {
    const r = routines.find((x) => x.id === routineId); if (!r) return;
    const nr = rEdit && rEdit.mode === 'new' && rEdit.id === r.id ? { ...r, name: rEdit.name.trim(), condition: rEdit.condition, region: rEdit.region, about: rEdit.about.trim(), rows: rEdit.rows } : r;
    setRoutines((rs) => rs.map((x) => (x.id === r.id ? { ...nr, draft: false, version: 1, updated: 'Oct 25, 2026' } : x)));
    setMyRoutines((m) => ({ ...m, [r.id]: { savedAt: TODAY, v: 1, seenV: 1, rows: nr.rows } }));
    setRHistory((h) => ({ ...h, [r.id]: [{ v: 1, by: 'you', date: 'Oct 25, 2026', summary: 'First version', changes: [`Published with ${nr.rows.length} exercises`], rows: nr.rows }] }));
    setRPubOpen(false); setREdit(null); setRSource('mine'); setView('routine');
    setToast({ text: `Published. Version 1 of ${nr.name} is live for every practitioner.` });
  };
  const commitEdit = () => {
    if (!rEdit) return;
    if (rEdit.mode === 'new') { setREdit(null); setView('routine'); setToast({ text: 'Draft saved. Only you can see it until you publish.' }); return; }
    if (!draftOk(rEdit)) { setREdit({ ...rEdit, tried: true }); return; }
    const r = routines.find((x) => x.id === rEdit.id)!;
    if (rEdit.mode === 'community') {
      const v = r.version + 1; const note = rEdit.note.trim() || 'Edited the exercises';
      setRHistory((h) => ({ ...h, [r.id]: [{ v, by: 'you', date: 'Oct 25, 2026', summary: note, changes: [note], rows: rEdit.rows }, ...historyForRoutine(r, h).map((x) => (x.v === r.version && !x.rows ? { ...x, rows: r.rows } : x))] }));
      setRoutines((rs) => rs.map((x) => (x.id === r.id ? { ...x, name: rEdit.name.trim(), condition: rEdit.condition, region: rEdit.region, about: rEdit.about.trim(), rows: rEdit.rows, version: v, updated: 'Oct 25, 2026' } : x)));
      setRSource('community'); setREdit(null); setView('routine');
      setToast({ text: `Saved as version ${v} for everyone. Programs already sent did not change.` });
    } else {
      const m0 = myRoutines[r.id] ?? { savedAt: TODAY, v: r.version, seenV: r.version, rows: r.rows };
      const base = rowsOfVersion(r, rHistory, m0.v);
      const n = rEdit.rows.filter((x, i) => JSON.stringify(x) !== JSON.stringify(base[i])).length + Math.max(0, base.length - rEdit.rows.length);
      setMyRoutines((m) => ({ ...m, [r.id]: { ...m0, rows: rEdit.rows, changes: n ? Array.from({ length: n }, (_, i) => `Change ${i + 1}`) : undefined } }));
      setRSource('mine'); setREdit(null); setView('routine');
      setToast({ text: 'Saved to your copy. Only you see it. The community routine did not change.' });
    }
  };
  useEffect(() => {
    if (initialProgCode) { const p = SEED_PROGS.find((x) => x.code === initialProgCode); if (p) loadProg(p.code, seedState(p)); }
    if (initialFromRoutine) { const r = ROUTINES.find((x) => x.id === initialFromRoutine); if (r) { const code = 'PRG-6T2P'; codeSeq.current = 1; const rs = toRows(r.rows); const from = { id: r.id, name: r.name, v: r.version, direct: false }; loadProg(code, { title: r.name, rows: rs, pub: { rows: [], title: '', at: '' }, saved: { rows: rs, title: r.name, at: 'just now' }, origin: from, shareState: 'active' }); setProgs((ps) => [{ code, t: r.name, n: rs.length, s: 'No link yet', from, open: true }, ...ps]); } }
    if (initialSheet === 'useRoutine') { const r = ROUTINES.find((x) => x.id === initialRoutineId)!; openUse(r, initialRoutineSource, initialProgramName); }
    if (initialRoutineEdit === 'new') startEdit('new');
    if (initialRoutineEdit === 'draft') { setRoutineId(DRAFT_ROUTINE.id); setREdit({ mode: 'new', id: DRAFT_ROUTINE.id, name: DRAFT_ROUTINE.name, condition: DRAFT_ROUTINE.condition, region: DRAFT_ROUTINE.region, about: DRAFT_ROUTINE.about, rows: DRAFT_ROUTINE.rows, note: '', tried: initialRoutineTried }); }
    if (initialRoutineRestore) { const r = ROUTINES.find((x) => x.id === initialRoutineId)!; setRRestore(historyForRoutine(r, ROUTINE_HISTORY).find((x) => x.v === initialRoutineRestore) ?? null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const focusEx = library.find((e) => e.id === focusId) ?? library[0];

  useEffect(() => { if (!toast || initialToast) return; const t = setTimeout(() => setToast(null), toast.undo ? 5000 : 2600); return () => clearTimeout(t); }, [toast, initialToast]);
  useEffect(() => {
    const drafting = requests.find((r) => r.status === 'drafting' && r.name === COPENHAGEN_DRAFT.name);
    if (!drafting) return;
    const t = setTimeout(() => {
      setRequests((rs) => rs.map((r) => (r.id === drafting.id ? { ...r, status: 'draft' } : r)));
      setToast({ text: 'AI draft ready to review: Copenhagen plank, short lever' });
    }, 4000);
    return () => clearTimeout(t);
  }, [requests]);

  const draftCount = requests.filter((r) => r.status === 'draft').length;
  const matches = (e: Exercise, q: string, withFilters = true) => {
    const okFilter = !withFilters || ((region === 'All' || e.region.toLowerCase().includes(region.toLowerCase())) && kinds[e.kind]);
    if (!okFilter) return false;
    if (!q) return true;
    const hay = [e.name, myText(e, my[e.id], 'title'), ...e.aliases, e.region].join(' ').toLowerCase();
    return q.split(/\s+/).every((w) => hay.includes(w.replace(/,/g, '')));
  };
  const q = query.trim().toLowerCase();
  const sortList = (xs: Exercise[]) => (sortBy === 'az' ? [...xs].sort((a, b) => a.name.localeCompare(b.name)) : sortBy === 'newest' ? [...xs].sort((a, b) => Date.parse(b.updated) - Date.parse(a.updated)) : [...xs].sort((a, b) => (USES[b.id] ?? 0) - (USES[a.id] ?? 0)));
  const allResults = useMemo(() => sortList(library.filter((e) => matches(e, q))), [q, region, kinds, library, my, sortBy]);
  const mineIds = sortMine(Object.keys(my).filter((id) => library.some((e) => e.id === id)), my);
  const mineResults = mineIds.map((id) => library.find((e) => e.id === id)!).filter((e) => matches(e, q));
  const matchedAlias = (e: Exercise) => {
    if (!q || e.name.toLowerCase().includes(q)) return null;
    return e.aliases.find((a) => a.toLowerCase().includes(q)) ?? null;
  };
  // 3C: before a request goes in, show similar library exercises and requests already in progress.
  const STOP = new Set(['with', 'short', 'long', 'lever', 'version', 'knees', 'bent', 'side']);
  const wordsOf = (t: string) => t.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4 && !STOP.has(w));
  const similarTo = (name: string) => {
    const ws = wordsOf(name);
    const hit = (t: string) => wordsOf(t).some((w) => ws.some((q) => w.startsWith(q.slice(0, 5)) || q.startsWith(w.slice(0, 5))));
    return {
      lib: library.filter((e) => [e.name, ...e.aliases].some(hit)),
      reqs: requests.filter((r) => r.status !== 'approved' && (hit(r.name) || wordsOf(r.name).some((w) => name.toLowerCase().includes(w)))),
    };
  };
  const requestIt = (force = false) => {
    const name = query.trim() || 'New exercise';
    if (!force) {
      let pool = requests;
      if (demoConflict && !requests.some((r) => r.id === 'rq-rival')) {
        const rival: Req = { id: 'rq-rival', name: /squat/i.test(name) ? 'Wide stance squat' : `${name}, variation`, note: /squat/i.test(name) ? 'Sumo stance, toes out' : '', status: 'drafting', when: 'Just now', by: 'practitioner', t: Date.now() };
        pool = [rival, ...requests];
        setRequests(pool);
      }
      const ws = wordsOf(name);
      const newer = pool.filter((r) => r.t !== undefined && r.t >= formStart && r.by !== 'you' && r.status !== 'approved' && (wordsOf(r.name).some((w) => ws.some((x) => w.startsWith(x.slice(0, 5)) || x.startsWith(w.slice(0, 5))))));
      if (newer.length) { setConflict({ name, note: reqNote.trim(), ids: newer.map((r) => r.id) }); setView('conflict'); return; }
    }
    setConflict(null);
    setRequests((rs) => [{ id: `rq${Date.now()}`, name, note: reqNote, status: 'drafting', when: 'Just now', by: 'you' }, ...rs.filter((r) => r.name.toLowerCase() !== name.toLowerCase())]);
    setJustRequested(name);
    setSimilarFor(null);
    setReqNote('');
  };
  // v8 (Q1): which exercises in this program have a newer library version the practitioner hasn't answered yet.
  const libUpdates = (() => {
    const seen: Record<string, { ex: Exercise; from: number; n: number }> = {};
    rows.forEach((r) => {
      const ex = library.find((e) => e.id === r.exerciseId);
      if (!ex || r.libV === undefined || ex.version <= r.libV || keptOriginal[ex.id] === ex.version) return;
      seen[ex.id] = seen[ex.id] ? { ...seen[ex.id], n: seen[ex.id].n + 1 } : { ex, from: r.libV, n: 1 };
    });
    return Object.values(seen);
  })();
  const updateFromLibrary = (ex: Exercise) => {
    setRows((rs) => rs.map((r) => (r.exerciseId === ex.id ? { ...r, libV: ex.version, name: myText(ex, my[ex.id], 'title'), cue: r.type === 'stretching' ? r.cue : myText(ex, my[ex.id], cueKey(r.type)) } : r)));
    setToast({ text: `Updated ${ex.name} to version ${ex.version} in your draft. Sets, reps and notes are kept. Publish to show it on the link.` });
  };
  const keepOriginal = (ex: Exercise, from: number) => {
    setKeptOriginal((k) => ({ ...k, [ex.id]: ex.version }));
    setToast({ text: `Kept your original ${ex.name} (version ${from}). We'll ask again if it changes.` });
  };
  // v8 (Q4): on submit, merge my changes into a draft in progress.
  const mergeIntoRequest = (rid: string, name: string) => {
    const extra = [query.trim() && query.trim().toLowerCase() !== name.toLowerCase() ? `Also called "${query.trim()}"` : '', reqNote.trim()].filter(Boolean).join('. ');
    setRequests((rs) => rs.map((r) => (r.id === rid ? { ...r, note: [r.note, extra].filter(Boolean).join('. ') } : r)));
    setSimilarFor(null); setReqNote(''); setView('requests');
    setToast({ text: `Your changes were added to the ${name} draft. No new request.` });
  };
  const isSaved = (e: Exercise) => !!my[e.id];
  const save = (e: Exercise) => {
    setMy((m) => ({ ...m, [e.id]: { pinned: false, savedAt: TODAY, notes: '', text: {}, params: {} } }));
    setToast({ text: 'Saved to My exercises', undo: () => setMy((m) => { const n = { ...m }; delete n[e.id]; return n; }) });
  };
  const unsave = (e: Exercise) => {
    const prev = my[e.id];
    setMy((m) => { const n = { ...m }; delete n[e.id]; return n; });
    setToast({ text: `Removed ${e.name} from My exercises`, undo: () => setMy((m) => ({ ...m, [e.id]: prev })) });
  };
  const patchMy = (id: string, f: (m: MyExercise) => MyExercise) => setMy((m) => (m[id] ? { ...m, [id]: f(m[id]) } : m));
  const togglePin = (e: Exercise) => patchMy(e.id, (m) => ({ ...m, pinned: !m.pinned }));
  const countIn = (e: Exercise) => rows.filter((r) => r.exerciseId === e.id).length;
  // Adding to a program only happens inside the builder. The same exercise can appear more than once.
  const addToProgram = (e: Exercise, t?: ExType) => {
    if (e.kind === 'strength' && !t) { setChooseType('concentric'); setChoose(e); return; }
    const type: ExType = e.kind === 'stretch' ? 'stretching' : (t as ExType);
    const wasSaved = !!my[e.id];
    setRows((rs) => [...rs.filter((r) => !r.pending), snapRow(e, type, my, myDefaults), ...rs.filter((r) => r.pending)]);
    setMy((m) => ({ ...m, [e.id]: m[e.id] ? { ...m[e.id], lastUsed: TODAY } : { pinned: false, savedAt: TODAY, lastUsed: TODAY, notes: '', text: {}, params: {} } }));
    setChoose(null);
    setToast({ text: `Added ${e.name}${type === 'stretching' ? '' : `, ${type}`}${wasSaved ? '' : '. Also saved to My exercises.'}` });
  };
  const setRowType = (id: string, t: ExType) => setRows((rs) => rs.map((x) => (x.id === id ? { ...x, type: t, ...resolve(x.exerciseId, t), edited: false } : x)));
  const setRowParams = (id: string, p: Params) => setRows((rs) => rs.map((x) => (x.id === id ? { ...x, params: p, edited: !sameParams(p, resolve(x.exerciseId, x.type).params) } : x)));
  const resetRow = (id: string) => setRows((rs) => rs.map((x) => (x.id === id ? { ...x, ...resolve(x.exerciseId, x.type), edited: false } : x)));
  const duplicateRow = (r: Row) => {
    const copy: Row = { ...r, id: `r${Math.random().toString(36).slice(2, 8)}`, params: { ...r.params } };
    setRows((rs) => { const i = rs.findIndex((x) => x.id === r.id); const n = [...rs]; n.splice(i + 1, 0, copy); return n; });
    setOpenRows((o) => ({ ...o, [copy.id]: false }));
    setToast({ text: `Duplicated ${r.name}. Switch the version on the copy if you need both.`, undo: () => setRows((rs) => rs.filter((x) => x.id !== copy.id)) });
  };
  const poseFor = (r: Row) => (r.pending ? 'pending' : library.find((e) => e.id === r.exerciseId)?.pose ?? 'pending');
  const updateRow = (id: string, patch: Partial<Row>) => setRows((rs) => rs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const openDetails = (e: Exercise) => { setFocusId(e.id); setView('details'); };
  const openMyCopy = (e: Exercise) => { setFocusId(e.id); setView('mycopy'); };
  const openLibEdit = (e: Exercise) => { setFocusId(e.id); setView('libedit'); };
  const openHistory = (e: Exercise) => { setFocusId(e.id); setView('history'); };
  // Open editing (wiki style): saving publishes the next version for every practitioner and logs it in history.
  const publishVersion = (e: Exercise, next: Partial<Exercise>, summary: string, changes: string[]) => {
    const v = e.version + 1;
    const updated: Exercise = { ...e, ...next, version: v, updated: 'Oct 24, 2026' };
    setLibrary((l) => l.map((x) => (x.id === e.id ? updated : x)));
    setHistory((h) => ({ ...h, [e.id]: [{ v, by: 'you', date: 'Oct 24, 2026', summary, changes, snap: snapOf(updated) }, ...historyFor(e, h)] }));
    return v;
  };
  // 4A: regenerated media goes live right away as a new version, restorable from history.
  const publishMedia = (e: Exercise, what: string, note: string) => {
    const v = e.version + 1;
    setLibrary((l) => l.map((x) => (x.id === e.id ? { ...x, version: v, updated: 'Oct 24, 2026' } : x)));
    setHistory((h) => ({ ...h, [e.id]: [{ v, by: 'you', date: 'Oct 24, 2026', summary: `Regenerated ${what}`, changes: [`${what.replace(/^./, (c) => c.toUpperCase())} regenerated${note ? ` with the note "${note}"` : ''}`, 'Text unchanged'], snap: snapOf(e), media: true }, ...historyFor(e, h)] }));
    setToast({ text: `New ${what} live as version ${v} for every practitioner. Version ${v - 1} can be restored from history.` });
  };
  // 3C merge: keep one entry, fold the other's names and history into it.
  const mergeInto = (keepId: string, dropId: string) => {
    const keep = library.find((x) => x.id === keepId)!; const drop = library.find((x) => x.id === dropId)!;
    const v = keep.version + 1;
    const aliases = [...keep.aliases, drop.name, ...drop.aliases].filter((a, i, xs) => a !== keep.name && xs.indexOf(a) === i);
    setLibrary((l) => l.filter((x) => x.id !== dropId).map((x) => (x.id === keepId ? { ...x, aliases, version: v, updated: 'Oct 24, 2026' } : x)));
    setHistory((h) => ({ ...h, [keepId]: [
      { v, by: 'you', date: 'Oct 24, 2026', summary: `Merged with ${drop.name}`, changes: [`"${drop.name}" and its aliases added as aliases`, `${drop.name} removed from search, so there is one entry`, `Its ${drop.version === 1 ? 'version is' : `${drop.version} versions are`} kept below`, 'Programs that used it keep working', 'Permanent. A merge can\'t be undone'], merge: true },
      ...historyFor(keep, h), ...historyFor(drop, h).map((x) => ({ ...x, from: drop.name })),
    ] }));
    setMy((m) => { if (!m[dropId]) return m; const n = { ...m }; if (!n[keepId]) n[keepId] = n[dropId]; delete n[dropId]; return n; });
    setDupReports((d) => { const n = { ...d }; delete n[keepId]; delete n[dropId]; return n; });
    setFocusId(keepId); setView('details');
    setToast({ text: `Merged for good. ${keep.name} is now version ${v}, with the history of both.` });
  };

  // Press and hold the grip to pick a row up, then drag. Arrow keys also move it.
  const gripDown = (ev: React.PointerEvent, id: string, i: number) => {
    (ev.currentTarget as HTMLElement).setPointerCapture?.(ev.pointerId);
    window.clearTimeout(pressTimer.current);
    pressTimer.current = window.setTimeout(() => { setDrag({ id, over: i }); (navigator as Navigator & { vibrate?: (n: number) => void }).vibrate?.(10); }, 280);
  };
  const gripMove = (ev: React.PointerEvent) => {
    if (!drag || !listRef.current) return;
    const others = [...listRef.current.querySelectorAll<HTMLElement>('[data-row]')].filter((el) => el.dataset.row !== drag.id);
    const over = others.filter((el) => { const b = el.getBoundingClientRect(); return ev.clientY > b.top + b.height / 2; }).length;
    if (over !== drag.over) setDrag({ ...drag, over });
  };
  const gripUp = () => {
    window.clearTimeout(pressTimer.current);
    if (!drag) return;
    setRows((rs) => { const from = rs.findIndex((x) => x.id === drag.id); return moveItem(rs, from, drag.over); });
    setDrag(null);
  };
  const gripKey = (ev: React.KeyboardEvent, i: number) => {
    if (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown') return;
    ev.preventDefault();
    const to = ev.key === 'ArrowUp' ? i - 1 : i + 1;
    if (to < 0 || to >= rows.length) return;
    setRows((rs) => moveItem(rs, i, to));
  };
  const shownRows = (() => {
    if (!drag) return rows;
    const d = rows.find((x) => x.id === drag.id);
    if (!d) return rows;
    const rest = rows.filter((x) => x.id !== drag.id);
    rest.splice(drag.over, 0, d);
    return rest;
  })();

  const nav: { id: View; label: string; short: string; icon: string; match: View[]; count?: number }[] = [
    { id: 'library', label: 'Exercises', short: 'Exercises', icon: I.library, match: ['library', 'details', 'mycopy', 'libedit', 'history'] },
    { id: 'routines', label: 'Routines', short: 'Routines', icon: I.routine, match: ['routines', 'routine', 'routinehistory', 'routineedit'] },
    { id: 'programs', label: 'Programs', short: 'Programs', icon: I.programs, match: ['programs', 'builder', 'share', 'linkpage'] },
    { id: 'requests', label: 'Requests and drafts', short: 'Requests', icon: I.inbox, match: ['requests', 'review'], count: draftCount },
  ];
  const hasActionBar = view === 'review' || view === 'builder' || view === 'share' || view === 'libedit' || view === 'routine' || view === 'routineedit';
  const aq = addQuery.trim().toLowerCase();
  const addMine = mineIds.map((id) => library.find((e) => e.id === id)!).filter((e) => matches(e, aq, false));
  const addAll = library.filter((e) => matches(e, aq, false));
  const addMore = aq ? addAll.filter((e) => !my[e.id]) : [];

  const LibCard = ({ e, mode }: { e: Exercise; mode: 'mine' | 'all' }) => {
    const m = my[e.id];
    const alias = matchedAlias(e);
    const name = myText(e, m, 'title');
    const libUpd = updatedFields(e, m).length > 0;
    return (
      <li className="relative min-w-0">
        <button type="button" onClick={() => setPeek(e)} className={cx('flex min-h-[100px] w-full items-start gap-3 rounded-2xl border p-3 text-left transition hover:shadow-sm active:brightness-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 lg:gap-4 lg:p-4', CAT[e.kind].card)}>
          <Thumb pose={e.pose} size="h-[72px] w-24" />
          <div className="min-w-0 flex-1">
            <h3 className="pr-8 font-semibold leading-snug">{name}<span className="sr-only">, {CAT[e.kind].label}</span></h3>
            <p className="mt-0.5 truncate pr-8 text-sm text-slate-600">{e.region}</p>
            <div className="mt-1.5 flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1 pr-12 text-xs text-slate-600">
              {alias ? <span className="truncate">Matched alias: <span className="font-medium text-teal-800">{alias}</span></span> : mode === 'mine' && m && fromRequest[e.id] ? (
                <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5"><span className="rounded-full bg-teal-700 px-2 py-0.5 font-semibold text-white">New</span><span className="font-medium text-teal-800">Approved from your request</span></span>
              ) : mode === 'mine' && m ? (
                <>
                  <span>{m.lastUsed ? `Used ${m.lastUsed}` : `Saved ${m.savedAt}`}</span>
                  {editCount(m) > 0 && <span className="inline-flex items-center gap-1 font-semibold text-teal-800"><Icon d={I.pencil} className="h-3 w-3" sw={2.2} />Edited</span>}
                  {libUpd && <span className="inline-flex items-center gap-1 font-semibold text-amber-800"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />Library updated</span>}
                </>
              ) : e.addedBy !== 'library' ? <span className="inline-flex items-center gap-1">{ADDED_BY_LABEL[e.addedBy]}</span> : null}
            </div>
          </div>
        </button>
        <span className="pointer-events-none absolute right-3 top-3"><CatIcon kind={e.kind} /></span>
        {mode === 'mine' && m ? (
          <button type="button" onClick={() => togglePin(e)} aria-pressed={m.pinned} aria-label={m.pinned ? `Unpin ${name}` : `Pin ${name}`} className={cx('absolute bottom-1.5 right-1.5 flex h-11 w-11 items-center justify-center rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600', m.pinned ? 'text-teal-700 hover:bg-white/70' : 'text-slate-400 hover:bg-white/70 hover:text-slate-600')}>
            <Icon d={I.pin} fill={m.pinned} sw={1.8} />
          </button>
        ) : (
          <button type="button" onClick={() => (m ? unsave(e) : save(e))} aria-pressed={!!m} aria-label={m ? `${name} is in My exercises. Remove it` : `Save ${name} to My exercises`} className={cx('absolute bottom-1.5 right-1.5 flex h-11 w-11 items-center justify-center rounded-full border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600', m ? 'border-teal-300 bg-teal-50 text-teal-700 hover:bg-teal-100' : 'border-slate-300 bg-white text-teal-800 hover:bg-teal-50')}>
            <Icon d={m ? I.check : I.bookmarkPlus} sw={m ? 2.4 : 2} />
          </button>
        )}
      </li>
    );
  };

  // v11: a program made from a routine (or from scratch) has no link until its first publish.
  const neverPublished = pub.at === '';
  const noLink = shareState === 'closed' || neverPublished;
  const pubMode = pending || noLink;
  const newMine = mineResults.filter((e) => fromRequest[e.id]);
  const pinnedMine = mineResults.filter((e) => my[e.id].pinned && !fromRequest[e.id]);
  const restMineRaw = mineResults.filter((e) => !my[e.id].pinned && !fromRequest[e.id]);
  const restMine = sortBy === 'used' ? restMineRaw : sortList(restMineRaw);

  return (
    <div className="flex min-h-screen w-full justify-center overflow-x-clip bg-slate-50 text-slate-900" style={{ fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}>
      <div className="flex w-full max-w-[1440px] flex-col">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-4 lg:h-16 lg:px-8">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-700 text-sm font-bold text-white">D</div>
              <div className="leading-tight">
                <div className="text-[15px] font-semibold">Didi Physio</div>
                <div className="text-[11px] font-medium uppercase tracking-wider text-teal-700">Concept</div>
              </div>
            </div>
            <nav className="ml-6 hidden items-center gap-1 lg:flex" aria-label="Main">
              {nav.map((n) => (
                <button key={n.id} type="button" onClick={() => setView(n.id)} aria-current={n.match.includes(view) ? 'page' : undefined} className={cx('relative min-h-11 rounded-xl px-3.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600', n.match.includes(view) ? 'bg-teal-50 text-teal-800' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900')}>
                  {n.label}{!!n.count && <span className="ml-2 rounded-full bg-amber-500 px-1.5 py-0.5 text-[11px] font-bold text-white">{n.count}</span>}
                </button>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-2.5">
              <span className="hidden text-sm text-slate-500 lg:inline">Signed in as</span>
              <div className="relative">
                <button type="button" onClick={() => setMenuOpen((o) => !o)} aria-haspopup="menu" aria-expanded={menuOpen} aria-label="Account menu" className={cx('flex min-h-11 items-center gap-2 rounded-full border py-1 pl-1 pr-3 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600', view === 'defaults' ? 'border-teal-300 bg-teal-50' : 'border-slate-200 hover:bg-slate-50')}>
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-white">K</span>
                  <span className="text-sm font-medium">Kojo</span>
                  <Icon d={I.chevron} className="h-4 w-4 text-slate-400" />
                </button>
                {menuOpen && (
                  <>
                    <button type="button" aria-label="Close menu" tabIndex={-1} onClick={() => setMenuOpen(false)} className="fixed inset-0 z-30 cursor-default" />
                    <div role="menu" className="absolute right-0 top-[calc(100%+8px)] z-40 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white py-1 shadow-xl animate-in fade-in slide-in-from-top-1">
                      <div className="px-4 py-2.5 text-xs text-slate-500">Signed in as <span className="font-semibold text-slate-800">Kojo</span>, physiotherapist</div>
                      <button type="button" role="menuitem" onClick={() => setView('defaults')} className="flex min-h-12 w-full items-center gap-3 px-4 text-left text-sm font-medium hover:bg-slate-50"><Icon d={I.sliders} className="h-5 w-5 text-teal-700" /><span className="flex-1">My defaults</span><span className="text-xs text-slate-500">Types, links</span></button>
                      <button type="button" role="menuitem" onClick={() => setMenuOpen(false)} className="flex min-h-12 w-full items-center gap-3 px-4 text-left text-sm font-medium text-slate-500 hover:bg-slate-50"><Icon d={I.back} className="h-5 w-5" />Sign out</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </header>

        <main className={cx('mx-auto w-full max-w-6xl flex-1 px-4 pt-4 lg:px-8 lg:pb-12 lg:pt-10', hasActionBar ? 'pb-44' : 'pb-24')}>
          {view === 'library' && (
            <section aria-labelledby="lib-h">
              <h1 id="lib-h" className="text-2xl font-semibold tracking-tight lg:text-3xl">Exercise library</h1>
              <div className="mt-3"><Tabs label="Library" value={libTab} onChange={(t) => { setLibTab(t); setJustRequested(null); }} tabs={[{ id: 'mine', label: 'My exercises', count: mineIds.length }, { id: 'all', label: 'All exercises', count: library.length }]} /></div>
              <p className="mt-3 min-h-[3.75rem] text-sm text-slate-500 sm:min-h-10 lg:min-h-0">{libTab === 'mine' ? 'Exercises you saved or used in a program. Pin your favourites to keep them on top.' : `${library.length} approved exercises, shared by every practitioner. Any practitioner can improve one, and every change is kept in version history.`}</p>
              <div className="sticky top-14 z-10 -mx-4 bg-slate-50/95 px-4 py-2 backdrop-blur lg:static lg:mx-0 lg:mt-4 lg:rounded-t-2xl lg:border lg:border-b-0 lg:border-slate-200 lg:bg-white lg:px-5 lg:pb-0 lg:pt-5">
                <label htmlFor="q" className="sr-only">Search exercises</label>
                <div className="relative">
                  <Icon d={I.search} className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  <input id="q" type="search" enterKeyHint="search" value={query} onChange={(e) => { setQuery(e.target.value); setJustRequested(null); setSimilarFor(null); setFormStart(Date.now()); }} placeholder={libTab === 'mine' ? 'Search my exercises' : 'Try: heel slides, SLR, knee'} className={`${input} min-h-12 pl-11 pr-20 text-base shadow-sm`} />
                  {query && <button type="button" onClick={() => { setQuery(''); setJustRequested(null); }} className="absolute right-0.5 top-1/2 min-h-11 -translate-y-1/2 rounded-lg px-3 text-sm font-medium text-slate-500 hover:bg-slate-100">Clear</button>}
                </div>
              </div>
              {(() => {
                const active = (region !== 'All' ? 1 : 0) + (typeChoice !== 'both' ? 1 : 0);
                const tc = TYPE_CHOICES.find((t) => t.id === typeChoice)!;
                const summary = [region === 'All' ? 'All regions' : region, tc.label, SORTS.find((x) => x.id === sortBy)!.label].join(' · ');
                return (
                  <div className="mt-1 rounded-2xl border border-slate-200 bg-white lg:mt-0 lg:rounded-t-none lg:border-t-0">
                    <button type="button" onClick={() => { setFiltersOpen((o) => !o); setTypeOpen(false); }} aria-expanded={filtersOpen} aria-controls="filters-panel" className="flex min-h-[56px] w-full items-center gap-3 rounded-2xl px-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 lg:px-5">
                      <Icon d={I.sliders} className="h-5 w-5 shrink-0 text-teal-700" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">Filters &amp; sort{active > 0 && <span className="rounded-full bg-teal-700 px-2 py-0.5 text-[11px] font-bold text-white" aria-label={`${active} active`}>{active}</span>}</span>
                        {!filtersOpen && <span className="block truncate text-xs text-slate-500">{summary}</span>}
                      </span>
                      <Icon d={I.chevron} className={cx('h-5 w-5 shrink-0 text-slate-400 transition', filtersOpen && 'rotate-180')} />
                    </button>
                    {filtersOpen && (
                      <div id="filters-panel" className="space-y-4 border-t border-slate-100 px-4 pb-4 pt-3 lg:px-5">
                        <div>
                          <div id="f-region" className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Body region</div>
                          <div className="flex flex-wrap gap-2" role="group" aria-labelledby="f-region">
                            {REGIONS.map((r) => (
                              <button key={r} type="button" onClick={() => setRegion(r)} aria-pressed={region === r} className={cx('min-h-11 rounded-full border px-4 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600', region === r ? 'border-teal-700 bg-teal-700 text-white shadow-sm' : 'border-slate-300 bg-white text-slate-700 hover:border-teal-300')}>{r}</button>
                            ))}
                          </div>
                        </div>
                        <div className="relative">
                          <div id="f-type" className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Type</div>
                          <button type="button" onClick={() => setTypeOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={typeOpen} aria-labelledby="f-type f-type-val" className={cx('flex min-h-[52px] w-full items-center gap-3 rounded-xl border bg-white px-3.5 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 lg:max-w-md', typeOpen ? 'border-teal-600 ring-1 ring-teal-600' : 'border-slate-300 hover:border-slate-400')}>
                            <TypeGlyph t={typeChoice} />
                            <span id="f-type-val" className="min-w-0 flex-1 leading-tight"><span className="block text-sm font-semibold text-slate-900">{tc.label}</span><span className="block truncate text-xs text-slate-500">{tc.hint}</span></span>
                            <Icon d={I.chevron} className={cx('h-5 w-5 shrink-0 text-slate-400 transition', typeOpen && 'rotate-180')} />
                          </button>
                          {typeOpen && (
                            <>
                              <button type="button" aria-label="Close type list" tabIndex={-1} onClick={() => setTypeOpen(false)} className="fixed inset-0 z-30 cursor-default" />
                              <ul role="listbox" aria-labelledby="f-type" className="absolute left-0 right-0 top-[calc(100%+6px)] z-40 overflow-hidden rounded-2xl border border-slate-200 bg-white py-1 shadow-xl animate-in fade-in slide-in-from-top-1 lg:max-w-md">
                                {TYPE_CHOICES.map((t) => (
                                  <li key={t.id} role="option" aria-selected={typeChoice === t.id}>
                                    <button type="button" onClick={() => { setTypeChoice(t.id); setTypeOpen(false); }} className={cx('flex min-h-[56px] w-full items-center gap-3 px-3.5 text-left transition hover:bg-slate-50 focus:outline-none focus-visible:bg-slate-50', typeChoice === t.id && 'bg-teal-50/60')}>
                                      <TypeGlyph t={t.id} />
                                      <span className="min-w-0 flex-1 leading-tight"><span className="block text-sm font-semibold text-slate-900">{t.label}</span><span className="block text-xs text-slate-500">{t.hint}</span></span>
                                      {typeChoice === t.id && <Icon d={I.check} className="h-5 w-5 shrink-0 text-teal-700" sw={2.4} />}
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            </>
                          )}
                        </div>
                        <div>
                          <div id="f-sort" className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Sort</div>
                          <div role="radiogroup" aria-labelledby="f-sort" className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 lg:inline-grid lg:min-w-[360px]">
                            {SORTS.map((o) => (
                              <button key={o.id} type="button" role="radio" aria-checked={sortBy === o.id} onClick={() => setSortBy(o.id)} className={cx('min-h-11 rounded-lg px-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600', sortBy === o.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900')}>{o.label}</button>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2 pt-1">
                          <button type="button" disabled={active === 0 && sortBy === 'used'} onClick={() => { setRegion('All'); setTypeChoice('both'); setSortBy('used'); }} className={`${linkBtn} -ml-2 disabled:text-slate-400`}>Reset</button>
                          <button type="button" onClick={() => setFiltersOpen(false)} className={`${secondary} px-5`}>Done</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {libTab === 'mine' && (mineResults.length > 0 ? (
                <div className="mt-5 space-y-5">
                  {newMine.length > 0 && (
                    <div>
                      <h2 className="mb-2 flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-teal-800"><Icon d={I.check} className="h-3.5 w-3.5" sw={2.4} />New from your requests</h2>
                      <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">{newMine.map((e) => <LibCard key={e.id} e={e} mode="mine" />)}</ul>
                    </div>
                  )}
                  {pinnedMine.length > 0 && (
                    <div>
                      <h2 className="mb-2 flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500"><Icon d={I.pin} className="h-3.5 w-3.5" fill />Pinned</h2>
                      <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">{pinnedMine.map((e) => <LibCard key={e.id} e={e} mode="mine" />)}</ul>
                    </div>
                  )}
                  {restMine.length > 0 && (
                    <div>
                      <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{sortBy === 'used' ? 'Recently used and saved' : `Saved, ${SORTS.find((x) => x.id === sortBy)!.label}`}</h2>
                      <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">{restMine.map((e) => <LibCard key={e.id} e={e} mode="mine" />)}</ul>
                    </div>
                  )}
                  <button type="button" onClick={() => setLibTab('all')} className={`${secondary} w-full lg:w-auto`}><Icon d={I.search} className="h-4 w-4" />Browse all exercises</button>
                </div>
              ) : (
                <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-center">
                  <h2 className="font-semibold">{q ? `Nothing in My exercises matches "${query}"` : 'No saved exercises with these filters'}</h2>
                  <p className="mt-1 text-sm text-slate-600">{allResults.length > 0 ? `${allResults.length} ${allResults.length === 1 ? 'match' : 'matches'} in All exercises.` : 'Try All exercises, or request it there.'}</p>
                  <button type="button" onClick={() => setLibTab('all')} className={`${primary} mt-4 w-full lg:w-auto`}>Search all exercises</button>
                </div>
              ))}

              {libTab === 'all' && (() => {
                // v9 (#12): similar exercises and drafts in progress show on the results page, before anyone fills in a request.
                const sim = q ? similarTo(query.trim()) : { lib: [], reqs: [] };
                const simLib = sim.lib.filter((e) => !allResults.some((x) => x.id === e.id) && matches(e, '', true));
                const simReqs = sim.reqs;
                const hasSim = simLib.length + simReqs.length > 0;
                const similarList = (
                  <section className="mt-5" aria-labelledby="sim-h">
                    <h2 id="sim-h" className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Similar in the library and drafts</h2>
                    <ul className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-2">
                      {simLib.map((e) => (
                        <li key={e.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-2.5">
                          <Thumb pose={e.pose} size="h-12 w-16" />
                          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-1.5"><span className="font-semibold leading-snug">{e.name}</span><Badge tone="green">In library</Badge></div><div className="truncate text-xs text-slate-500">{e.aliases.join(', ')}</div><CatLine kind={e.kind} /></div>
                          <button type="button" onClick={() => { openDetails(e); setToast({ text: `Using ${e.name}. No request made.` }); }} className={`${secondary} shrink-0 px-3`}>Use this</button>
                        </li>
                      ))}
                      {simReqs.map((r) => (
                        <li key={r.id} className="flex items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white p-2.5">
                          <Thumb pose="pending" size="h-12 w-16" />
                          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-1.5"><span className="font-semibold leading-snug">{r.name}</span><Badge tone="amber">Draft</Badge></div><div className="text-xs text-slate-500">Requested by {WHO[r.by]}, {r.status === 'drafting' ? 'AI drafting' : 'ready to review'}</div></div>
                          <button type="button" onClick={() => setView(r.status === 'draft' && r.name === COPENHAGEN_DRAFT.name ? 'review' : 'requests')} className={`${secondary} shrink-0 px-3`}>View draft</button>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
                const requestForm = (
                  <form onSubmit={(e) => { e.preventDefault(); requestIt(); }} className="rounded-xl bg-slate-50 p-4">
                    <div className="text-sm font-medium">Exercise</div>
                    <div className="mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">{query}</div>
                    <label htmlFor="note" className="mt-3 block text-sm font-medium">Note for the AI <span className="font-normal text-slate-500">(optional)</span></label>
                    <input id="note" value={reqNote} onChange={(e) => setReqNote(e.target.value)} placeholder="For example: rehab version, supine" className={`${input} mt-1`} />
                    <button type="submit" className={`${primary} mt-4 w-full lg:w-auto`}>Submit request</button>
                    <label className="mt-4 flex cursor-pointer items-start gap-2 rounded-xl border border-dashed border-indigo-300 bg-white px-3 py-2.5 text-xs text-indigo-900">
                      <input type="checkbox" checked={demoConflict} onChange={(e) => setDemoConflict(e.target.checked)} className="mt-0.5 h-4 w-4 accent-indigo-600" />
                      <span><span className="font-semibold">Concept demo:</span> another practitioner submits something similar while you fill this in.</span>
                    </label>
                  </form>
                );
                return (
                  <>
                    {allResults.length > 0 && (
                      <>
                        <p className="mt-5 text-sm text-slate-500">{allResults.length} {allResults.length === 1 ? 'result' : 'results'}{query && <> for <span className="font-medium text-slate-800">"{query}"</span></>}. Tap <Icon d={I.bookmarkPlus} className="inline h-4 w-4 align-[-3px] text-teal-800" sw={2} /> to save to My exercises.</p>
                        <ul className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">{allResults.map((e) => <LibCard key={e.id} e={e} mode="all" />)}</ul>
                      </>
                    )}
                    {allResults.length === 0 && !justRequested && <div className="mt-5 px-1"><h2 className="text-lg font-semibold">No exact match for "{query}"</h2><p className="mt-1 text-sm text-slate-600">{hasSim ? 'These look close. If one fits, use it instead of requesting a new one.' : "It isn't in the library or in drafts yet."}</p></div>}
                    {hasSim && !justRequested && similarList}
                    {allResults.length === 0 && (
                      <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-white p-5 lg:p-8">
                        {justRequested ? (
                          <div className="flex flex-col items-start gap-4 lg:flex-row lg:items-center">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-700"><Icon d={I.check} sw={2.2} /></div>
                            <div className="flex-1">
                              <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold">Requested: {justRequested}</h2><Badge tone="amber">AI drafting</Badge></div>
                              <p className="mt-1 text-sm text-slate-600">The AI is writing a draft with images and a short video. Every practitioner can see it in Requests, and any of them can review and approve it. Then it joins the shared library.</p>
                            </div>
                            <button type="button" onClick={() => setView('requests')} className={`${primary} w-full lg:w-auto`}>View request</button>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.2fr] lg:items-start">
                            <div>
                              <h2 className="font-semibold">{hasSim ? 'None of these? Request a new exercise' : 'Request a new exercise'}</h2>
                              <p className="mt-1 text-sm text-slate-600">The AI drafts it for any practitioner to review and approve.</p>
                            </div>
                            {requestForm}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                );
              })()}
            </section>
          )}

          {view === 'conflict' && conflict && (() => {
            const items = requests.filter((r) => conflict.ids.includes(r.id));
            return (
              <section aria-labelledby="cf-h">
                <BackLink onClick={() => setView('library')}>Back to your request</BackLink>
                <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-teal-800">New exercise request</p>
                <h1 id="cf-h" className="text-2xl font-semibold tracking-tight lg:text-3xl">Someone submitted something similar</h1>
                <div className="mt-3 flex items-start gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="status">
                  <Icon d={I.users} className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                  <p>While you were adding this, someone submitted something similar. Your request isn't submitted yet. Use theirs, merge your changes into it, or submit yours anyway.</p>
                </div>
                <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Your request</h2>
                  <p className="mt-1 font-semibold">{conflict.name}</p>
                  <p className="text-sm text-slate-600">{conflict.note ? `Note: ${conflict.note}` : 'No note'}</p>
                </div>
                <h2 className="mt-5 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Submitted while you were adding</h2>
                <ul className="mt-2 space-y-2 lg:max-w-2xl">
                  {items.map((r) => (
                    <li key={r.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                      <div className="flex items-center gap-3">
                        <Thumb pose="pending" size="h-12 w-16" />
                        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-1.5"><span className="font-semibold leading-snug">{r.name}</span><Badge tone="amber">Draft</Badge></div><div className="text-xs text-slate-500">Requested by {WHO[r.by]}, {r.when.toLowerCase()} · {r.status === 'drafting' ? 'AI drafting' : 'ready to review'}</div>{r.note && <div className="text-xs text-slate-600">"{r.note}"</div>}</div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => { setConflict(null); setReqNote(''); setView('requests'); setToast({ text: `Using ${r.name}. Your request wasn't submitted.` }); }} className={`${secondary} px-3`}>Use this</button>
                        <button type="button" onClick={() => { setConflict(null); mergeIntoRequest(r.id, r.name); }} className={`${primary} px-3`}><Icon d={I.merge} className="h-4 w-4" />Merge my changes</button>
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 px-1 text-xs text-slate-500">Merge my changes adds your name and note to their draft, so there's one request.</p>
                <div className="mt-5 flex flex-col gap-2 lg:flex-row">
                  <button type="button" onClick={() => { setView('library'); requestIt(true); }} className={`${secondary} w-full lg:w-auto`}>Submit anyway</button>
                  <button type="button" onClick={() => setView('library')} className={`${ghost} w-full lg:w-auto`}>Back to edit</button>
                </div>
              </section>
            );
          })()}

          {view === 'details' && focusEx && (
            <DetailsView key={`${focusEx.id}-${focusEx.version}`} ex={focusEx} dupOf={dupReports[focusEx.id] ? library.find((e) => e.id === dupReports[focusEx.id]) : undefined} initialRegen={regenSeed} regenLeft={regenLeft} onRegenerate={(what, note) => { setRegenSeed(false); useRegen(); publishMedia(focusEx, what, note); }} onReportDup={() => { setFocusId(focusEx.id); setView('dup'); }} onMergeReported={() => setView('dup')} onDismissDup={() => { setDupReports((d) => { const n = { ...d }; delete n[dupReports[focusEx.id]]; delete n[focusEx.id]; return n; }); setToast({ text: 'Marked as not a duplicate. The note is removed for every practitioner.' }); }} mine={my[focusEx.id]} history={historyFor(focusEx, history)} resolve={(t) => resolve(focusEx.id, t)} onBack={() => setView('library')} onSave={() => save(focusEx)} onEdit={() => openMyCopy(focusEx)} onEditLibrary={() => openLibEdit(focusEx)} onHistory={() => openHistory(focusEx)} />
          )}

          {view === 'mycopy' && focusEx && my[focusEx.id] && (
            <MyCopyView ex={focusEx} mine={my[focusEx.id]} myDefaults={myDefaults} patch={(f) => patchMy(focusEx.id, f)} onBack={() => setView('library')} onDetails={() => openDetails(focusEx)} onRemove={() => { unsave(focusEx); setView('library'); }} toast={(t) => setToast({ text: t })} onEditLibrary={() => openLibEdit(focusEx)} />
          )}

          {view === 'libedit' && focusEx && (
            <LibEditView key={`le-${focusEx.id}-${focusEx.version}-${libSeed?.alias ?? ''}`} ex={focusEx} seed={libSeed?.id === focusEx.id ? libSeed : undefined} saved={!!my[focusEx.id]} onBack={() => { setLibSeed(null); openDetails(focusEx); }} onMyCopy={() => openMyCopy(focusEx)} onHistory={() => openHistory(focusEx)}
              onPublish={(next, summary, changes) => { const v = publishVersion(focusEx, next, summary, changes); setLibSeed(null); setToast({ text: `Saved as version ${v} for every practitioner. Programs that use it get a prompt to update or keep their original.` }); openDetails(focusEx); }} />
          )}

          {view === 'dup' && focusEx && (
            <DupView ex={focusEx} library={library} history={history} reportedWith={dupReports[focusEx.id]} initialStep={initialDupStep} onBack={() => openDetails(focusEx)}
              onReport={(otherId) => { setDupReports((d) => ({ ...d, [focusEx.id]: otherId, [otherId]: focusEx.id })); setToast({ text: 'Reported. Both exercises now show a possible duplicate note to every practitioner.' }); openDetails(focusEx); }}
              onMerge={mergeInto} />
          )}

          {view === 'history' && focusEx && (
            <HistoryView ex={focusEx} versions={historyFor(focusEx, history)} initialRestore={initialRestore} onBack={() => openDetails(focusEx)} onEdit={() => openLibEdit(focusEx)}
              onRestore={(ver) => { const merged = historyFor(focusEx, history).some((x) => x.merge && x.v > ver.v); const snap = merged ? { ...(ver.snap ?? {}), aliases: [...new Set([...(ver.snap?.aliases ?? []), ...focusEx.aliases])] } : ver.snap ?? {}; const v = publishVersion(focusEx, snap, `Restored version ${ver.v}`, [`Text, images and video set back to version ${ver.v}`, ...(merged ? ['Merged names stay as aliases. Merges are permanent'] : [])]); setToast({ text: `Version ${ver.v} restored as version ${v}. Nothing was deleted.` }); }} />
          )}

          {view === 'requests' && (
            <section aria-labelledby="req-h">
              <h1 id="req-h" className="text-2xl font-semibold tracking-tight lg:text-3xl">Requests and drafts</h1>
              <p className="mt-1 text-sm text-slate-500">Requests in progress from every practitioner. Any practitioner can review a draft and approve it. Once approved, it leaves this list, joins the shared library and goes straight into the requester's My exercises.</p>
              <p className="mt-2 flex items-start gap-1.5 text-xs text-slate-500"><Icon d={I.users} className="mt-px h-3.5 w-3.5 shrink-0 text-teal-700" />Shared with all practitioners, so nobody requests the same exercise twice.</p>
              {requests.every((r) => r.status === 'approved') && <p className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center text-sm text-slate-500">Nothing in progress. Approved exercises are in the library.</p>}
              <ul className="mt-5 space-y-3">
                {requests.filter((r) => r.status !== 'approved').map((r) => (
                  <li key={r.id} className="rounded-2xl border border-slate-200 bg-white p-4 lg:flex lg:items-center lg:gap-4 lg:p-5">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <Thumb pose={r.status === 'drafting' ? 'pending' : r.name === COPENHAGEN_DRAFT.name ? CPH : library.find((e) => e.name === r.name)?.pose ?? 'pending'} size="h-14 w-[75px]" />
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold leading-snug">{r.name}</h3>
                        <div className="mt-1">
                          {r.status === 'drafting' && <Badge tone="slate"><Spinner /> AI drafting</Badge>}
                          {r.status === 'draft' && <Badge tone="amber">Draft, not approved</Badge>}
                          {r.status === 'approved' && <Badge tone="green">Approved v1</Badge>}
                        </div>
                        <p className="mt-1 text-sm text-slate-600">Requested by <span className="font-medium text-slate-800">{WHO[r.by]}</span>, {r.when}</p>
                        {r.approvedBy && <p className="text-sm text-slate-600">Approved by <span className="font-medium text-slate-800">{WHO[r.approvedBy]}</span>, {r.approvedOn}</p>}
                        {r.note && <p className="text-sm text-slate-500">"{r.note}"</p>}
                      </div>
                    </div>
                    {r.status === 'draft' && <button type="button" onClick={() => setView('review')} className={`${primary} mt-3 w-full lg:mt-0 lg:w-auto`}>{r.by === 'you' ? 'Review draft' : 'Review and approve'}</button>}
                    {r.status === 'drafting' && <p className="mt-2 text-sm text-slate-500 lg:mt-0">Usually ready in a minute</p>}
                    {r.status === 'approved' && <button type="button" onClick={() => { setQuery(r.name); setLibTab('all'); setView('library'); }} className={`${secondary} mt-3 w-full lg:mt-0 lg:w-auto`}>View in library</button>}
                  </li>
                ))}
              </ul>
              {!requests.some((r) => r.name === COPENHAGEN_DRAFT.name) && (
                <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
                  Tip for the demo: in All exercises, search for <button type="button" className="font-semibold text-teal-700 underline-offset-2 hover:underline" onClick={() => { setQuery(COPENHAGEN_DRAFT.name); setJustRequested(null); setLibTab('all'); setView('library'); }}>Copenhagen plank, short lever</button> and request it.
                </div>
              )}
            </section>
          )}

          {view === 'review' && (
            <DraftReview
              regenLeft={regenLeft} onUseRegen={useRegen}
              approved={requests.find((r) => r.name === COPENHAGEN_DRAFT.name)?.status === 'approved'}
              requestedBy={requests.find((r) => r.name === COPENHAGEN_DRAFT.name)?.by ?? cphBy}
              onBack={() => setView('requests')}
              onApprove={(f) => {
                const by = requests.find((r) => r.name === COPENHAGEN_DRAFT.name)?.by ?? cphBy;
                setRequests((rs) => rs.map((r) => (r.name === COPENHAGEN_DRAFT.name ? { ...r, status: 'approved', approvedBy: 'you', approvedOn: 'Oct 24' } : r)));
                setLibrary((l) => (l.some((e) => e.id === 'ex-cph') ? l : [...l, cphExercise(f, by === 'you' ? 'you' : 'practitioner')]));
                if (by === 'you') { setMy((m) => ({ ...m, 'ex-cph': m['ex-cph'] ?? { pinned: false, savedAt: TODAY, notes: '', text: {}, params: {} } })); setFromRequest((x) => ({ ...x, 'ex-cph': true })); }
                setToast({ text: by === 'you' ? 'Approved. It left Requests and drafts, and it is in your My exercises as new.' : "Approved. It left Requests and drafts. It is in All exercises, and in the requester's My exercises." });
              }}
              onReopen={() => setRequests((rs) => rs.map((r) => (r.name === COPENHAGEN_DRAFT.name ? { ...r, status: 'draft' } : r)))}
              onAddToProgram={() => { const e = library.find((x) => x.id === 'ex-cph'); if (e) addToProgram(e); setView('builder'); }}
              toast={(text, undo) => setToast({ text, undo })}
              defaultFor={defaultFor}
            />
          )}

          {view === 'programs' && (
            <section aria-labelledby="prog-h">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h1 id="prog-h" className="text-2xl font-semibold tracking-tight lg:text-3xl">Programs</h1>
                  <p className="mt-1 text-sm text-slate-500">Each program has a name you pick and a code. No patient details. Find one you already sent by name or code, and edit just that copy.</p>
                </div>
                <button type="button" className={`${primary} w-full lg:w-auto`} onClick={() => setNewProgOpen(true)}><Icon d={I.plus} sw={2.2} />New program</button>
              </div>
              {programDeleted && <p className="mt-4 flex items-start gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700" role="status"><Icon d={I.check} className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" sw={2.2} /><span><span className="font-semibold">{title || 'Untitled program'} was deleted.</span> Its share link is closed. You can restore it from Recently deleted until Nov 23, 2026.</span></p>}
              {(() => {
                const list: (Prog & { flag?: string })[] = [
                  ...progs.filter((p) => !(programDeleted && p.code === 'PRG-7K3Q')).map((p) => (p.code === progCode ? { ...p, t: title || 'Untitled program', n: rows.length, s: neverPublished ? 'No link yet' : shareState === 'closed' ? 'Link closed. Program kept to reuse.' : expiryLine(expiry, customDate), flag: [dirty || unpublished ? (neverPublished ? 'Not published yet' : 'Draft changes not published') : '', libUpdates.length ? `${libUpdates.length} library ${libUpdates.length === 1 ? 'update' : 'updates'} to review` : ''].filter(Boolean).join(' · ') } : p)),
                  ...restored.map((r) => ({ code: r.id, t: r.t, n: r.n, s: 'Restored. Link closed, create a new one to share.', open: false, flag: '' })),
                ];
                const pq = progQuery.trim().toLowerCase();
                const norm = (x: string) => x.toLowerCase().replace(/prg-?/g, '');
                const shown = list.filter((p) => (progFilter === 'all' || (progFilter === 'routine') === !!p.from) && (!pq || [p.t, p.code, p.from?.name ?? ''].some((x) => norm(x).includes(norm(pq)) || x.toLowerCase().includes(pq))));
                return (
                  <>
                    <div className="sticky top-14 z-10 -mx-4 mt-4 bg-slate-50/95 px-4 py-2 backdrop-blur lg:static lg:mx-0 lg:mt-6 lg:bg-transparent lg:p-0">
                      <label htmlFor="progq" className="sr-only">Search programs by name or code</label>
                      <div className="relative">
                        <Icon d={I.search} className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                        <input id="progq" type="search" value={progQuery} onChange={(e) => setProgQuery(e.target.value)} placeholder="Search by name or code" className={`${input} min-h-12 pl-11`} />
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Show programs">
                      {([['all', 'All'], ['routine', 'From a routine'], ['scratch', 'From scratch']] as const).map(([id, l]) => (
                        <button key={id} type="button" onClick={() => setProgFilter(id)} aria-pressed={progFilter === id} className={cx('min-h-11 rounded-full border px-4 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600', progFilter === id ? 'border-teal-700 bg-teal-700 text-white shadow-sm' : 'border-slate-300 bg-white text-slate-700 hover:border-teal-300')}>{l}</button>
                      ))}
                    </div>
                    <p className="mt-3 px-1 text-sm text-slate-500" aria-live="polite">{pq || progFilter !== 'all' ? `${shown.length} of ${list.length} programs` : `${list.length} programs`}</p>
                    {shown.length === 0 ? (
                      <div className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center">
                        <p className="font-semibold">No program matches "{progQuery.trim()}"</p>
                        <p className="mt-1 text-sm text-slate-500">Search by the name you gave it or its code, like PRG-2M8D. Routine names work too.</p>
                        <button type="button" onClick={() => { setProgQuery(''); setProgFilter('all'); }} className={`${secondary} mt-4`}>Clear search</button>
                      </div>
                    ) : (
                      <ul className="mt-2 grid grid-cols-1 gap-3 lg:grid-cols-2">
                        {shown.map((p) => (
                          <li key={p.code} className="min-w-0">
                            <button type="button" onClick={() => p.open && openProgram(p)} className="flex min-h-[72px] w-full items-start gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-teal-200 hover:shadow-sm active:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 lg:p-5">
                              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><Icon d={p.from ? I.routine : I.programs} /></div>
                              <div className="min-w-0 flex-1">
                                <div className="font-semibold leading-snug">{p.t}</div>
                                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500"><span className={cx('rounded-md px-1.5 py-0.5 font-mono text-[13px] font-semibold', pq && norm(p.code).includes(norm(pq)) ? 'bg-teal-100 text-teal-900' : 'bg-slate-100 text-slate-700')}>{p.code}</span><span>{p.n} exercises{p.sent ? ` · Sent ${p.sent}` : ''}</span></div>
                                <div className="mt-1.5 text-sm text-slate-600">{p.from ? <>From routine <span className="font-medium text-slate-800">{p.from.name}</span>, v{p.from.v}{p.from.direct ? ', used as is' : ', then tweaked'}</> : 'Built from scratch'}</div>
                                <div className="text-sm text-slate-500">{p.s}</div>
                                {p.note && <div className="mt-1 text-sm font-medium text-slate-700">{p.note}</div>}
                                {p.flag && <div className="mt-1 text-sm font-medium text-teal-800">{p.flag}</div>}
                              </div>
                              <span className="text-xl text-slate-400" aria-hidden>›</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                );
              })()}
              {(programDeleted || trash.length > 0) && (
                <section aria-labelledby="trash-h" className="mt-8">
                  <h2 id="trash-h" className="px-1 font-semibold">Recently deleted</h2>
                  <p className="mt-0.5 px-1 text-sm text-slate-500">Restore a deleted program for 30 days. After that it's gone for good. Its old share link stays closed.</p>
                  <ul className="mt-3 grid gap-3 lg:grid-cols-2">
                    {[...(programDeleted ? [{ t: title || 'Untitled program', id: 'PRG-7K3Q', n: rows.length, on: 'Oct 24, 2026', until: 'Nov 23, 2026' }] : []), ...trash].map((p) => (
                      <li key={p.id} className="flex items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white p-4">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500"><Icon d={I.trash} /></div>
                        <div className="min-w-0 flex-1"><div className="font-semibold text-slate-700">{p.t}</div><div className="text-sm text-slate-500">{p.id} · {p.n} exercises</div><div className="text-sm text-slate-500">Deleted {p.on}. Restore until {p.until}.</div></div>
                        <button type="button" onClick={() => { if (p.id === 'PRG-7K3Q') setProgramDeleted(false); else { setTrash((t) => t.filter((x) => x.id !== p.id)); setRestored((r) => [...r, { t: p.t, id: p.id, n: p.n }]); } setToast({ text: `Restored ${p.t}. Its link stays closed. Create a new link from Share.` }); }} className={`${secondary} shrink-0 px-3`}><Icon d={I.undo} className="h-4 w-4" />Restore</button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </section>
          )}

          {view === 'builder' && (
            <section aria-labelledby="b-h">
              <BackLink onClick={() => setView('programs')}>Programs</BackLink>
              <div className="mt-1 flex flex-wrap items-end justify-between gap-x-3">
                <h1 id="b-h" className="text-2xl font-semibold tracking-tight lg:text-3xl">Build program</h1>
                <span className="rounded-lg bg-slate-100 px-2 py-1 font-mono text-sm font-semibold text-slate-700" aria-label={`Code ${progCode}`}>{progCode}</span>
              </div>
              <div className="mt-4 grid gap-5 lg:mt-6 lg:grid-cols-[1fr_320px] lg:gap-6">
                <div className="min-w-0 space-y-4">
                  {!drag && (
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 lg:p-5">
                      <label htmlFor="title" className="text-sm font-medium">Program name</label>
                      <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Knee rehab, week 1" className={`${input} mt-1.5`} />
                      <p className="mt-2 flex items-start gap-1.5 text-xs text-slate-500">
                        <Icon d={I.alert} className="mt-px h-3.5 w-3.5 shrink-0 text-teal-700" />
                        Pick a name you will recognise. With the code {progCode}, it is how you find this program later. Don't use patient names or anything that identifies them.
                      </p>
                    </div>
                  )}
                  {!drag && origin && (
                    <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4" role="note">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><Icon d={I.routine} className="h-5 w-5" /></span>
                      <div className="min-w-0 flex-1 text-sm">
                        <p className="font-semibold text-slate-900">From routine: {origin.name}, version {origin.v}</p>
                        <p className="mt-0.5 text-slate-600">A separate copy. Edits here change only this program, and later edits to the routine never change it.</p>
                        <button type="button" onClick={() => { setRoutineId(origin.id); setRSource('community'); setView('routine'); }} className={`${linkBtn} -ml-2 mt-0.5`}>View routine<Icon d={I.right} className="h-4 w-4" sw={2.2} /></button>
                      </div>
                    </div>
                  )}
                  {!drag && (
                    <div className={cx('rounded-2xl border p-4', pending ? 'border-amber-200 bg-amber-50/60' : 'border-slate-200 bg-white')} role="status">
                      <div className="flex items-start gap-2.5">
                        <Icon d={pending ? I.pencil : I.check} className={cx('mt-0.5 h-4 w-4 shrink-0', pending ? 'text-amber-700' : 'text-teal-700')} sw={2.2} />
                        <div className="min-w-0 flex-1 text-sm">
                          <div className="flex items-center justify-between gap-2"><p className="font-semibold text-slate-900">{neverPublished ? 'Not published yet' : pending ? 'Unpublished changes' : `Published ${pub.at}`}</p><span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-slate-500" aria-live="polite">{dirty ? <><span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-500" aria-hidden />Saving...</> : <><Icon d={I.check} className="h-3.5 w-3.5 text-teal-700" sw={2.4} />Saved</>}</span></div>
                          <p className="mt-0.5 text-slate-600">{neverPublished ? 'No share link yet. Publish when it is ready, and you get the link to send.' : pending ? (shareState === 'closed' ? 'Not live yet. There is no open link. Publish to create one.' : `Not live yet. Your patient still sees the version published ${pub.at}.`) : (shareState === 'closed' ? 'No open link. Publish to create one.' : 'Your patient sees this version on the share link.')}</p>
                        </div>
                      </div>
                    </div>
                  )}
                  {!drag && libUpdates.map(({ ex, from, n }) => (
                    <div key={ex.id} className="rounded-2xl border border-teal-200 bg-teal-50/60 p-4" role="region" aria-label={`Library update for ${ex.name}`}>
                      <div className="flex items-start gap-3">
                        <Thumb pose={ex.pose} size="h-11 w-14" />
                        <div className="min-w-0 flex-1 text-sm">
                          <p className="font-semibold text-slate-900">{ex.name} changed in the library</p>
                          <p className="mt-0.5 text-slate-700">Version {from} to version {ex.version}: {historyFor(ex, history)[0]?.summary ?? 'updated'}. Used in {n} {n === 1 ? 'row' : 'rows'} here.</p>
                          <p className="mt-1 text-xs text-slate-500">Programs aren't updated on their own. Update it, or keep your original.</p>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => keepOriginal(ex, from)} className={`${secondary} px-3`}>Keep my original</button>
                        <button type="button" onClick={() => updateFromLibrary(ex)} className={`${primary} px-3`}>Update to v{ex.version}</button>
                      </div>
                      <button type="button" onClick={() => openHistory(ex)} className={`${linkBtn} mt-1 -ml-1`}>See what changed</button>
                    </div>
                  ))}
                  <div className="px-1">
                    <div className="flex items-center justify-between">
                      <h2 className="font-semibold">Exercises</h2>
                      <span className="text-sm text-slate-500">{rows.length} total</span>
                    </div>
                    {drag ? (
                      <p className="mt-2 flex items-center gap-2 rounded-xl bg-teal-700 px-3 py-2.5 text-sm font-medium text-white" role="status"><Icon d={I.grip} className="h-5 w-5" sw={3} />Moving {rows.find((r) => r.id === drag.id)?.name}. Release to drop it in place {drag.over + 1}.</p>
                    ) : (
                      <p className="mt-1.5 flex items-start gap-1.5 text-xs text-slate-500"><Icon d={I.grip} className="h-4 w-4 shrink-0 text-slate-400" sw={3} />Press and hold the dots to reorder. Use copy to add the same exercise again, for example in a second version.</p>
                    )}
                  </div>
                  {rows.length === 0 && <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center text-sm text-slate-500">No exercises yet. Add exercises from My exercises or the full library.</p>}
                  <ol ref={listRef} className="space-y-3">
                    {shownRows.map((r) => {
                      const i = rows.findIndex((x) => x.id === r.id);
                      const kind: Kind = r.type === 'stretching' ? 'stretch' : 'strength';
                      const lifted = drag?.id === r.id;
                      const compact = !!drag;
                      return (
                        <li key={r.id} data-row={r.id} className={cx('rounded-2xl border border-l-4 bg-white p-3 transition lg:p-4', r.pending ? 'border-amber-200 border-l-amber-400 bg-amber-50/40' : cx('border-slate-200', CAT[kind].stripe), lifted && 'relative z-10 -rotate-1 scale-[1.02] shadow-2xl ring-2 ring-teal-600', compact && !lifted && 'opacity-80')}>
                          <div className="flex items-center gap-2">
                            <button type="button" aria-label={`Reorder ${r.name}, position ${i + 1}. Press and hold, then drag. Or use the arrow keys.`} onPointerDown={(e) => gripDown(e, r.id, i)} onPointerMove={gripMove} onPointerUp={gripUp} onPointerCancel={gripUp} onKeyDown={(e) => gripKey(e, i)} className={cx('-ml-1.5 flex h-11 w-8 shrink-0 touch-none items-center justify-center rounded-lg transition focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600', lifted ? 'cursor-grabbing bg-teal-50 text-teal-700' : 'cursor-grab text-slate-400 hover:bg-slate-100 hover:text-slate-600')}>
                              <Icon d={I.grip} className="h-5 w-5" sw={3.2} />
                            </button>
                            <Thumb pose={poseFor(r)} size="h-11 w-14" />
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold leading-snug">{r.name}</div>
                              <div className="mt-0.5">{r.pending ? <Badge tone="amber">Pending review</Badge> : <CatLine kind={kind} label={TYPE_LABEL[r.type]} />}</div>
                              {(() => { const le = library.find((e) => e.id === r.exerciseId); if (!le || r.libV === undefined || le.version <= r.libV) return null; return <div className="mt-1">{keptOriginal[le.id] === le.version ? <Badge tone="slate">Original kept, v{r.libV}</Badge> : <Badge tone="teal">Library v{le.version} available</Badge>}</div>; })()}
                            </div>
                            {!compact && <button type="button" aria-label={`Duplicate ${r.name}`} title="Duplicate" onClick={() => duplicateRow(r)} disabled={r.pending} className={iconBtn}><Icon d={I.copy} /></button>}
                            {!compact && <button type="button" aria-label={`Remove ${r.name}`} onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))} className={cx(iconBtn, '-mr-1.5')}><Icon d={I.trash} /></button>}
                          </div>
                          {!compact && (
                            <>
                              {r.pending && <p className="mt-2 text-xs text-amber-800">Placeholder. It links to the real exercise once you approve the draft.</p>}
                              {r.type !== 'stretching' && (
                                <div className="mt-3"><Segmented label={`Version of ${r.name}`} options={STRENGTH_TYPES} value={r.type as StrengthType} onChange={(t) => setRowType(r.id, t)} labels={TYPE_LABEL} /></div>
                              )}
                              <div className={cx('mt-3 rounded-xl px-3 py-2', r.edited ? 'bg-amber-50/70 ring-1 ring-inset ring-amber-200' : 'bg-slate-50')}>
                                <div className="flex items-start gap-2">
                                  <p className="min-w-0 flex-1 pt-0.5 text-[15px] font-semibold leading-snug text-slate-900">{formatParams(r.params)}</p>
                                  <button type="button" onClick={() => setOpenRows((o) => ({ ...o, [r.id]: !o[r.id] }))} aria-expanded={!!openRows[r.id]} aria-label={`${openRows[r.id] ? 'Done adjusting' : 'Adjust'} ${r.name}`} className="-mr-1 -mt-1 inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-teal-800 hover:bg-teal-50">{openRows[r.id] ? 'Done' : <><Icon d={I.sliders} className="h-4 w-4" />Adjust</>}</button>
                                </div>
                                <div className="flex min-h-8 flex-wrap items-center gap-x-2 gap-y-1">
                                  {r.edited ? (
                                    <>
                                      <Badge tone="amber">Edited</Badge>
                                      <span className="min-w-0 flex-1 text-xs text-slate-500">Changed for this row only</span>
                                      <button type="button" onClick={() => resetRow(r.id)} className="-mr-1 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-teal-800 hover:bg-teal-50"><Icon d={I.undo} className="h-4 w-4" />Reset to default</button>
                                    </>
                                  ) : <SourceNote source={r.source} />}
                                </div>
                                {r.edited && <p className="pb-1 text-xs text-slate-500">{SOURCE_TEXT[resolve(r.exerciseId, r.type).source]}: {formatParams(resolve(r.exerciseId, r.type).params)}</p>}
                              </div>
                              {openRows[r.id] && <div className="mt-3"><ParamEditor type={r.type} params={r.params} onChange={(p) => setRowParams(r.id, p)} /></div>}
                              <label className="mt-3 block"><span className="sr-only">Notes for {r.name}</span><input value={r.notes} onChange={(e) => updateRow(r.id, { notes: e.target.value })} placeholder="Notes for this exercise (optional)" className={input} /></label>
                            </>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                  {!drag && <p className="flex items-start gap-1.5 px-1 text-xs text-slate-500"><Icon d={I.info} className="mt-px h-3.5 w-3.5 shrink-0 text-teal-700" />Each row keeps the values it was added with. Changes to My exercises or My defaults apply to new rows only.</p>}
                  {!drag && <button type="button" onClick={() => setAddOpen(true)} className={`${btn} min-h-12 w-full border-2 border-dashed border-teal-300 bg-teal-50/50 text-teal-800 hover:bg-teal-50`}><Icon d={I.plus} sw={2.2} />Add exercise</button>}
                  {!drag && shareState !== 'closed' && <p className="flex items-start gap-1.5 px-1 text-xs text-slate-500"><Icon d={I.link} className="mt-px h-3.5 w-3.5 shrink-0 text-teal-700" />Changes save automatically. When you publish, your patient sees them on the same share link. No need to send a new one.</p>}
                  {!drag && <div className="border-t border-slate-200 pt-4"><button type="button" onClick={() => setDelOpen(true)} className={`${ghost} w-full text-red-700 hover:bg-red-50 lg:w-auto`}><Icon d={I.trash} className="h-4 w-4" />Delete program</button></div>}
                </div>
                <aside className="hidden lg:block">
                  {/* v10 (#14): sticky, floating publish card on tablet and desktop. (#15): the Ready to share card is gone. */}
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-900/10 ring-1 ring-slate-900/5 lg:sticky lg:top-20">
                    <div className="flex items-center justify-between gap-2"><h2 className="font-semibold">Publish</h2><span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-slate-500" aria-live="polite">{dirty ? <><span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-500" aria-hidden />Saving...</> : <><Icon d={I.check} className="h-3.5 w-3.5 text-teal-700" sw={2.4} />Saved</>}</span></div>
                    <p className="mt-1 text-sm text-slate-500">{neverPublished ? 'Not published yet. Publishing creates the share link to send.' : pending ? `${pubChanges.length || 1} ${pubChanges.length === 1 || !pubChanges.length ? 'change' : 'changes'} not live yet. Publishing updates what your patient sees on the share link.` : noLink ? 'There is no link yet. Publish to create one.' : `Everything is live. Published ${pub.at}.`}</p>
                    <button type="button" disabled={rows.length === 0} onClick={() => setPubOpen(true)} className={`${primary} mt-4 w-full py-3`}><Icon d={pubMode ? I.share : I.link} className="h-4 w-4" />{pubMode ? 'Publish' : 'Share link'}</button>
                    <p className="mt-3 text-xs text-slate-500">{neverPublished ? `No link yet. New link: ${expiryLine(expiry, customDate).replace('Link ', '').toLowerCase()}` : shareState === 'closed' ? 'Link closed' : expiryLine(expiry, customDate)} · <button type="button" onClick={() => setView('share')} className="font-semibold text-teal-800 underline-offset-2 hover:underline">Link settings</button></p>
                  </div>
                </aside>
              </div>
              <MobileActionBar>
                <button type="button" onClick={() => setAddOpen(true)} className={`${secondary} flex-1`}><Icon d={I.plus} sw={2.2} />Add</button>
                <button type="button" disabled={rows.length === 0} onClick={() => setPubOpen(true)} className={`${primary} flex-[2]`}><Icon d={pubMode ? I.share : I.link} />{pubMode ? 'Publish' : 'Share link'}</button>
              </MobileActionBar>
              <Sheet open={pubOpen} onClose={() => setPubOpen(false)} title={pubMode ? 'Publish to the live link?' : 'Share link'} labelId="pb-h"
                footer={pubMode ? <div className="flex flex-col-reverse gap-2 lg:flex-row lg:justify-end"><button type="button" onClick={() => { setPubOpen(false); if (neverPublished) setToast({ text: `Kept as a draft. Find it in Programs by name or code ${progCode}.` }); }} className={`${secondary} min-h-12 lg:min-h-11`}>Not yet</button><button type="button" onClick={publishProgram} disabled={!title.trim()} className={`${primary} min-h-12 lg:min-h-11`}><Icon d={I.share} className="h-4 w-4" />Publish now</button></div> : <button type="button" onClick={() => setPubOpen(false)} className={`${primary} w-full lg:w-auto`}>Done</button>}>
                <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-teal-700 ring-1 ring-slate-200"><Icon d={I.programs} /></div><div className="min-w-0"><div className="truncate font-semibold">{title || 'Untitled program'}</div><div className="truncate text-sm text-slate-500">{progCode} · {rows.length} exercises</div></div></div>
                {(neverPublished || !pub.title.trim()) && (
                  <div className="mt-3">
                    <label htmlFor="pb-name" className="text-sm font-semibold">Program name <span className="font-normal text-slate-500">(required)</span></label>
                    <input id="pb-name" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Knee rehab, week 1" aria-invalid={!title.trim()} aria-describedby="pb-name-help" className={cx(input, 'mt-1.5', !title.trim() && 'border-red-400 ring-1 ring-red-300')} />
                    {!title.trim()
                      ? <p id="pb-name-help" className="mt-1.5 flex items-start gap-1.5 text-sm font-medium text-red-700" role="alert"><Icon d={I.alert} className="mt-0.5 h-4 w-4 shrink-0" />Add a program name to publish. Use something you will recognise, not the patient's name.</p>
                      : <p id="pb-name-help" className="mt-1.5 text-xs text-slate-500">{origin?.direct ? `Filled in from the routine. Change it if you like. ` : ''}With the code {progCode}, it is how you find this program later. No patient names.</p>}
                  </div>
                )}
                {pubMode && (
                  <>
                    <h3 className="mt-4 text-sm font-semibold">{neverPublished ? 'First publish' : `Changes since ${pub.at}`}</h3>
                    <ul className="mt-1.5 space-y-1 text-sm text-slate-700">{(neverPublished ? [`${rows.length} exercises${origin ? `, made from ${origin.name}, version ${origin.v}` : ''}`] : pubChanges.length ? pubChanges : ['No changes']).map((c) => <li key={c} className="flex gap-2"><span className="text-teal-700" aria-hidden>•</span>{c}</li>)}</ul>
                  </>
                )}
                <h3 className="mt-5 text-sm font-semibold">Share link</h3>
                {noLink ? (
                  <p className="mt-1.5 rounded-xl border border-dashed border-slate-300 px-3 py-3 text-sm text-slate-600">{neverPublished ? 'No link yet. Publishing creates it, ready to copy and send.' : 'There is no open link. Publishing creates a new one you can copy and send.'}</p>
                ) : (
                  <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-1.5 pl-3">
                    <Icon d={I.link} className="h-4 w-4 shrink-0 text-teal-700" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{LINK.replace('https://', '')}</span>
                    <button type="button" onClick={() => setToast({ text: 'Link copied' })} className={`${secondary} min-h-10 shrink-0 px-3`}><Icon d={I.copy} className="h-4 w-4" />Copy</button>
                  </div>
                )}
                <p className="mt-1.5 text-xs text-slate-500">{pubMode ? (noLink ? 'Anyone with the new link sees this version.' : 'Same link as before. Your patient sees this version as soon as you publish.') : 'Your patient sees the published version on this link.'}</p>
                <div className="mt-4">
                  <div className="flex items-baseline justify-between gap-2"><h3 className="text-sm font-semibold">Link expires</h3><span className="text-xs text-slate-500">This program only</span></div>
                  <div className="mt-2"><ExpiryPicker value={expiry} onChange={setExpiry} defaultValue={defaultExpiry} label="Link expires" allowCustom /></div>
                  {expiry === 'custom' && (
                    <div className="mt-3 rounded-2xl border border-teal-300 bg-white p-3 ring-1 ring-teal-300">
                      <label htmlFor="pb-date" className="text-sm font-semibold">Link stops working on</label>
                      <input id="pb-date" type="date" min="2026-10-25" value={customDate} onChange={(e) => setCustomDate(e.target.value)} className={`${input} mt-1.5`} />
                      <p className="mt-2 text-xs text-slate-500">Any date from tomorrow. There is no latest date.</p>
                    </div>
                  )}
                  <p className="mt-2 text-xs text-slate-500">{noLink ? 'Applies to the new link.' : 'Expiry changes apply to the link right away.'} {expiryLine(expiry, customDate)}.</p>
                </div>
              </Sheet>
              <Sheet open={delOpen} onClose={() => setDelOpen(false)} title="Delete this program?" labelId="dp-h"
                footer={<div className="flex flex-col-reverse gap-2 lg:flex-row lg:justify-end"><button type="button" onClick={() => setDelOpen(false)} className={`${secondary} min-h-12 lg:min-h-11`}>Cancel</button><button type="button" onClick={() => { setDelOpen(false); setProgramDeleted(true); setShareState('closed'); setView('programs'); setToast({ text: `Deleted ${title || 'Untitled program'}. Its share link is closed. Restore it within 30 days.` }); }} className={`${btn} min-h-12 bg-red-600 text-white hover:bg-red-700 active:bg-red-800 lg:min-h-11`}><Icon d={I.trash} className="h-4 w-4" />Delete program</button></div>}>
                <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-slate-600 ring-1 ring-slate-200"><Icon d={I.programs} /></div><div className="min-w-0"><div className="truncate font-semibold">{title || 'Untitled program'}</div><div className="text-sm text-slate-500">{progCode} · {rows.length} exercises</div></div></div>
                <p className="mt-3 text-sm text-slate-700">It moves to <span className="font-semibold">Recently deleted</span>. You can restore it for 30 days, then it's gone for good.</p>
                <p className="mt-1 text-sm text-slate-700">{shareState === 'closed' ? 'Its share link is already closed.' : <>It also <span className="font-semibold">closes its share link</span>, so anyone who opens it sees "This link was closed".</>}</p>
                <p className="mt-3 text-xs text-slate-500">To stop sharing but keep the program, close the link on the Share screen instead.</p>
              </Sheet>
              <Sheet open={addOpen} onClose={() => setAddOpen(false)} title="Add exercise" subtitle="Your exercises first, then the full library" labelId="add-h"
                footer={<button type="button" onClick={() => setAddOpen(false)} className={`${primary} w-full`}>Done</button>}>
                <div className="sticky top-0 z-10 -mx-5 bg-white px-5 pb-2">
                  <Tabs label="Add from" value={addTab} onChange={setAddTab} tabs={[{ id: 'mine', label: 'My exercises', count: addMine.length }, { id: 'all', label: 'All exercises', count: addAll.length }]} />
                  <label htmlFor="addq" className="sr-only">Search exercises</label>
                  <div className="relative mt-2">
                    <Icon d={I.search} className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                    <input id="addq" type="search" value={addQuery} onChange={(e) => setAddQuery(e.target.value)} placeholder={addTab === 'mine' ? 'Search, my exercises first' : 'Search the full library'} className={`${input} pl-11`} />
                  </div>
                </div>
                {addTab === 'mine' ? (
                  <>
                    <AddList items={addMine} my={my} countIn={countIn} onAdd={addToProgram} />
                    {addMine.length === 0 && <p className="py-4 text-center text-sm text-slate-500">Nothing in My exercises matches.</p>}
                    {addMore.length > 0 && (
                      <>
                        <h3 className="mt-3 border-t border-slate-100 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">From the full library</h3>
                        <AddList items={addMore} my={my} countIn={countIn} onAdd={addToProgram} />
                      </>
                    )}
                    {!aq && <button type="button" onClick={() => setAddTab('all')} className={`${linkBtn} mt-2`}>Search all exercises<Icon d={I.right} className="h-4 w-4" sw={2.2} /></button>}
                  </>
                ) : (
                  <>
                    <AddList items={addAll} my={my} countIn={countIn} onAdd={addToProgram} />
                    {addAll.length === 0 && <p className="py-6 text-center text-sm text-slate-500">No approved exercise matches. Request it from the Library.</p>}
                  </>
                )}
              </Sheet>
            </section>
          )}

          {(view === 'routines' || view === 'routine') && pickForProgram && (
            <div className="mb-4 flex items-start gap-3 rounded-2xl border border-teal-200 bg-teal-50/70 p-4 text-sm" role="status">
              <Icon d={I.routine} className="mt-0.5 h-5 w-5 shrink-0 text-teal-700" />
              <div className="min-w-0 flex-1"><p className="font-semibold text-teal-950">New program from a routine</p><p className="text-teal-900">Pick a routine, then tap Create program from routine. You can tweak everything after.</p></div>
              <button type="button" onClick={() => { setPickForProgram(false); setView('programs'); }} className={`${linkBtn} -my-2`}>Cancel</button>
            </div>
          )}

          {view === 'routines' && (() => {
            const q = rQuery.trim().toLowerCase();
            const match = (r: Routine) => (!hasConds || rCond === 'All' || r.condition === rCond) && (rRegion === 'All' || r.region.includes(rRegion)) && (!q || [r.name, hasConds ? r.condition : '', r.region, ...r.rows.map((x) => LX(x.ex).name)].some((t) => t.toLowerCase().includes(q)));
            const sortR = (xs: Routine[]) => (rSort === 'az' ? [...xs].sort((a, b) => a.name.localeCompare(b.name)) : rSort === 'newest' ? [...xs].sort((a, b) => Date.parse(b.updated) - Date.parse(a.updated)) : [...xs].sort((a, b) => b.uses - a.uses));
            const mineAll = routines.filter((r) => myRoutines[r.id]);
            const live = routines.filter((r) => !r.draft);
            const pool = rTab === 'mine' ? mineAll : live;
            const drafts = sortR(pool.filter((r) => r.draft).filter(match));
            const list = sortR(pool.filter((r) => !r.draft).filter(match));
            const flagged = mineAll.filter((r) => !r.draft && myRoutines[r.id].seenV < r.version).length;
            const active = (hasConds && rCond !== 'All' ? 1 : 0) + (rRegion !== 'All' ? 1 : 0);
            const summary = [...(hasConds ? [rCond === 'All' ? 'All conditions' : rCond] : []), rRegion === 'All' ? 'All regions' : rRegion, SORTS.find((x) => x.id === rSort)!.label].join(' · ');
            const pillCls = (on: boolean) => cx('min-h-11 rounded-full border px-4 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600', on ? 'border-teal-700 bg-teal-700 text-white shadow-sm' : 'border-slate-300 bg-white text-slate-700 hover:border-teal-300');
            const card = (r: Routine) => <RoutineCard key={r.id} r={r} m={myRoutines[r.id]} mode={rTab} showCond={hasConds} poses={(rTab === 'mine' ? rowsOf(r, 'mine') : r.rows).map((x) => LX(x.ex).pose)} onOpen={() => openRoutine(r)} onSave={() => (myRoutines[r.id] ? openRoutine(r) : saveRoutine(r))} />;
            const total = drafts.length + list.length;
            return (
              <section aria-labelledby="rt-h">
                <div className="flex items-end justify-between gap-3">
                  <h1 id="rt-h" className="text-2xl font-semibold tracking-tight lg:text-3xl">Routines</h1>
                  <button type="button" onClick={() => startEdit('new')} className={`${secondary} shrink-0`}><Icon d={I.plus} sw={2.2} />New routine</button>
                </div>
                <div className="mt-3"><Tabs label="Routines" value={rTab} onChange={setRTab} tabs={[{ id: 'mine', label: 'My routines', count: mineAll.length }, { id: 'all', label: 'All routines', count: live.length }]} /></div>
                <p className="mt-3 min-h-[3.75rem] text-sm text-slate-500 sm:min-h-10 lg:min-h-0">{rTab === 'mine' ? 'Routines you saved or started. A saved routine stays as it was when you saved it. When the community version changes, it is flagged so you can update.' : `${live.length} ready-made programs for common conditions, shared by every practitioner. Anyone can add or improve one, and every change is kept in version history.`}</p>
                {rTab === 'mine' && flagged > 0 && (
                  <p className="mt-2 flex items-start gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="status"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden /><span><span className="font-semibold">{flagged === 1 ? '1 saved routine has' : `${flagged} saved routines have`} a newer community version.</span> Open it to see what changed and update in one tap.</span></p>
                )}
                <div className="sticky top-14 z-10 -mx-4 mt-2 bg-slate-50/95 px-4 py-2 backdrop-blur lg:static lg:mx-0 lg:mt-4 lg:rounded-t-2xl lg:border lg:border-b-0 lg:border-slate-200 lg:bg-white lg:px-5 lg:pb-0 lg:pt-5">
                  <label htmlFor="rq" className="sr-only">Search routines</label>
                  <div className="relative">
                    <Icon d={I.search} className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                    <input id="rq" type="search" enterKeyHint="search" value={rQuery} onChange={(e) => setRQuery(e.target.value)} placeholder={rTab === 'mine' ? 'Search my routines' : hasConds ? 'Try: arthritis, knee, low back' : 'Try: knee, low back, bridge'} className={`${input} min-h-12 pl-11 pr-20 text-base shadow-sm`} />
                    {rQuery && <button type="button" onClick={() => setRQuery('')} className="absolute right-0.5 top-1/2 min-h-11 -translate-y-1/2 rounded-lg px-3 text-sm font-medium text-slate-500 hover:bg-slate-100">Clear</button>}
                  </div>
                </div>
                <div className="mt-1 rounded-2xl border border-slate-200 bg-white lg:mt-0 lg:rounded-t-none lg:border-t-0">
                  <button type="button" onClick={() => setRFiltersOpen((o) => !o)} aria-expanded={rFiltersOpen} aria-controls="rfilters-panel" className="flex min-h-[56px] w-full items-center gap-3 rounded-2xl px-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 lg:px-5">
                    <Icon d={I.sliders} className="h-5 w-5 shrink-0 text-teal-700" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">Filters &amp; sort{active > 0 && <span className="rounded-full bg-teal-700 px-2 py-0.5 text-[11px] font-bold text-white" aria-label={`${active} active`}>{active}</span>}</span>
                      {!rFiltersOpen && <span className="block truncate text-xs text-slate-500">{summary}</span>}
                    </span>
                    <Icon d={I.chevron} className={cx('h-5 w-5 shrink-0 text-slate-400 transition', rFiltersOpen && 'rotate-180')} />
                  </button>
                  {rFiltersOpen && (
                    <div id="rfilters-panel" className="space-y-4 border-t border-slate-100 px-4 pb-4 pt-3 lg:px-5">
                      {hasConds && (
                        <div>
                          <div className="mb-1.5 flex flex-wrap items-center gap-2"><span id="rf-cond" className="text-xs font-semibold uppercase tracking-wide text-slate-500">Condition</span><span className="rounded-full border border-dashed border-slate-400 px-2 py-0.5 text-[11px] font-semibold text-slate-600">Sample list</span></div>
                          <div className="flex flex-wrap gap-2" role="group" aria-labelledby="rf-cond">{['All', ...conditions].map((c) => <button key={c} type="button" onClick={() => setRCond(c)} aria-pressed={rCond === c} className={pillCls(rCond === c)}>{c}</button>)}</div>
                          <p className="mt-1.5 text-xs text-slate-500">Sample conditions for this concept. The real fixed list is still to come.</p>
                        </div>
                      )}
                      <div>
                        <div id="rf-region" className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Body region</div>
                        <div className="flex flex-wrap gap-2" role="group" aria-labelledby="rf-region">{R_REGIONS.map((c) => <button key={c} type="button" onClick={() => setRRegion(c)} aria-pressed={rRegion === c} className={pillCls(rRegion === c)}>{c}</button>)}</div>
                      </div>
                      <div>
                        <div id="rf-sort" className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Sort</div>
                        <div role="radiogroup" aria-labelledby="rf-sort" className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 lg:inline-grid lg:min-w-[360px]">
                          {SORTS.map((o) => <button key={o.id} type="button" role="radio" aria-checked={rSort === o.id} onClick={() => setRSort(o.id)} className={cx('min-h-11 rounded-lg px-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600', rSort === o.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900')}>{o.label}</button>)}
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <button type="button" disabled={active === 0 && rSort === 'used'} onClick={() => { setRCond('All'); setRRegion('All'); setRSort('used'); }} className={`${linkBtn} -ml-2 disabled:text-slate-400`}>Reset</button>
                        <button type="button" onClick={() => setRFiltersOpen(false)} className={`${secondary} px-5`}>Done</button>
                      </div>
                    </div>
                  )}
                </div>
                <p className="mt-4 px-1 text-sm text-slate-500" aria-live="polite">{total} {total === 1 ? 'routine' : 'routines'}{q ? ` for "${rQuery.trim()}"` : ''}. Tap one to use it for a patient or start a program.</p>
                {total === 0 ? (
                  <div className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center">
                    <p className="font-semibold">{rTab === 'mine' && mineAll.length === 0 ? 'No routines saved yet' : 'No routine matches'}</p>
                    <p className="mt-1 text-sm text-slate-500">{rTab === 'mine' ? 'Save one from All routines, or make your own.' : 'Try a body region or an exercise name. Or add the routine yourself.'}</p>
                    <div className="mt-4 flex flex-wrap justify-center gap-2">{rTab === 'mine' && <button type="button" onClick={() => setRTab('all')} className={secondary}>Browse all routines</button>}<button type="button" onClick={() => startEdit('new')} className={primary}><Icon d={I.plus} sw={2.2} />New routine</button></div>
                  </div>
                ) : (
                  <>
                    {drafts.length > 0 && (
                      <>
                        <h2 className="mt-3 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Drafts, only you can see them</h2>
                        <ul className="mt-2 grid grid-cols-1 gap-3 lg:grid-cols-2">{drafts.map(card)}</ul>
                        {list.length > 0 && <h2 className="mt-5 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Saved</h2>}
                      </>
                    )}
                    <ul className="mt-2 grid grid-cols-1 gap-3 lg:grid-cols-2">{list.map(card)}</ul>
                  </>
                )}
              </section>
            );
          })()}

          {view === 'routine' && (() => {
            const r = routine; const m = myRoutines[r.id];
            const saved = !!m && !r.draft;
            const src: 'community' | 'mine' = saved && rSource === 'mine' ? 'mine' : 'community';
            const rr = rowsOf(r, src);
            const base = saved ? rowsOfVersion(r, rHistory, m.v) : r.rows;
            const sent = progs.filter((p) => p.from?.id === r.id);
            const hist = historyForRoutine(r, rHistory);
            const behind = saved && m.v < r.version;
            const flagged = behind && m.seenV < r.version;
            const newer = hist.filter((h) => saved && h.v > m.v);
            const myChanges = m?.changes?.length ?? 0;
            const fixDraft = () => { setREdit({ mode: 'new', id: r.id, name: r.name, condition: r.condition, region: r.region, about: r.about, rows: r.rows, note: '', tried: true }); setView('routineedit'); };
            const tryPublish = () => (draftOk(r) ? setRPubOpen(true) : fixDraft());
            if (r.draft) return (
              <section aria-labelledby="rd-h" className="lg:max-w-3xl">
                <BackLink onClick={() => setView('routines')}>Routines</BackLink>
                <div className="mt-1 flex flex-wrap gap-2"><Badge tone="amber"><Icon d={I.pencil} className="h-3 w-3" sw={2.2} />Draft, only you can see it</Badge><Badge tone="slate">{r.region}</Badge>{hasConds && r.condition && <Badge tone="teal">{r.condition}</Badge>}</div>
                <h1 id="rd-h" className="mt-2 text-2xl font-semibold tracking-tight lg:text-3xl">{r.name || 'Untitled routine'}</h1>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500"><Icon d={I.check} className="h-4 w-4 text-emerald-600" sw={2.4} />Saved automatically {r.updated === 'Oct 25, 2026' ? 'today' : r.updated}. Not published yet.</p>
                {r.about && <p className="mt-3 text-[15px] leading-relaxed text-slate-700">{r.about}</p>}
                <div className="mt-4 rounded-2xl border border-slate-200 bg-white">
                  <div className="flex items-baseline justify-between px-4 pt-4 lg:px-5"><h2 className="font-semibold">Exercises</h2><span className="text-sm text-slate-500">{rr.length} total</span></div>
                  {rr.length === 0 && <p className="px-4 pb-4 pt-2 text-sm text-slate-500 lg:px-5">No exercises yet.</p>}
                  <ol className="mt-1 divide-y divide-slate-100">{rr.map((x, i) => { const e = LX(x.ex); return (<li key={`${x.ex}-${i}`} className="flex items-start gap-3 px-4 py-3 lg:px-5"><span className="mt-1 w-4 shrink-0 text-sm font-semibold text-slate-400">{i + 1}</span><Thumb pose={e.pose} size="h-14 w-[72px]" /><div className="min-w-0 flex-1"><div className="font-semibold leading-snug">{e.name}</div><div className="mt-1"><TypeChip type={x.type} /></div><p className="mt-1 text-sm text-slate-700">{formatParams(x.params)}</p></div></li>); })}</ol>
                </div>
                <p className="mt-4 flex items-start gap-2 rounded-2xl bg-white px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-200"><Icon d={I.info} className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />Publish it to use it for patients and share it with every practitioner. There is no review step for routines.</p>
                <div className="mt-4 hidden gap-2 lg:flex"><button type="button" onClick={() => startEdit('new', r)} className={secondary}><Icon d={I.pencil} className="h-4 w-4" />Edit draft</button><button type="button" onClick={tryPublish} className={primary}><Icon d={I.share} className="h-4 w-4" />Publish</button></div>
                <button type="button" onClick={() => removeRoutine(r)} className={`${ghost} mt-3 w-full text-red-700 hover:bg-red-50 lg:w-auto`}><Icon d={I.trash} className="h-4 w-4" />Discard draft</button>
                <MobileActionBar>
                  <button type="button" onClick={() => startEdit('new', r)} className={`${secondary} flex-1`}>Edit draft</button>
                  <button type="button" onClick={tryPublish} className={`${primary} flex-[1.3]`}><Icon d={I.share} />Publish</button>
                </MobileActionBar>
              </section>
            );
            const more = (
              <>
                {!saved && <button type="button" onClick={() => saveRoutine(r)} className={cx(secondary, 'justify-start')}><Icon d={I.bookmarkPlus} className="h-4 w-4" />Save to My routines</button>}
                {saved && behind && !flagged && <button type="button" onClick={() => adoptRoutine(r)} className={cx(secondary, 'justify-start')}><Icon d={I.refresh} className="h-4 w-4" />Update my copy to version {r.version}</button>}
                <button type="button" onClick={() => startEdit('mine', r)} className={cx(secondary, 'justify-start')}><Icon d={I.pencil} className="h-4 w-4" />{saved ? 'Edit my copy' : 'Make my own copy'}</button>
                <button type="button" onClick={() => startEdit('community', r)} className={cx(secondary, 'justify-start')}><Icon d={I.users} className="h-4 w-4" />Edit for everyone</button>
                <button type="button" onClick={() => setView('routinehistory')} className={cx(secondary, 'justify-start')}><Icon d={I.history} className="h-4 w-4" />Version history</button>
                {saved && <button type="button" onClick={() => removeRoutine(r)} className={`${ghost} justify-start text-red-700 hover:bg-red-50`}><Icon d={I.trash} className="h-4 w-4" />Remove from My routines</button>}
              </>
            );
            return (
              <section aria-labelledby="rd-h">
                <BackLink onClick={() => setView('routines')}>Routines</BackLink>
                <div className="mt-1 grid gap-5 lg:grid-cols-[1fr_320px] lg:gap-6">
                  <div className="min-w-0 space-y-4">
                    <div>
                      <div className="flex flex-wrap gap-2">{hasConds && <Badge tone="teal">{r.condition}</Badge>}<Badge tone="slate">{r.region}</Badge>{saved && <Badge tone="green"><Icon d={I.check} className="h-3 w-3" sw={2.6} />In My routines</Badge>}{flagged && <Badge tone="amber"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />Community updated</Badge>}</div>
                      <h1 id="rd-h" className="mt-2 text-2xl font-semibold tracking-tight lg:text-3xl">{r.name}</h1>
                      <p className="mt-1 text-sm text-slate-500">Community routine · Version {r.version} · Updated {r.updated} by {r.addedBy === 'you' ? 'you' : 'a practitioner'} · Used {r.uses} times</p>
                      {r.about && <p className="mt-3 text-[15px] leading-relaxed text-slate-700">{r.about}</p>}
                    </div>
                    {flagged && (
                      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm" role="status">
                        <p className="flex items-start gap-2 text-amber-950"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden /><span><span className="font-semibold">Community updated to version {r.version} on {r.updated}.</span> Your copy stays on version {m.v} until you choose.</span></p>
                        <div className="mt-2 rounded-xl border border-amber-200 bg-white p-3">
                          <div className="text-xs font-semibold text-amber-900">What changed since your version</div>
                          <ul className="mt-1 space-y-1 text-slate-800">{newer.flatMap((h) => h.changes.map((c) => <li key={`${h.v}-${c}`} className="flex gap-2"><span className="shrink-0 text-xs font-semibold text-slate-500">v{h.v}</span>{c}</li>))}</ul>
                          {myChanges > 0 && <p className="mt-2 text-xs text-slate-600">Updating replaces your own {myChanges === 1 ? 'change' : `${myChanges} changes`} with version {r.version}. You can undo right after.</p>}
                          <div className="mt-3 flex gap-2">
                            <button type="button" onClick={() => adoptRoutine(r)} className={`${primary} flex-1`}>Use version {r.version}</button>
                            <button type="button" onClick={() => keepMine(r)} className={`${secondary} flex-1`}>Keep mine</button>
                          </div>
                        </div>
                      </div>
                    )}
                    {saved && (
                      <div>
                        <Segmented options={['mine', 'community'] as ('community' | 'mine')[]} value={src} onChange={setRSource} label="Version to use" labels={{ mine: `My copy, v${m.v}${myChanges ? ', edited' : ''}`, community: `Community, v${r.version}` }} />
                        <p className="mt-1.5 px-1 text-xs text-slate-500">{src === 'mine' ? `Your saved copy, frozen at version ${m.v}${myChanges ? ` with your ${myChanges === 1 ? 'change' : `${myChanges} changes`}` : ''}.` : `The live community version.`} Use for a patient and Create program use the one you pick here.</p>
                      </div>
                    )}
                    <div className="rounded-2xl border border-slate-200 bg-white">
                      <div className="flex items-baseline justify-between px-4 pt-4 lg:px-5"><h2 className="font-semibold">Exercises</h2><span className="text-sm text-slate-500">{rr.length} total</span></div>
                      <ol className="mt-1 divide-y divide-slate-100">
                        {rr.map((x, i) => {
                          const e = LX(x.ex);
                          const diff = src === 'mine' && JSON.stringify(x) !== JSON.stringify(base[i]);
                          return (
                            <li key={`${x.ex}-${i}`} className="flex items-start gap-3 px-4 py-3 lg:px-5">
                              <span className="mt-1 w-4 shrink-0 text-sm font-semibold text-slate-400">{i + 1}</span>
                              <Thumb pose={e.pose} size="h-14 w-[72px]" />
                              <div className="min-w-0 flex-1">
                                <div className="font-semibold leading-snug">{e.name}</div>
                                <div className="mt-1 flex flex-wrap items-center gap-2"><TypeChip type={x.type} />{diff && <span className="inline-flex items-center gap-1 text-xs font-semibold text-teal-800"><Icon d={I.pencil} className="h-3 w-3" sw={2.2} />Your change</span>}</div>
                                <p className="mt-1 text-sm text-slate-700">{formatParams(x.params)}</p>
                                {x.note && <p className="text-sm text-slate-500">"{x.note}"</p>}
                              </div>
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                    <p className="flex items-start gap-2 rounded-2xl bg-white px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-200"><Icon d={I.info} className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />Using a routine for a patient makes a separate program with its own name and code. Later edits to this routine never change programs already sent.</p>
                    {sent.length > 0 && (
                      <div className="rounded-2xl border border-slate-200 bg-white p-4 lg:p-5">
                        <h2 className="font-semibold">You sent this routine {sent.length === 1 ? 'once' : `${sent.length} times`}</h2>
                        <ul className="mt-2 space-y-1.5">{sent.slice(0, 3).map((p) => <li key={p.code} className="flex flex-wrap items-center gap-2 text-sm"><span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[13px] font-semibold text-slate-700">{p.code}</span><span className="font-medium">{p.t}</span><span className="text-slate-500">v{p.from!.v}</span></li>)}</ul>
                        <button type="button" onClick={() => { setProgQuery(r.name); setProgFilter('all'); setView('programs'); }} className={`${linkBtn} -ml-2 mt-1`}>See them in Programs<Icon d={I.right} className="h-4 w-4" sw={2.2} /></button>
                      </div>
                    )}
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:hidden">{more}</div>
                  </div>
                  <aside className="hidden lg:block">
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-900/10 ring-1 ring-slate-900/5 lg:sticky lg:top-20">
                      <h2 className="font-semibold">Use this routine</h2>
                      <button type="button" onClick={() => openUse(r, src)} className={`${primary} mt-3 w-full py-3`}><Icon d={I.share} className="h-4 w-4" />Use for a patient</button>
                      <p className="mt-1.5 text-xs text-slate-500">Makes a separate copy and opens Publish, with the link to send.</p>
                      <button type="button" onClick={() => createFromRoutine(r, src)} className={`${secondary} mt-3 w-full`}><Icon d={I.programs} className="h-4 w-4" />Create program from routine</button>
                      <p className="mt-1.5 text-xs text-slate-500">Opens the builder so you can tweak it first.</p>
                      <div className="mt-4 grid gap-2 border-t border-slate-100 pt-4">{more}</div>
                    </div>
                  </aside>
                </div>
                <MobileActionBar>
                  <button type="button" onClick={() => createFromRoutine(r, src)} className={`${secondary} flex-1 px-2`}>Create program</button>
                  <button type="button" onClick={() => openUse(r, src)} className={`${primary} flex-[1.3] px-2`}><Icon d={I.share} />Use for a patient</button>
                </MobileActionBar>
              </section>
            );
          })()}

          {view === 'routinehistory' && (() => {
            const r = routine; const vs = historyForRoutine(r, rHistory);
            return (
              <section aria-labelledby="rh-h" className="lg:max-w-3xl">
                <BackLink onClick={() => setView('routine')}>{r.name}</BackLink>
                <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-teal-800">{r.name}</p>
                <h1 id="rh-h" className="text-2xl font-semibold tracking-tight lg:text-3xl">Version history</h1>
                <p className="mt-1 text-sm text-slate-600">Every change to the community routine is kept. Restoring an older version saves it as a new version, so nothing is lost.</p>
                <ol className="relative mt-5 space-y-3 border-l-2 border-slate-200 pl-4">
                  {vs.map((v, i) => {
                    const n = progs.filter((p) => p.from?.id === r.id && p.from.v === v.v).length;
                    const mineHere = myRoutines[r.id] && myRoutines[r.id].v === v.v;
                    return (
                      <li key={`${v.v}-${i}`} className={cx('relative rounded-2xl border bg-white p-4', i === 0 ? 'border-teal-300 ring-1 ring-teal-300' : 'border-slate-200')}>
                        <span className={cx('absolute -left-[25px] top-5 h-3 w-3 rounded-full ring-4 ring-slate-50', i === 0 ? 'bg-teal-600' : 'bg-slate-300')} aria-hidden />
                        <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">Version {v.v}</h2>{i === 0 && <Badge tone="green">Live</Badge>}{mineHere && <Badge tone="teal">Your copy</Badge>}{v.from && <Badge tone="slate"><Icon d={I.undo} className="h-3 w-3" sw={2.2} />Restored from v{v.from}</Badge>}<span className="ml-auto text-xs text-slate-500">{v.date}</span></div>
                        <p className="mt-0.5 text-sm text-slate-600">{v.by === 'you' ? 'You' : 'A practitioner'} · {v.summary}</p>
                        <ul className="mt-2 space-y-1 text-sm text-slate-800">{v.changes.map((c) => <li key={c} className="flex gap-2"><span className="text-teal-700" aria-hidden>•</span>{c}</li>)}</ul>
                        {n > 0 && <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-slate-600"><Icon d={I.lock} className="h-3.5 w-3.5 text-slate-500" />You sent {n} {n === 1 ? 'program' : 'programs'} made from this version. {n === 1 ? 'It keeps' : 'They keep'} it.</p>}
                        {i > 0 && v.rows && <button type="button" onClick={() => setRRestore(v)} className={`${secondary} mt-3 w-full lg:w-auto`}><Icon d={I.undo} className="h-4 w-4" />Restore this version</button>}
                      </li>
                    );
                  })}
                </ol>
                <p className="mt-4 flex items-start gap-1.5 px-1 text-xs text-slate-500"><Icon d={I.info} className="mt-px h-3.5 w-3.5 shrink-0 text-teal-700" />Programs already sent never change. Saved copies in My routines get a flag to update.</p>
                <button type="button" onClick={() => startEdit('community', r)} className={`${primary} mt-4 w-full lg:w-auto`}><Icon d={I.pencil} className="h-4 w-4" />Edit for everyone</button>
                <Sheet open={!!rRestore} onClose={() => setRRestore(null)} title={rRestore ? `Restore version ${rRestore.v}?` : ''} labelId="rrs-h"
                  footer={<div className="flex flex-col-reverse gap-2 lg:flex-row lg:justify-end"><button type="button" onClick={() => setRRestore(null)} className={`${secondary} min-h-12 lg:min-h-11`}>Cancel</button><button type="button" onClick={() => { if (rRestore) restoreRoutine(r, rRestore); setRRestore(null); }} className={`${primary} min-h-12 lg:min-h-11`}><Icon d={I.undo} className="h-4 w-4" />Restore as version {r.version + 1}</button></div>}>
                  {rRestore && <>
                    <p className="text-sm text-slate-600">The exercises and doses from version {rRestore.v} become version {r.version + 1} for every practitioner. Version {r.version} stays in history.</p>
                    <p className="mt-2 text-xs text-slate-500">Programs already sent keep their version. Practitioners who saved this routine get a flag to update.</p>
                    <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm"><div className="font-semibold">Version {rRestore.v}, {rRestore.date}</div><div className="text-slate-600">{rRestore.by === 'you' ? 'You' : 'A practitioner'} · {rRestore.summary}</div>
                      <ul className="mt-2 space-y-1">{(rRestore.rows ?? []).map((x, i) => <li key={i} className="flex flex-wrap items-baseline gap-x-2 text-slate-800"><span className="font-medium">{LX(x.ex).name}</span><span className="text-xs text-slate-500">{formatParams(x.params)}</span></li>)}</ul>
                    </div>
                  </>}
                </Sheet>
              </section>
            );
          })()}

          {view === 'routineedit' && rEdit && (() => {
            const e = rEdit; const set = (patch: Partial<REdit>) => setREdit({ ...e, ...patch });
            const r = e.id ? routines.find((x) => x.id === e.id) : undefined;
            const isDraft = e.mode === 'new';
            const fresh = isDraft && !!r && !r.name && r.rows.length === 0 && !e.name && e.rows.length === 0;
            const start = r ? (e.mode === 'mine' ? rowsOf(r, 'mine') : r.rows) : [];
            const ch = e.mode === 'community' && r ? { name: e.name !== r.name, about: e.about !== r.about, region: e.region !== r.region, rows: JSON.stringify(e.rows) !== JSON.stringify(r.rows) } : { name: false, about: false, region: false, rows: false };
            const changed = e.mode === 'community' ? Object.values(ch).some(Boolean) : e.mode === 'mine' ? JSON.stringify(e.rows) !== JSON.stringify(start) : true;
            const heading = isDraft ? (fresh ? 'New routine' : 'Edit draft') : e.mode === 'community' ? r?.name ?? '' : 'Edit my copy';
            const errs = e.tried ? [!e.name.trim() && 'Add a routine name', e.rows.length === 0 && 'Add at least one exercise'].filter(Boolean) as string[] : [];
            const setRow = (i: number, patch: Partial<RRow>) => set({ rows: e.rows.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
            // An untouched new draft is dropped on leave, so empty drafts don't pile up in My routines.
            const dropFresh = () => { if (fresh && e.id) { setRoutines((rs) => rs.filter((x) => x.id !== e.id)); setMyRoutines((m) => { const n = { ...m }; delete n[e.id!]; return n; }); } };
            const cancel = () => { dropFresh(); setREdit(null); setView(r && !fresh ? 'routine' : 'routines'); };
            const Changed = ({ on }: { on: boolean }) => (on ? <Badge tone="amber">Changed</Badge> : null);
            const pill = (on: boolean) => cx('min-h-11 rounded-full border px-4 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600', on ? 'border-teal-700 bg-teal-700 text-white shadow-sm' : 'border-slate-300 bg-white text-slate-700 hover:border-teal-300');
            const saveLabel = e.mode === 'community' ? (changed ? `Save as version ${(r?.version ?? 0) + 1}` : 'No changes yet') : 'Save my copy';
            return (
              <section aria-labelledby="re-h" className="lg:max-w-3xl">
                <BackLink onClick={cancel}>{r && !fresh ? r.name || 'Routines' : 'Routines'}</BackLink>
                {e.mode === 'community' && <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-teal-800">Edit for everyone</p>}
                <div className={cx('flex flex-wrap items-center gap-2', e.mode !== 'community' && 'mt-1')}>
                  <h1 id="re-h" className="text-2xl font-semibold tracking-tight lg:text-3xl">{heading}</h1>
                  {isDraft && <Badge tone="amber">Draft</Badge>}
                  {e.mode === 'community' && r && <Badge tone="green">Version {r.version}, live</Badge>}
                </div>
                {isDraft && (
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500" aria-live="polite">{rSave === 'saving' ? <><span className="h-2 w-2 animate-pulse rounded-full bg-slate-400" aria-hidden />Saving…</> : <><Icon d={I.check} className="h-4 w-4 text-emerald-600" sw={2.4} />Draft saved. Only you can see it until you publish.</>}</p>
                )}
                {e.mode === 'community' && r && (
                  <div className="mt-3 flex items-start gap-2 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-950">
                    <Icon d={I.users} className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />
                    <p>This is the community routine. When you save, it becomes <span className="font-semibold">version {r.version + 1}</span> for every practitioner. Version {r.version} stays in <button type="button" onClick={() => setView('routinehistory')} className="font-semibold text-teal-800 underline underline-offset-2">history</button> and anyone can restore it.</p>
                  </div>
                )}
                {e.mode === 'community' && <p className="mt-2 flex items-start gap-1.5 px-1 text-xs text-slate-500"><Icon d={I.info} className="mt-px h-3.5 w-3.5 shrink-0 text-teal-700" />Programs already sent don't change. Saved copies in My routines get a flag to update.</p>}
                {e.mode === 'mine' && <p className="mt-1 text-sm text-slate-500">Only you see these changes. The community routine stays the same, and programs already sent do not change.</p>}
                {errs.length > 0 && <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert"><p className="font-semibold">{isDraft ? 'Before you publish' : 'Before you save'}</p><ul className="mt-1 list-disc pl-5">{errs.map((x) => <li key={x}>{x}</li>)}</ul>{isDraft && <p className="mt-1 text-xs text-red-700">Your draft is still saved.</p>}</div>}
                <div className="mt-4 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 lg:p-5">
                  <div>
                    <label htmlFor="re-name" className="flex min-h-6 items-center gap-2 text-sm font-medium">Routine name<Changed on={ch.name} /></label>
                    <input id="re-name" value={e.name} disabled={e.mode === 'mine'} onChange={(ev) => set({ name: ev.target.value })} placeholder="Knee osteoarthritis, starter" aria-invalid={e.tried && !e.name.trim()} className={cx(input, 'mt-1.5 disabled:bg-slate-50 disabled:text-slate-500', e.tried && !e.name.trim() && 'border-red-400')} />
                    {e.tried && !e.name.trim() && <p className="mt-1 text-sm font-medium text-red-700">Add a name to publish.</p>}
                  </div>
                  {e.mode !== 'mine' && hasConds && (
                    <div>
                      <div className="flex flex-wrap items-center gap-2"><span id="re-cond" className="text-sm font-medium">Condition</span><span className="rounded-full border border-dashed border-slate-400 px-2 py-0.5 text-[11px] font-semibold text-slate-600">Sample list</span></div>
                      <div className="mt-1.5 flex flex-wrap gap-2" role="radiogroup" aria-labelledby="re-cond">{conditions.map((c) => <button key={c} type="button" role="radio" aria-checked={e.condition === c} onClick={() => set({ condition: c })} className={pill(e.condition === c)}>{c}</button>)}</div>
                    </div>
                  )}
                  {e.mode !== 'mine' && (
                    <div>
                      <div id="re-reg" className="flex min-h-6 items-center gap-2 text-sm font-medium">Body region<Changed on={ch.region} /></div>
                      <div className="mt-1.5 flex flex-wrap gap-2" role="radiogroup" aria-labelledby="re-reg">{R_REGIONS.filter((c) => c !== 'All').map((c) => <button key={c} type="button" role="radio" aria-checked={e.region === c} onClick={() => set({ region: c })} className={pill(e.region === c)}>{c}</button>)}</div>
                    </div>
                  )}
                  {e.mode !== 'mine' && (
                    <div>
                      <label htmlFor="re-about" className="flex min-h-6 items-center gap-2 text-sm font-medium">Who it's for <span className="font-normal text-slate-500">(optional)</span><Changed on={ch.about} /></label>
                      <textarea id="re-about" rows={3} value={e.about} onChange={(ev) => set({ about: ev.target.value })} placeholder="Gentle strength for knee osteoarthritis, three days a week" className={`${input} mt-1.5 resize-none`} />
                      <p className="mt-1.5 flex items-start gap-1.5 text-xs text-slate-500"><Icon d={I.alert} className="mt-px h-3.5 w-3.5 shrink-0 text-teal-700" />Describe the condition, not a patient. No names or patient details.</p>
                    </div>
                  )}
                </div>
                <div className="mt-4 rounded-2xl border border-slate-200 bg-white">
                  <div className="flex items-baseline justify-between px-4 pt-4 lg:px-5"><h2 className="flex items-center gap-2 font-semibold">Exercises<Changed on={ch.rows} /></h2><span className="text-sm text-slate-500">{e.rows.length} total</span></div>
                  {e.rows.length === 0 && <p className={cx('px-4 pb-1 pt-2 text-sm lg:px-5', e.tried ? 'font-medium text-red-700' : 'text-slate-500')}>{e.tried ? 'Add at least one exercise to publish.' : 'No exercises yet. Add them from the exercise library.'}</p>}
                  <ol className="mt-1 divide-y divide-slate-100">
                    {e.rows.map((x, i) => {
                      const ex = LX(x.ex);
                      return (
                        <li key={`${x.ex}-${i}`} className="px-4 py-3 lg:px-5">
                          <div className="flex items-start gap-3">
                            <Thumb pose={ex.pose} size="h-12 w-16" />
                            <div className="min-w-0 flex-1"><div className="font-semibold leading-snug">{ex.name}</div><div className="mt-0.5 text-xs text-slate-500">{ex.region}</div></div>
                            <div className="flex shrink-0 items-center">
                              <button type="button" aria-label={`Move ${ex.name} up`} disabled={i === 0} onClick={() => set({ rows: moveItem(e.rows, i, i - 1) })} className={iconBtn}><Icon d={I.up} className="h-4 w-4" /></button>
                              <button type="button" aria-label={`Move ${ex.name} down`} disabled={i === e.rows.length - 1} onClick={() => set({ rows: moveItem(e.rows, i, i + 1) })} className={iconBtn}><Icon d={I.down} className="h-4 w-4" /></button>
                              <button type="button" aria-label={`Remove ${ex.name}`} onClick={() => set({ rows: e.rows.filter((_, j) => j !== i) })} className={iconBtn}><Icon d={I.trash} className="h-4 w-4" /></button>
                            </div>
                          </div>
                          <div className="mt-2">{ex.kind === 'stretch' ? <TypeChip type="stretching" /> : <Segmented options={STRENGTH_TYPES} value={x.type as StrengthType} onChange={(t) => setRow(i, { type: t, params: { ...GLOBAL_DEFAULTS[t] } })} label={`Type for ${ex.name}`} labels={TYPE_LABEL} />}</div>
                          <div className="mt-2 grid grid-cols-4 gap-2">
                            {CORE[x.type].map((k) => (
                              <label key={k} className="min-w-0 text-xs font-medium text-slate-500">{PARAM_META[k].short ?? (k === 'daysPerWeek' ? 'Days/wk' : k === 'perDay' ? 'Per day' : PARAM_META[k].label)}{PARAM_META[k].unit ? ' (s)' : ''}
                                <input value={x.params[k] ?? ''} inputMode={k === 'perDay' ? 'text' : 'numeric'} onChange={(ev) => setRow(i, { params: { ...x.params, [k]: ev.target.value } })} className={`${input} mt-1 px-2 text-center`} />
                              </label>
                            ))}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                  <div className="p-4 pt-2 lg:px-5"><button type="button" onClick={() => setRAddOpen(true)} className={`${btn} min-h-12 w-full border-2 border-dashed border-teal-300 bg-teal-50/50 text-teal-800 hover:bg-teal-50`}><Icon d={I.plus} sw={2.2} />Add exercise</button></div>
                </div>
                {e.mode === 'community' && (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 lg:p-5">
                    <label htmlFor="re-note" className="font-semibold">What did you change? <span className="font-normal text-slate-500">(optional)</span></label>
                    <input id="re-note" value={e.note} onChange={(ev) => set({ note: ev.target.value })} placeholder="For example: added calf stretch" className={`${input} mt-2`} />
                    <p className="mt-1 text-xs text-slate-500">Shown in version history so others know why it changed.</p>
                  </div>
                )}
                {e.mode === 'community' && r && myRoutines[r.id] && <button type="button" onClick={() => startEdit('mine', r)} className={`${linkBtn} -ml-1 mt-2`}>Only want it different for you? Edit my copy instead<Icon d={I.right} className="h-4 w-4" sw={2.2} /></button>}
                {isDraft ? (
                  <>
                    <div className="mt-5 hidden justify-end gap-2 lg:flex"><button type="button" onClick={fresh ? cancel : commitEdit} className={secondary}>{fresh ? 'Cancel' : 'Done for now'}</button><button type="button" onClick={askPublish} className={primary}><Icon d={I.share} className="h-4 w-4" />Publish</button></div>
                    <MobileActionBar>
                      <button type="button" onClick={fresh ? cancel : commitEdit} className={`${secondary} flex-1`}>{fresh ? 'Cancel' : 'Done for now'}</button>
                      <button type="button" onClick={askPublish} className={`${primary} flex-[1.3]`}><Icon d={I.share} />Publish</button>
                    </MobileActionBar>
                  </>
                ) : (
                  <>
                    <div className="mt-5 hidden justify-end gap-2 lg:flex"><button type="button" onClick={cancel} className={secondary}>Cancel</button><button type="button" onClick={commitEdit} disabled={!changed} className={primary}>{saveLabel}</button></div>
                    <MobileActionBar>
                      <button type="button" onClick={cancel} className={`${secondary} flex-1`}>Cancel</button>
                      <button type="button" onClick={commitEdit} disabled={!changed} className={`${primary} flex-[2]`}>{saveLabel}</button>
                    </MobileActionBar>
                  </>
                )}
              </section>
            );
          })()}

          {view === 'defaults' && <MyDefaultsView mine={myDefaults} setMine={setMyDefaults} onBack={() => setView('programs')} toast={(t) => setToast({ text: t })} defaultExpiry={defaultExpiry} setDefaultExpiry={setDefaultExpiry} />}

          {view === 'share' && (
            <Share title={title} rows={rows} poseFor={poseFor} state={shareState} setState={setShareState} sheetOpen={shareOpen} setSheetOpen={setShareOpen}
              expiry={expiry} setExpiry={(x) => { setExpiry(x); if (x !== 'custom') setToast({ text: x === 'never' ? 'Link set to never expire. It works until you close it.' : `Link now expires ${expiryDate(x)}` }); }} defaultExpiry={defaultExpiry} customDate={customDate} setCustomDate={setCustomDate}
              onOpenDefaults={() => setView('defaults')} onPreview={() => setView('linkpage')}
              onBack={() => setView('builder')} onCopy={() => setToast({ text: 'Link copied' })} onDownload={() => setToast({ text: `Downloading ${title || 'Untitled program'}.pdf` })} />
          )}

          {view === 'linkpage' && (
            <LinkPage title={title} rows={rows} poseFor={poseFor} expiry={expiry} customDate={customDate} onBack={() => { setViewRaw('share'); window.scrollTo({ top: 0 }); }} onPdf={() => setToast({ text: `Saving ${title || 'Untitled program'}.pdf from the link page` })} />
          )}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Main">
        <div className="mx-auto grid h-16 max-w-xl grid-cols-4">
          {nav.map((n) => {
            const on = n.match.includes(view);
            return (
              <button key={n.id} type="button" onClick={() => setView(n.id)} aria-current={on ? 'page' : undefined} className={cx('relative flex flex-col items-center justify-center gap-0.5 text-xs font-medium transition focus:outline-none focus-visible:bg-teal-50', on ? 'text-teal-800' : 'text-slate-500')}>
                <span className={cx('flex h-8 w-14 items-center justify-center rounded-full transition', on && 'bg-teal-50')}><Icon d={n.icon} className="h-[22px] w-[22px]" sw={on ? 2.1 : 1.8} /></span>
                {n.short}
                {!!n.count && <span className="absolute left-1/2 top-1.5 ml-2 rounded-full bg-amber-500 px-1.5 text-[11px] font-bold leading-[18px] text-white">{n.count}</span>}
              </button>
            );
          })}
        </div>
      </nav>

      {(() => { const r = routines.find((x) => x.id === routineId) ?? routine; return (
      <Sheet open={rPubOpen} onClose={() => setRPubOpen(false)} title="Publish this routine?" labelId="rp-h"
                footer={<div className="flex flex-col-reverse gap-2 lg:flex-row lg:justify-end"><button type="button" onClick={() => { setRPubOpen(false); setToast({ text: 'Kept as a draft. Only you can see it.' }); }} className={`${secondary} min-h-12 lg:min-h-11`}>Not yet</button><button type="button" onClick={publishDraft} className={`${primary} min-h-12 lg:min-h-11`}><Icon d={I.share} className="h-4 w-4" />Publish now</button></div>}>
                <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-teal-700 ring-1 ring-slate-200"><Icon d={I.routine} /></div><div className="min-w-0"><div className="truncate font-semibold">{r.name || 'Untitled routine'}</div><div className="truncate text-sm text-slate-500">{hasConds && r.condition ? `${r.condition} · ` : ''}{r.region} · {r.rows.length} exercises</div></div></div>
                <h3 className="mt-4 text-sm font-semibold">What happens</h3>
                <ul className="mt-1.5 space-y-1 text-sm text-slate-700">
                  {['It goes live as version 1 in All routines, for every practitioner.', 'Anyone can use it, improve it and restore older versions. Every change is kept in version history.', 'There is no review step. Routines reuse approved exercises, so nothing new needs checking.'].map((c) => <li key={c} className="flex gap-2"><span className="text-teal-700" aria-hidden>•</span>{c}</li>)}
                </ul>
                <p className="mt-3 text-xs text-slate-500">Not yet keeps it as a draft that only you can see.</p>
              </Sheet>
      ); })()}

      <Sheet open={newProgOpen} onClose={() => setNewProgOpen(false)} title="New program" subtitle="Start from a routine, or from scratch" labelId="np-h">
        <div className="space-y-3 pb-2">
          <button type="button" onClick={() => { setNewProgOpen(false); setPickForProgram(true); setRTab('all'); setView('routines'); }} className="flex w-full items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-teal-300 hover:bg-teal-50/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><Icon d={I.routine} /></span>
            <span className="min-w-0 flex-1"><span className="block font-semibold">From a routine</span><span className="mt-0.5 block text-sm text-slate-600">Pick a ready-made routine for a common condition, then tweak it for this patient.</span></span>
            <Icon d={I.right} className="mt-3 h-5 w-5 shrink-0 text-slate-400" />
          </button>
          <button type="button" onClick={() => { setNewProgOpen(false); const code = nextCode(); loadProg(code, { title: '', rows: [], pub: { rows: [], title: '', at: '' }, saved: { rows: [], title: '', at: 'just now' }, origin: null, shareState: 'active' }); setExpiry(defaultExpiry); setProgs((ps) => [{ code, t: 'Untitled program', n: 0, s: 'No link yet', open: true }, ...ps]); setView('builder'); }} className="flex w-full items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-teal-300 hover:bg-teal-50/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700"><Icon d={I.plus} sw={2.2} /></span>
            <span className="min-w-0 flex-1"><span className="block font-semibold">From scratch</span><span className="mt-0.5 block text-sm text-slate-600">An empty program for a patient who doesn't fit a routine. Add exercises one by one.</span></span>
            <Icon d={I.right} className="mt-3 h-5 w-5 shrink-0 text-slate-400" />
          </button>
        </div>
      </Sheet>

      <Sheet open={rAddOpen} onClose={() => setRAddOpen(false)} title="Add exercise to routine" subtitle="From the exercise library" labelId="radd-h" footer={<button type="button" onClick={() => setRAddOpen(false)} className={`${primary} w-full`}>Done</button>}>
        <AddList items={library} my={my} where="routine" countIn={(ex) => rEdit?.rows.filter((x) => x.ex === ex.id).length ?? 0} onAdd={(ex) => { if (!rEdit) return; const t: ExType = ex.kind === 'stretch' ? 'stretching' : 'concentric'; setREdit({ ...rEdit, rows: [...rEdit.rows, { ex: ex.id, type: t, params: { ...GLOBAL_DEFAULTS[t] } }] }); setToast({ text: `Added ${ex.name}` }); }} />
      </Sheet>

      <Sheet open={!!peek} onClose={() => setPeek(null)} title={peek ? myText(peek, my[peek.id], 'title') : ''} subtitle={peek ? `${CAT[peek.kind].label} · ${peek.region}` : ''} labelId="peek-h"
        headerExtra={peek && <button type="button" onClick={() => openDetails(peek)} className={`${linkBtn} -ml-2 mt-0.5`}>See more details<Icon d={I.right} className="h-4 w-4" sw={2.2} /></button>}
        footer={peek && (isSaved(peek) ? (
          <div className="flex gap-2">
            <div className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-teal-50 px-3 text-sm font-semibold text-teal-800 ring-1 ring-inset ring-teal-200" role="status"><Icon d={I.check} className="h-5 w-5" sw={2.2} />In my exercises</div>
            <button type="button" onClick={() => unsave(peek)} className={`${secondary} text-red-700`}>Remove</button>
          </div>
        ) : (
          <button type="button" onClick={() => save(peek)} className={`${primary} min-h-12 w-full`}><Icon d={I.bookmarkPlus} sw={2} />Add to my exercises</button>
        ))}>
        {peek && EXERCISE_IMAGES[peek.pose] && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <figure><PoseImage src={EXERCISE_IMAGES[peek.pose].start} alt={`${peek.name}, start position`} className="rounded-xl" /><figcaption className="mt-1 text-xs font-medium text-slate-600">Start</figcaption></figure>
              <figure><PoseImage src={EXERCISE_IMAGES[peek.pose].end} alt={`${peek.name}, end position`} className="rounded-xl" /><figcaption className="mt-1 text-xs font-medium text-slate-600">End</figcaption></figure>
            </div>
            <dl className="mt-3 divide-y divide-slate-100 text-sm">
              <div className="flex justify-between gap-3 py-2.5"><dt className="text-slate-500">Also called</dt><dd className="text-right">{peek.aliases.join(', ')}</dd></div>
              <div className="flex justify-between gap-3 py-2.5"><dt className="text-slate-500">Equipment</dt><dd className="text-right">{peek.equipment}</dd></div>
            </dl>
            <TypePreview kind={peek.kind} value={peekType} onChange={setPeekType} defaultFor={(t) => resolve(peek.id, t)} cue={myText(peek, my[peek.id], cueKey(peek.kind === 'stretch' ? 'stretching' : peekType))} />
            {isSaved(peek) && (
              <button type="button" onClick={() => openMyCopy(peek)} className="mt-3 flex min-h-12 w-full items-center gap-3 rounded-2xl border border-slate-200 px-3 text-left text-sm hover:bg-slate-50">
                <Icon d={I.pencil} className="h-5 w-5 text-teal-700" />
                <span className="flex-1"><span className="block font-semibold">Edit my copy</span><span className="block text-xs text-slate-500">{editCount(my[peek.id]) ? `${editCount(my[peek.id])} edits. ` : ''}Your text and defaults for this exercise</span></span>
                <Icon d={I.right} className="h-4 w-4 text-slate-400" />
              </button>
            )}
            <p className="mt-3 text-xs text-slate-500">To use it in a program, open a program and tap Add exercise.</p>
          </>
        )}
      </Sheet>

      <Sheet open={!!choose} onClose={() => setChoose(null)} title={choose ? `Add ${choose.name}` : ''} subtitle="Pick a version. You can switch it on the row later." labelId="choose-h"
        footer={choose && <button type="button" onClick={() => addToProgram(choose, chooseType)} className={`${primary} min-h-12 w-full`}>Add as {chooseType}</button>}>
        {choose && (
          <>
            <div className="mb-3 flex items-center gap-3 rounded-2xl bg-slate-50 p-2"><Thumb pose={choose.pose} size="h-14 w-[75px]" /><p className="text-sm text-slate-600">Same images and video for every version. Only the parameters and the cue change.</p></div>
            <fieldset>
              <legend className="sr-only">Version</legend>
              <div className="space-y-2">
                {STRENGTH_TYPES.map((t) => { const d = resolve(choose.id, t); return (
                  <label key={t} className={cx('flex min-h-[72px] cursor-pointer items-start gap-3 rounded-2xl border p-3 transition', chooseType === t ? 'border-teal-600 bg-teal-50/60 ring-1 ring-teal-600' : 'border-slate-200 hover:bg-slate-50')}>
                    <input type="radio" name="ver" value={t} checked={chooseType === t} onChange={() => setChooseType(t)} className="mt-0.5 h-5 w-5 accent-teal-700" />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2"><span className="font-semibold">{TYPE_LABEL[t]}</span>{t === 'concentric' && <span className="text-xs font-medium text-slate-500">Suggested</span>}</span>
                      <span className="block text-sm text-slate-700">{formatParams(d.params)}</span>
                      <span className="mt-0.5 block"><SourceNote source={d.source} /></span>
                    </span>
                  </label>
                ); })}
              </div>
            </fieldset>
          </>
        )}
      </Sheet>

      {toast && (
        <div role="status" className="fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[60] mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-lg animate-in fade-in slide-in-from-bottom-2 lg:bottom-6">
          <Icon d={I.check} className="h-5 w-5 shrink-0 text-teal-300" sw={2.2} />
          <span className="flex-1 py-1.5">{toast.text}</span>
          {toast.undo && <button type="button" onClick={() => { toast.undo?.(); setToast(null); }} className="min-h-11 rounded-lg px-3 font-semibold text-teal-300 hover:bg-white/10">Undo</button>}
        </div>
      )}
    </div>
  );
};

/* ---------- Add exercise list (builder) ---------- */

// ---------- v11: Routines (DIDI-852) ----------
const TypeChip = ({ type }: { type: ExType }) => (
  <span className={cx('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset', type === 'stretching' ? 'bg-sky-50 text-sky-800 ring-sky-200' : 'bg-violet-50 text-violet-800 ring-violet-200')}>{TYPE_LABEL[type]}</span>
);
const RoutineCard = ({ r, m, mode, poses, showCond, onOpen, onSave }: { r: Routine; m?: MyRoutine; mode: 'mine' | 'all'; poses: string[]; showCond: boolean; onOpen: () => void; onSave: () => void }) => {
  const flagged = !!m && !r.draft && m.seenV < r.version;
  return (
  <li className="relative min-w-0">
    <button type="button" onClick={onOpen} className={cx('flex min-h-[112px] w-full items-start gap-3 rounded-2xl border bg-white p-3 text-left transition hover:border-teal-200 hover:shadow-sm active:brightness-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600', r.draft ? 'border-dashed border-slate-300' : flagged ? 'border-amber-300' : 'border-slate-200')}>
      <div className="grid h-[84px] w-24 shrink-0 grid-cols-2 grid-rows-2 gap-0.5 overflow-hidden rounded-xl bg-slate-50 ring-1 ring-slate-200" aria-hidden>
        {poses.slice(0, 4).map((p, i) => <Thumb key={i} pose={p} size="h-full w-full rounded-none ring-0" />)}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className={cx('pr-10 font-semibold leading-snug', !r.name && 'text-slate-500')}>{r.name || 'Untitled routine'}</h3>
        <p className="mt-0.5 truncate pr-10 text-sm text-slate-600">{showCond && r.condition ? `${r.condition} · ` : ''}{r.region}</p>
        <p className="mt-0.5 text-xs text-slate-500">{r.rows.length} exercises{r.draft ? '' : mode === 'mine' && m ? ` · Your copy, v${m.v}` : ` · Version ${r.version}`}</p>
        <div className="mt-1.5 flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
          {r.draft ? (
            <><span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-900">Draft</span><span>Saved automatically. Not published.</span></>
          ) : (
            <>
              {flagged && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-900"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />Community updated to v{r.version}</span>}
              {mode === 'mine' && m ? (
                <>
                  {m.changes && m.changes.length > 0 && <span className="inline-flex items-center gap-1 font-medium text-teal-800"><Icon d={I.pencil} className="h-3 w-3" sw={2.2} />Edited</span>}
                  <span>{m.usedAt ? `Used ${m.usedAt}` : `Saved ${m.savedAt}`}</span>
                </>
              ) : (
                <>
                  <span>Used {r.uses} times</span>
                  {r.addedBy === 'you' && <span className="font-medium text-teal-800">Added by you</span>}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </button>
    {!r.draft && (
      <button type="button" onClick={onSave} aria-label={m ? `${r.name} is in My routines` : `Save ${r.name} to My routines`} aria-pressed={!!m} className={cx('absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600', m ? 'border-teal-200 bg-teal-50 text-teal-700' : 'border-slate-200 bg-white text-slate-500 hover:text-teal-700')}>
        <Icon d={m ? I.check : I.bookmarkPlus} className="h-5 w-5" sw={m ? 2.4 : 1.9} />
      </button>
    )}
  </li>
  );
};

const AddList = ({ items, my, countIn, onAdd, where = 'program' }: { items: Exercise[]; my: MyExercises; countIn: (e: Exercise) => number; onAdd: (e: Exercise) => void; where?: string }) => (
  <ul className="divide-y divide-slate-100">
    {items.map((e) => {
      const n = countIn(e);
      const m = my[e.id];
      return (
        <li key={e.id}>
          <button type="button" onClick={() => onAdd(e)} className="flex min-h-[64px] w-full items-center gap-3 py-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
            <Thumb pose={e.pose} size="h-12 w-16" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5"><span className="truncate font-medium">{myText(e, m, 'title')}</span>{m?.pinned && <Icon d={I.pin} className="h-3.5 w-3.5 shrink-0 text-teal-700" fill />}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2"><CatLine kind={e.kind} />{n > 0 && <span className="text-xs font-medium text-slate-600">In {where} {n === 1 ? 'once' : `${n} times`}</span>}</div>
            </div>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 text-teal-800" aria-hidden><Icon d={I.plus} sw={2.2} /></span>
            <span className="sr-only">Add {e.name}{e.kind === 'strength' ? ', then pick a version' : ''}</span>
          </button>
        </li>
      );
    })}
  </ul>
);

/* ---------- Full exercise details ---------- */

const SUGGESTED_KEYS: ParamKey[] = ['reps', 'sets', 'hold', 'up', 'down', 'rest', 'perDay', 'daysPerWeek'];
const DetailsView = ({ ex, mine, history, resolve, onBack, onSave, onEdit, onEditLibrary, onHistory, dupOf, initialRegen, regenLeft, onRegenerate, onReportDup, onMergeReported, onDismissDup }: { ex: Exercise; regenLeft: number; mine?: MyExercise; history: LibVersion[]; resolve: (t: ExType) => Resolved; onBack: () => void; onSave: () => void; onEdit: () => void; onEditLibrary: () => void; onHistory: () => void; dupOf?: Exercise; initialRegen?: boolean; onRegenerate: (what: string, note: string) => void; onReportDup: () => void; onMergeReported: () => void; onDismissDup: () => void }) => {
  const last = history[0];
  const [regen, setRegen] = useState(!!initialRegen);
  const [regenPick, setRegenPick] = useState<'images' | 'video' | 'both'>('images');
  const [regenNote, setRegenNote] = useState('');
  const [genBusy, setGenBusy] = useState(false);
  const REGEN = { images: 'images', video: 'video', both: 'images and video' } as const;
  const runRegen = () => { setRegen(false); setGenBusy(true); window.setTimeout(() => { setGenBusy(false); onRegenerate(REGEN[regenPick], regenNote.trim()); }, 1600); };
  const imgs = EXERCISE_IMAGES[ex.pose];
  const types = typesOf(ex);
  return (
    <section aria-labelledby="det-h">
      <BackLink onClick={onBack}>Library</BackLink>
      {dupOf && (
        <div className="mb-3 mt-1 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="flex items-start gap-2"><Icon d={I.flag} className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /><span><span className="font-semibold">Possible duplicate of {dupOf.name}.</span> A practitioner reported it. Any practitioner can merge them (permanent) or mark it as not a duplicate.</span></p>
          <div className="mt-2 grid grid-cols-2 gap-2"><button type="button" onClick={onMergeReported} className={`${primary} px-3`}><Icon d={I.merge} className="h-4 w-4" />Merge them</button><button type="button" onClick={onDismissDup} className={`${secondary} px-3`}>Not a duplicate</button></div>
        </div>
      )}
      <div className={cx('relative mt-1 rounded-2xl border p-4 lg:p-6', CAT[ex.kind].card)}>
        <span className="absolute right-3 top-3"><CatIcon kind={ex.kind} className="h-8 w-8" /></span>
        <CatLine kind={ex.kind} />
        <h1 id="det-h" className="mt-1 pr-10 text-2xl font-semibold tracking-tight lg:text-3xl">{ex.name}</h1>
        <div className="mt-2 flex flex-wrap gap-1.5">{ex.region.split(',').map((r) => <span key={r} className="rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold text-slate-700 ring-1 ring-inset ring-slate-200">{r.trim().replace(/^./, (c) => c.toUpperCase())}</span>)}</div>
        <div className="mt-3 flex flex-wrap items-center gap-2"><Badge tone="green"><Icon d={I.check} className="h-3.5 w-3.5" sw={2.4} />Version {ex.version}, live</Badge><span className="text-xs text-slate-600">Last edited by {HISTORY_BY_LABEL[last.by].toLowerCase().replace(/^didi/, 'Didi')}, {last.date}</span></div>
        <p className="mt-3 text-[15px] leading-relaxed text-slate-800 lg:text-sm">{ex.description}</p>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><Icon d={I.users} /></span>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">Shared library entry</h2>
            <p className="mt-0.5 text-sm text-slate-600">Any practitioner can improve it. Each save becomes the next version for everyone, and older versions can be restored.</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={onEditLibrary} className={primary}><Icon d={I.pencil} className="h-4 w-4" />Edit for everyone</button>
          <button type="button" onClick={onHistory} className={secondary}><Icon d={I.history} className="h-4 w-4" />History ({history.length})</button>
        </div>
        <button type="button" onClick={onReportDup} className={`${linkBtn} -ml-2 mt-2 text-slate-700`}><Icon d={I.flag} className="h-4 w-4" />Report duplicate or merge</button>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr] lg:gap-6">
        <div className="space-y-4">
          {imgs && (
            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between gap-2 px-1 pb-2"><div className="min-w-0"><h2 className="font-semibold">Images and video</h2><p className={cx('text-xs font-semibold tabular-nums', regenLeft > 0 ? 'text-slate-500' : 'text-red-700')}>{regenLeftText(regenLeft)}</p></div><div className="-mr-1 flex items-center"><button type="button" onClick={() => setRegen(true)} disabled={genBusy || regenLeft <= 0} className={`${linkBtn} disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent`}>{genBusy ? <Spinner /> : <Icon d={I.refresh} className="h-4 w-4" sw={2} />}{genBusy ? 'Generating' : 'Regenerate'}</button></div></div>
              {regenLeft <= 0 && !genBusy && <p className="mb-2 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900" role="status"><Icon d={I.alert} className="mt-0.5 h-4 w-4 shrink-0 text-red-700" sw={2.2} /><span><span className="font-semibold">Daily limit reached.</span> You've used all {REGEN_CAP} regenerations for today. You can regenerate again tomorrow. Text edits still work.</span></p>}
              <div className="relative grid grid-cols-2 gap-2">
                <figure><PoseImage src={imgs.start} alt={`${ex.name}, start position`} className="rounded-xl" /><figcaption className="mt-1 text-xs font-medium text-slate-600">Start position</figcaption></figure>
                <figure><PoseImage src={imgs.end} alt={`${ex.name}, end position`} className="rounded-xl" /><figcaption className="mt-1 text-xs font-medium text-slate-600">End position</figcaption></figure>
                {genBusy && <div className="mp-shimmer z-10 rounded-xl" />}
              </div>
              <figure className="mt-3"><LoopVideo images={imgs} name={ex.name} className="rounded-xl" buttonClass="bg-white text-teal-800 hover:bg-teal-50 focus-visible:ring-teal-600" /><figcaption className="mt-1 text-xs font-medium text-slate-600">Video, 6s loop{ex.kind === 'strength' ? '. Shared by all 3 versions.' : ''}</figcaption></figure>
              <p className="mt-2 px-1 text-xs text-slate-500">Media for version {ex.version}{last.media ? `, regenerated ${last.date}` : ''}. Regenerating goes live for everyone as a new version. Earlier images and video can be restored from history.</p>
            </div>
          )}
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="font-semibold">How to do it</h2>
            <ol className="mt-2 space-y-2 text-[15px] leading-relaxed text-slate-800 lg:text-sm">
              {stepsFor(ex).map((s, i) => <li key={i} className="flex gap-2.5"><span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-50 text-[11px] font-bold text-teal-800">{i + 1}</span><span>{s}</span></li>)}
            </ol>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <h2 className="px-1 font-semibold">{ex.kind === 'strength' ? 'Versions' : 'Version'}</h2>
            <p className="px-1 text-xs text-slate-500">{ex.kind === 'strength' ? 'Every strengthening exercise has all 3. You pick one on each program row.' : 'Stretch exercises have one version, Stretching.'}</p>
            <ul className="mt-2 space-y-3">
              {types.map((t) => {
                const lib = { ...GLOBAL_DEFAULTS[t], ...SUGGESTED_EXTRAS[t] };
                const yours = resolve(t);
                return (
                  <li key={t} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-baseline justify-between gap-2"><h3 className="font-semibold">{TYPE_LABEL[t]}</h3><span className="text-xs text-slate-500">{TYPE_HINT[t]}</span></div>
                    <p className="mt-1 text-sm text-slate-700"><span className="font-medium">Cue:</span> {libText(ex, cueKey(t))}</p>
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                      {SUGGESTED_KEYS.filter((k) => lib[k] !== undefined).map((k) => (
                        <div key={k} className="flex justify-between gap-2 border-b border-slate-100 pb-1.5"><dt className="text-slate-500">{k === 'up' ? 'Tempo up' : k === 'down' ? 'Tempo down' : k === 'daysPerWeek' ? 'Per week' : k === 'perDay' ? 'Per day' : PARAM_META[k].short ?? PARAM_META[k].label}</dt><dd className="whitespace-nowrap font-semibold tabular-nums">{k === 'daysPerWeek' ? `${lib[k]} days` : valueText(k, lib[k] as string)}</dd></div>
                      ))}
                    </dl>
                    <p className="mt-2 text-xs text-slate-500">Library defaults, including suggested tempo and rest.</p>
                    {yours.source !== 'global' && <div className="mt-2 rounded-xl bg-teal-50/70 px-3 py-2 text-sm"><SourceNote source={yours.source} /><div className="mt-0.5 font-semibold text-teal-950">{formatParams(yours.params)}</div></div>}
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="font-semibold">About this exercise</h2>
            <dl className="mt-1 divide-y divide-slate-100 text-sm">
              <div className="flex justify-between gap-3 py-2.5"><dt className="text-slate-500">Also called</dt><dd className="text-right">{ex.aliases.join(', ')}</dd></div>
              <div className="flex justify-between gap-3 py-2.5"><dt className="text-slate-500">Equipment</dt><dd className="text-right">{ex.equipment}</dd></div>
              <div className="flex justify-between gap-3 py-2.5"><dt className="text-slate-500">Body regions</dt><dd className="text-right">{ex.region}</dd></div>
              <div className="flex justify-between gap-3 py-2.5"><dt className="text-slate-500">Added by</dt><dd className="text-right">{ADDED_BY_LABEL[ex.addedBy]}</dd></div>
              <div className="flex justify-between gap-3 py-2.5"><dt className="text-slate-500">Version</dt><dd className="text-right">{ex.version}, live</dd></div>
              <div className="flex justify-between gap-3 py-2.5"><dt className="text-slate-500">Last edited</dt><dd className="text-right">{HISTORY_BY_LABEL[last.by]}, {last.date}</dd></div>
              <div className="flex justify-between gap-3 py-2.5"><dt className="text-slate-500">Visible to</dt><dd className="text-right">All practitioners</dd></div>
              <div className="flex justify-between gap-3 py-2.5"><dt className="text-slate-500">Who can edit</dt><dd className="text-right">Any practitioner</dd></div>
            </dl>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
            <h2 className="flex items-center gap-2 font-semibold text-amber-950"><Icon d={I.alert} className="h-4 w-4 text-amber-700" sw={2} />Precautions</h2>
            <ul className="mt-2 space-y-1.5 text-sm text-slate-800">{[...(ex.precautions ?? []), ...GENERAL_PRECAUTIONS].map((p) => <li key={p} className="flex gap-2"><span className="text-amber-700" aria-hidden>•</span>{p}</li>)}</ul>
            <p className="mt-2 text-xs text-slate-600">General guidance for this exercise. Not specific to any patient.</p>
          </div>

          <div className="rounded-2xl border border-teal-200 bg-white p-4">
            <h2 className="font-semibold">My copy</h2>
            <p className="text-xs text-slate-500">Private changes only you see. To fix it for everyone, use Edit for everyone.</p>
            {mine ? (
              <>
                <p className="mt-1 text-sm text-slate-600">{mine.pinned ? 'Pinned. ' : ''}Saved {mine.savedAt}{mine.lastUsed ? `, last used ${mine.lastUsed}` : ''}. {editCount(mine) ? `${editCount(mine)} of your edits sit on top of the library.` : 'No edits yet.'}</p>
                <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2.5"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">My notes</div><p className="mt-0.5 text-sm text-slate-800">{mine.notes || 'No notes yet.'}</p></div>
                <button type="button" onClick={onEdit} className={`${secondary} mt-3 w-full`}><Icon d={I.pencil} className="h-4 w-4" />Edit my copy</button>
              </>
            ) : (
              <>
                <p className="mt-1 text-sm text-slate-600">Save it to edit the text and set your own defaults for this exercise.</p>
                <button type="button" onClick={onSave} className={`${primary} mt-3 w-full`}><Icon d={I.bookmarkPlus} sw={2} />Add to my exercises</button>
              </>
            )}
          </div>
        </div>
      </div>
      <Sheet open={regen} onClose={() => setRegen(false)} title="Regenerate media" subtitle={`Goes live for every practitioner as version ${ex.version + 1}. ${regenLeftText(regenLeft)}.`} labelId="dr-h"
        footer={<button type="button" onClick={runRegen} disabled={regenLeft <= 0} className={`${primary} min-h-12 w-full`}><Icon d={I.refresh} className="h-4 w-4" sw={2} />Regenerate and publish</button>}>
        <fieldset>
          <legend className="sr-only">What to regenerate</legend>
          <div className="space-y-2">
            {([['images', 'Images', 'Start and end images'], ['video', 'Video', 'The 6s loop'], ['both', 'Images and video', 'Everything visual. Text stays']] as const).map(([id, l, h]) => (
              <label key={id} className={cx('flex min-h-[60px] cursor-pointer items-center gap-3 rounded-2xl border p-3 transition', regenPick === id ? 'border-teal-600 bg-teal-50/60 ring-1 ring-teal-600' : 'border-slate-200 hover:bg-slate-50')}>
                <input type="radio" name="dregen" checked={regenPick === id} onChange={() => setRegenPick(id)} className="h-5 w-5 accent-teal-700" />
                <span className="flex-1"><span className="block font-semibold">{l}</span><span className="block text-sm text-slate-500">{h}</span></span>
              </label>
            ))}
          </div>
        </fieldset>
        <label htmlFor="dr-note" className="mt-4 block text-sm font-medium">Note for the AI <span className="font-normal text-slate-500">(optional)</span></label>
        <input id="dr-note" value={regenNote} onChange={(e) => setRegenNote(e.target.value)} placeholder="For example: deeper squat, chair behind" className={`${input} mt-1.5`} />
        <p className="mt-3 flex items-start gap-1.5 text-xs text-slate-500"><Icon d={I.info} className="mt-px h-3.5 w-3.5 shrink-0 text-teal-700" />It goes live right away, no approval step. Version {ex.version} stays in history and anyone can restore it. Programs that use it get a prompt to update or keep their original. Each practitioner can regenerate {REGEN_CAP} times a day.</p>
      </Sheet>
    </section>
  );
};

/* ---------- Edit my copy (override layer) ---------- */

const OverrideField = ({ id, label, lib, ov, multiline, onSave, onReset, onKeepMine }: { id: string; label: string; lib: string; ov?: { value: string; base: string }; multiline?: boolean; onSave: (v: string) => void; onReset: () => void; onKeepMine: () => void }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const value = ov?.value ?? lib;
  const libUpdated = !!ov && ov.base !== lib;
  return (
    <div id={id} className={cx('border-b border-slate-100 py-3 last:border-0', libUpdated && '-mx-4 border-l-4 border-l-amber-400 bg-amber-50/50 px-3')}>
      <div className="flex min-h-6 flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
        {ov && <Badge tone="teal"><Icon d={I.pencil} className="h-3 w-3" sw={2.2} />Edited</Badge>}
        {libUpdated && <Badge tone="amber"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />Library updated</Badge>}
        {ov && !editing && <button type="button" onClick={onReset} className="-my-2 ml-auto inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-teal-800 hover:bg-teal-50" aria-label={`Reset ${label} to the library version`}><Icon d={I.undo} className="h-4 w-4" />Reset</button>}
      </div>
      {editing ? (
        <>
          {multiline ? <textarea aria-label={label} rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} className={`${input} mt-1.5 resize-y`} autoFocus /> : <input aria-label={label} value={draft} onChange={(e) => setDraft(e.target.value)} className={`${input} mt-1.5`} autoFocus />}
          <p className="mt-1 text-xs text-slate-500">Library: {lib}</p>
          <SaveCancel onSave={() => { const v = draft.trim(); if (!v || v === lib) onReset(); else onSave(v); setEditing(false); }} onCancel={() => setEditing(false)} />
        </>
      ) : (
        <button type="button" onClick={() => { setDraft(value); setEditing(true); }} aria-label={`Edit ${label}`} className="group -mx-2 mt-0.5 flex min-h-11 w-[calc(100%+1rem)] items-start gap-2 rounded-lg px-2 py-2 text-left text-[15px] leading-relaxed text-slate-800 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 lg:text-sm">
          <span className="min-w-0 flex-1 break-words">{value}</span>
          <Icon d={I.pencil} className="mt-1 h-4 w-4 shrink-0 text-slate-400 group-hover:text-teal-700" />
        </button>
      )}
      {libUpdated && !editing && (
        <div className="mt-1 rounded-xl border border-amber-200 bg-white p-3">
          <div className="text-xs font-semibold text-amber-900">The library changed this after you edited it</div>
          <p className="mt-1 text-sm text-slate-800"><span className="font-medium text-slate-600">Library now: </span>{lib}</p>
          <p className="mt-0.5 text-xs text-slate-500">When you edited it, the library said: {ov!.base}</p>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={onReset} className={`${primary} flex-1`}>Use library version</button>
            <button type="button" onClick={onKeepMine} className={`${secondary} flex-1`}>Keep mine</button>
          </div>
        </div>
      )}
    </div>
  );
};

const TypeDefaults = ({ t, own, fallback, onSave, onReset }: { t: ExType; own?: Params; fallback: Resolved; onSave: (p: Params) => void; onReset: () => void }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Params>({});
  const cur = own ?? fallback.params;
  return (
    <li className={cx('rounded-2xl border bg-white p-4', editing ? 'border-teal-500 ring-1 ring-teal-500' : 'border-slate-200')}>
      <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{TYPE_LABEL[t]}</h3>{own && <Badge tone="teal"><Icon d={I.pencil} className="h-3 w-3" sw={2.2} />Edited</Badge>}</div>
      {!editing ? (
        <>
          <div className={cx('mt-2 rounded-xl px-3 py-2.5', own ? 'bg-teal-50/70' : 'bg-slate-50')}>
            <div className="text-[15px] font-semibold">{formatParams(cur)}</div>
            <div className="mt-0.5">{own ? <span className="text-xs text-slate-600">Instead of {fallback.source === 'mine' ? 'my defaults' : 'global'}: {formatParams(fallback.params)}</span> : <SourceNote source={fallback.source} />}</div>
          </div>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => { setDraft({ ...cur }); setEditing(true); }} className={`${secondary} flex-1`}><Icon d={I.pencil} className="h-4 w-4" />{own ? 'Edit' : 'Set for this exercise'}</button>
            {own && <button type="button" onClick={onReset} className={`${ghost} flex-1 text-teal-800`}><Icon d={I.undo} className="h-4 w-4" />Reset to {fallback.source === 'mine' ? 'my defaults' : 'global'}</button>}
          </div>
        </>
      ) : (
        <div className="mt-3">
          <ParamEditor type={t} params={draft} onChange={setDraft} />
          <div className="mt-3 rounded-xl bg-teal-50/70 px-3 py-2 text-sm"><span className="font-medium text-teal-900">Reads as:</span> {formatParams(draft)}</div>
          <SaveCancel onSave={() => { if (sameParams(draft, fallback.params)) onReset(); else onSave(draft); setEditing(false); }} onCancel={() => setEditing(false)} />
        </div>
      )}
    </li>
  );
};

const MyCopyView = ({ ex, mine, myDefaults, patch, onBack, onDetails, onRemove, toast, onEditLibrary }: { ex: Exercise; mine: MyExercise; myDefaults: MyDefaults; patch: (f: (m: MyExercise) => MyExercise) => void; onBack: () => void; onDetails: () => void; onRemove: () => void; toast: (t: string) => void; onEditLibrary: () => void }) => {
  const imgs = EXERCISE_IMAGES[ex.pose];
  const types = typesOf(ex);
  const upd = updatedFields(ex, mine);
  const [notes, setNotes] = useState(mine.notes);
  const setText = (k: TextKey5, v: string) => patch((m) => ({ ...m, text: { ...m.text, [k]: { value: v, base: libText(ex, k) } } }));
  const resetText = (k: TextKey5) => patch((m) => { const n = { ...m.text }; delete n[k]; return { ...m, text: n }; });
  const keepMine = (k: TextKey5) => patch((m) => ({ ...m, text: { ...m.text, [k]: { ...m.text[k]!, base: libText(ex, k) } } }));
  const fields: { k: TextKey5; label: string; multiline?: boolean }[] = [
    { k: 'title', label: 'Title' },
    { k: 'description', label: 'Description', multiline: true },
    ...types.map((t) => ({ k: cueKey(t), label: `Cue, ${TYPE_LABEL[t].toLowerCase()}` })),
  ];
  return (
    <section aria-labelledby="mc-h">
      <BackLink onClick={onBack}>My exercises</BackLink>
      <div className="mt-1 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className={cx('text-xs font-semibold uppercase tracking-wide', CAT[ex.kind].text)}>My copy</p>
          <h1 id="mc-h" className="text-2xl font-semibold tracking-tight lg:text-3xl">{myText(ex, mine, 'title')}</h1>
          <p className="mt-1 text-sm text-slate-600">Your edits sit on top of the library exercise. Only you see them. Anything you haven't edited follows the library.</p>
          <button type="button" onClick={onEditLibrary} className={`${linkBtn} -ml-2`}>Something wrong for everyone? Edit the library entry<Icon d={I.right} className="h-4 w-4" sw={2.2} /></button>
        </div>
        <CatIcon kind={ex.kind} className="mt-1 h-8 w-8" />
      </div>
      {upd.length > 0 && (
        <a href={`#f-${upd[0]}`} className="mt-3 flex min-h-11 items-start gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden />
          <span><span className="font-semibold">Library updated on {ex.updated}.</span> {upd.length === 1 ? '1 field you edited has' : `${upd.length} fields you edited have`} a newer library version. Review below.</span>
        </a>
      )}
      <p className="mt-3 flex items-start gap-2 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-950"><Icon d={I.info} className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />Changes apply to new programs only. Programs you already built keep the values they were made with.</p>

      <div className="mt-4 grid gap-4 lg:grid-cols-2 lg:gap-6">
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-1">
            <h2 className="pt-3 font-semibold">Text</h2>
            {fields.map((f) => <OverrideField key={f.k} id={`f-${f.k}`} label={f.label} lib={libText(ex, f.k)} ov={mine.text[f.k]} multiline={f.multiline} onSave={(v) => { setText(f.k, v); toast(`${f.label} saved on your copy`); }} onReset={() => resetText(f.k)} onKeepMine={() => keepMine(f.k)} />)}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <label htmlFor="my-notes" className="font-semibold">My notes</label>
            <p className="text-xs text-slate-500">Private to you. Not shown on patient PDFs.</p>
            <textarea id="my-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => patch((m) => ({ ...m, notes }))} placeholder="For example: when you like to use it" className={`${input} mt-2 resize-y`} />
          </div>
          {imgs && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <h2 className="flex items-center gap-2 font-semibold"><Icon d={I.lock} className="h-4 w-4 text-slate-500" />Images and video</h2>
              <div className="mt-2 flex gap-2"><Thumb pose={ex.pose} size="h-14 w-[75px]" /><div className="h-14 w-[75px] shrink-0 overflow-hidden rounded-lg ring-1 ring-slate-200"><img src={imgs.end} alt="" className="h-full w-full object-cover" /></div></div>
              <p className="mt-2 text-sm text-slate-600">Always from the library, so every copy shows the same media. To change them for everyone, use Regenerate on the exercise details.</p>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <h2 className="px-1 font-semibold">Defaults per type</h2>
            <p className="px-1 text-xs text-slate-500">Used when you add this exercise to a new program.</p>
            <ol className="mt-2 flex flex-wrap gap-x-3 gap-y-1 rounded-xl bg-white px-3 py-2 text-xs text-slate-600 ring-1 ring-slate-200" aria-label="Which values are used">
              <li><span className="font-semibold text-teal-800">1</span> This exercise, if edited</li>
              <li><span className="font-semibold text-teal-800">2</span> My defaults for the type</li>
              <li><span className="font-semibold text-teal-800">3</span> Global</li>
            </ol>
            <ul className="mt-3 space-y-3">
              {types.map((t) => <TypeDefaults key={t} t={t} own={mine.params[t]} fallback={typeFallback(myDefaults, t)} onSave={(p) => { patch((m) => ({ ...m, params: { ...m.params, [t]: p } })); toast(`${TYPE_LABEL[t]} defaults saved for ${ex.name}`); }} onReset={() => patch((m) => { const n = { ...m.params }; delete n[t]; return { ...m, params: n }; })} />)}
            </ul>
          </div>
          <div className="flex flex-col gap-2">
            <button type="button" onClick={onDetails} className={`${secondary} w-full`}>See library details</button>
            {editCount(mine) > 0 && <button type="button" onClick={() => { patch((m) => ({ ...m, text: {}, params: {} })); toast('Reset to the library version'); }} className={`${ghost} w-full text-teal-800`}><Icon d={I.undo} className="h-4 w-4" />Reset all edits to library</button>}
            <button type="button" onClick={onRemove} className={`${ghost} w-full text-red-700 hover:bg-red-50`}><Icon d={I.trash} className="h-4 w-4" />Remove from My exercises</button>
          </div>
        </div>
      </div>
    </section>
  );
};
/* ---------- Draft review ---------- */

type Scope = 'all' | 'images' | 'video' | 'start' | 'end';
type MediaKey = 'start' | 'end' | 'video';
const SCOPES: { id: 'all' | 'images' | 'video'; label: string; hint: string }[] = [
  { id: 'all', label: 'Everything', hint: 'Text, images and video' },
  { id: 'images', label: 'Images only', hint: 'Start and end images. Text and video stay.' },
  { id: 'video', label: 'Video only', hint: 'The 6s loop. Text and images stay.' },
];
const scopeMedia = (s: Scope): MediaKey[] => (s === 'all' ? ['start', 'end', 'video'] : s === 'images' ? ['start', 'end'] : s === 'video' ? ['video'] : [s]);
const scopeLabel = (s: Scope) => ({ all: 'everything', images: 'images', video: 'video', start: 'start image', end: 'end image' }[s]);
const ALL_TEXT: (TextKey | ListKey | 'basics' | 'types')[] = ['basics', 'types', 'start', ...LIST_META.map((m) => m.key)];

type Snapshot = { f: DraftFields; version: number; updated: string[] };

const DraftReview = ({ approved, requestedBy, regenLeft, onUseRegen, onBack, onApprove, onReopen, onAddToProgram, toast, defaultFor }: { approved: boolean; requestedBy: Who; regenLeft: number; onUseRegen: () => void; onBack: () => void; onApprove: (f: DraftFields) => void; onReopen: () => void; onAddToProgram: () => void; toast: (t: string, undo?: () => void) => void; defaultFor: DefaultFor }) => {
  const [previewType, setPreviewType] = useState<StrengthType>('isometric');
  const [f, setF] = useState<DraftFields>(COPENHAGEN_DRAFT);
  const [version, setVersion] = useState(1);
  const [sheetScope, setSheetScope] = useState<Scope | null>(null);
  const [pick, setPick] = useState<'all' | 'images' | 'video'>('images');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string[]>([]);
  const [busyScope, setBusyScope] = useState<Scope | null>(null);
  const [updated, setUpdated] = useState<string[]>([]);
  const [undoSnap, setUndoSnap] = useState<Snapshot | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>(() => Object.fromEntries([['basics', true], ['start', true], ...LIST_META.map((m) => [m.key, !!m.defaultOpen])]));
  const [editAll, setEditAll] = useState(0);
  const [slide, setSlide] = useState(0);
  const pairRef = useRef<HTMLDivElement>(null);
  const imgs = EXERCISE_IMAGES[CPH];

  // v6 open editing: after approval, a text edit saves the next version for everyone (kept in history).
  const touch = () => { if (approved) { setVersion((v) => v + 1); toast(`Saved as version ${version + 1} for every practitioner. Version ${version} is kept in history.`); } };
  const saveText = (k: TextKey | ListKey, v: string | string[]) => { touch(); setF((x) => ({ ...x, [k]: v })); };

  const run = (scope: Scope, withNote: string) => {
    if (regenLeft <= 0) return;
    onUseRegen();
    setSheetScope(null);
    const snap: Snapshot = { f, version, updated };
    const keys: string[] = [...scopeMedia(scope), ...(scope === 'all' ? ALL_TEXT : [])];
    setBusy(keys); setBusyScope(scope); setUpdated([]); setUndoSnap(null);
    // v7 (4A): after approval, regenerated media goes live right away as a new version, restorable from history.
    window.setTimeout(() => {
      setBusy([]); setBusyScope(null);
      setUpdated(keys);
      setVersion((v) => v + 1);
      if (approved) toast(`New ${scopeLabel(scope)} live as version ${version + 1} for every practitioner. Version ${version} can be restored from history.`);
      if (scope === 'all' && withNote) setF((x) => ({ ...x, start: AI_REWRITES.start ?? x.start }));
      setUndoSnap(snap);
      setNote('');
    }, 2600);
  };
  const undo = () => { if (!undoSnap) return; setF(undoSnap.f); setVersion(undoSnap.version); setUpdated(undoSnap.updated); setUndoSnap(null); };
  const isBusy = (k: string) => busy.includes(k);
  const isUpd = (k: string) => updated.includes(k);
  const openScope = (s: Scope) => { setSheetScope(s); if (s === 'all' || s === 'images' || s === 'video') setPick(s); };
  const goSlide = (i: number) => { const el = pairRef.current; if (el) el.scrollTo({ left: i * (el.scrollWidth / 2), behavior: 'smooth' }); setSlide(i); };

  const MediaOverlay = ({ k }: { k: MediaKey }) => (
    <>
      {isBusy(k) && <div className="mp-shimmer z-10 flex items-center justify-center" aria-live="polite"><span className="relative z-10 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-teal-800 shadow"><Spinner />Generating</span></div>}
      {isUpd(k) && !isBusy(k) && <div className="pointer-events-none absolute right-2 top-2 z-10"><UpdatedTag /></div>}
    </>
  );
  const ImageCard = ({ k, label }: { k: 'start' | 'end'; label: string }) => (
    <figure className="w-[84%] shrink-0 snap-center lg:w-auto">
      <div className="relative overflow-hidden rounded-xl">
        <PoseImage src={imgs[k]} alt={`Copenhagen plank, short lever, ${label.toLowerCase()}`} className="rounded-xl" />
        <MediaOverlay k={k} />
        {!isBusy(k) && !approved && (
          <button type="button" onClick={() => openScope(k)} aria-label={`Regenerate ${label.toLowerCase()} image`} className="absolute bottom-2 right-2 z-10 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-white/95 px-3.5 text-sm font-semibold text-teal-800 shadow-md ring-1 ring-slate-200 transition hover:bg-teal-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
            <Icon d={I.refresh} className="h-4 w-4" sw={2} />Redo
          </button>
        )}
      </div>
      <figcaption className="mt-1.5 text-sm font-medium text-slate-700">{label}</figcaption>
    </figure>
  );

  const busyMsg = busyScope && (busyScope === 'all' ? 'Regenerating everything. This takes about a minute.' : `Regenerating the ${scopeLabel(busyScope)}. Everything else stays usable.`);
  const updatedMsg = !busyScope && undoSnap && (updated.length > 3 ? 'Text, images and video updated.' : updated.includes('video') ? 'Video updated.' : updated.length === 2 ? 'Both images updated.' : updated.includes('start') ? 'Start image updated.' : 'End image updated.');

  return (
    <section aria-labelledby="rev-h">
      <BackLink onClick={onBack}>Requests</BackLink>
      {approved ? (
        <div className="mt-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <p className="flex items-start gap-2 text-sm text-emerald-900"><Icon d={I.check} className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" sw={2.2} /><span><span className="font-semibold">Approved by you (Kojo), Oct 24, 2026, version {version}.</span> Requested by {WHO[requestedBy]}. It is live in the shared library. Any practitioner can improve it, and every edit or regenerated image or video is saved as a new version in history. {requestedBy === 'you' ? 'It is in your My exercises, tagged New, and no longer in Requests and drafts.' : "It went straight into the requester's My exercises, tagged New, and no longer shows in Requests and drafts."}</span></p>
          <button type="button" onClick={onAddToProgram} className={`${secondary} mt-3 w-full lg:w-auto`}>Add to Knee rehab, week 1</button>
        </div>
      ) : (
        <div className="mt-2 flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3">
          <Icon d={I.alert} className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" sw={2} />
          <p className="text-sm text-amber-900"><span className="font-semibold">Draft, not approved.</span> Requested by {WHO[requestedBy]}. The AI wrote this. Any practitioner can review and approve it. Check every field, image and the video. Tap any field to edit it.</p>
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <h1 id="rev-h" className="text-2xl font-semibold leading-tight tracking-tight lg:text-3xl">{f.name}</h1>
        {approved ? <Badge tone="green">Approved v{version}</Badge> : <Badge tone="amber">Draft v{version}</Badge>}
      </div>

      <div className="mt-4 hidden items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 lg:flex">
        {!approved && <button type="button" onClick={() => onApprove(f)} disabled={busy.length > 0} className={primary}>Approve</button>}
        <button type="button" onClick={() => openScope('images')} disabled={busy.length > 0} className={secondary}><Icon d={I.refresh} className="h-4 w-4" sw={2} />Regenerate</button>
        <button type="button" onClick={() => { setEditAll((n) => n + 1); setOpen((o) => Object.fromEntries(Object.keys(o).map((k) => [k, true]))); }} className={ghost}><Icon d={I.pencil} className="h-4 w-4" />Edit all</button>
        <span className="ml-auto text-xs text-slate-500">Approving records who approved it, the date and the version.</span>
      </div>

      {(busyMsg || updatedMsg) && (
        <div className={cx('mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border px-4 py-2.5 text-sm', busyMsg ? 'border-teal-200 bg-teal-50 text-teal-900' : 'border-slate-200 bg-white text-slate-800')} role="status">
          {busyMsg ? <Spinner /> : <Icon d={I.check} className="h-5 w-5 shrink-0 text-teal-700" sw={2.2} />}
          <span className="min-w-0 flex-1 basis-[calc(100%-2.5rem)] lg:basis-auto">{busyMsg || <>{updatedMsg} <span className="text-slate-500">Previous version kept.</span></>}</span>
          {updatedMsg && <div className="ml-auto flex gap-1"><button type="button" onClick={undo} className={`${ghost} px-3 text-teal-800`}><Icon d={I.undo} className="h-4 w-4" />Undo</button><button type="button" onClick={() => setUndoSnap(null)} aria-label="Keep new version" className={`${ghost} px-3`}>Keep</button></div>}
        </div>
      )}

      <div className="mt-4 grid gap-5 lg:grid-cols-[1.15fr_1fr] lg:gap-6">
        <div className="space-y-4 lg:sticky lg:top-24 lg:order-2 lg:self-start">
          <div className="rounded-2xl border border-slate-200 bg-white p-3 lg:p-4">
            <div className="mb-2 flex items-center justify-between px-1">
              <h2 className="font-semibold">Images</h2>
              <div className="flex gap-1 lg:hidden" role="tablist" aria-label="Choose image">
                {['Start', 'End'].map((l, i) => (
                  <button key={l} type="button" role="tab" aria-selected={slide === i} onClick={() => goSlide(i)} className={cx('min-h-11 rounded-full px-4 text-xs font-semibold', slide === i ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-600')}>{l}</button>
                ))}
              </div>
            </div>
            <div ref={pairRef} onScroll={(e) => { const el = e.currentTarget; setSlide(el.scrollLeft > (el.scrollWidth - el.clientWidth) / 2 ? 1 : 0); }} className="mp-noscrollbar -mx-3 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-3 px-3 lg:mx-0 lg:grid lg:grid-cols-2 lg:overflow-visible lg:px-0">
              <ImageCard k="start" label="Start position" />
              <ImageCard k="end" label="End position" />
            </div>
            <p className="mt-1 px-1 text-xs text-slate-500 lg:hidden">Swipe to see the end position.</p>
            <figure className="mt-4">
              <div className="relative overflow-hidden rounded-xl">
                <LoopVideo images={imgs} name="Copenhagen plank, short lever" className="rounded-xl" buttonClass="bg-white text-teal-800 hover:bg-teal-50 focus-visible:ring-teal-600" />
                <MediaOverlay k="video" />
              </div>
              <figcaption className="mt-1.5 text-sm font-medium text-slate-700">AI video, 6s loop</figcaption>
            </figure>
          </div>
        </div>

        <div className="space-y-3 lg:order-1">
          <div className="flex items-center justify-between px-1">
            <h2 className="font-semibold">Exercise details</h2>
            <button type="button" onClick={() => { setEditAll((n) => n + 1); setOpen((o) => Object.fromEntries(Object.keys(o).map((k) => [k, true]))); }} className={`${ghost} px-3 lg:hidden`}><Icon d={I.pencil} className="h-4 w-4" />Edit all</button>
          </div>
          <Section id="basics" title="Basics" summary="Strengthening" open={open.basics} setOpen={(v) => setOpen((o) => ({ ...o, basics: v }))} busy={isBusy('basics')} updated={isUpd('basics')}>
            {TEXT_META.map((m) => <TextField key={m.key} label={m.label} value={f[m.key]} onSave={(v) => saveText(m.key, v)} aiValue={AI_REWRITES[m.key]} editSignal={editAll} />)}
          </Section>
          <Section id="types" title="Versions and cues" summary="3 versions" open={open.types ?? true} setOpen={(v) => setOpen((o) => ({ ...o, types: v }))} busy={isBusy('types')} updated={isUpd('types')}>
            <div className="py-2"><TypePreview kind="strength" value={previewType} onChange={setPreviewType} defaultFor={defaultFor} cue={f[CUE_KEY[previewType]]} flat /></div>
            {STRENGTH_TYPES.map((t) => <TextField key={t} label={`${TYPE_LABEL[t]} cue`} value={f[CUE_KEY[t]]} onSave={(v) => saveText(CUE_KEY[t], v)} editSignal={editAll} />)}
          </Section>
          <Section id="start" title="Starting position" summary="1 paragraph" open={open.start} setOpen={(v) => setOpen((o) => ({ ...o, start: v }))} busy={isBusy('start')} updated={isUpd('start')}>
            <TextField label="Starting position" hideLabel multiline value={f.start} onSave={(v) => saveText('start', v)} aiValue={AI_REWRITES.start} editSignal={editAll} />
          </Section>
          {LIST_META.map((m) => (
            <Section key={m.key} id={m.key} title={m.label} summary={`${f[m.key].length} ${f[m.key].length === 1 ? 'item' : 'items'}`} open={open[m.key]} setOpen={(v) => setOpen((o) => ({ ...o, [m.key]: v }))} busy={isBusy(m.key)} updated={isUpd(m.key)}>
              <ListField label={m.label} numbered={m.numbered} items={f[m.key]} onSave={(v) => saveText(m.key, v)} editSignal={editAll} />
            </Section>
          ))}
          <p className="px-1 text-xs text-slate-500">Approving records who approved it, the date and the version. Every practitioner sees who requested and who approved it.</p>
        </div>
      </div>

      <MobileActionBar>
        <button type="button" onClick={() => openScope('images')} disabled={busy.length > 0} className={`${secondary} flex-1`}>{busy.length > 0 ? <Spinner /> : <Icon d={I.refresh} className="h-4 w-4" sw={2} />}Regenerate</button>
        {approved
          ? <button type="button" onClick={onAddToProgram} className={`${primary} flex-1`}>Add to program</button>
          : <button type="button" onClick={() => onApprove(f)} disabled={busy.length > 0} className={`${primary} flex-1`}>Approve</button>}
      </MobileActionBar>

      <Sheet open={!!sheetScope} onClose={() => setSheetScope(null)} labelId="rg-h"
        title={sheetScope === 'start' ? 'Regenerate start image' : sheetScope === 'end' ? 'Regenerate end image' : 'Regenerate'}
        subtitle={`${sheetScope === 'start' || sheetScope === 'end' ? 'Only this image changes. The rest of the draft stays as it is.' : 'Choose what the AI should redo. Your edits to anything else are kept.'} ${regenLeftText(regenLeft)}.`}
        footer={<button type="button" disabled={regenLeft <= 0} onClick={() => sheetScope && run(sheetScope === 'start' || sheetScope === 'end' ? sheetScope : pick, note)} className={`${primary} min-h-12 w-full`}><Icon d={I.refresh} className="h-4 w-4" sw={2} />{sheetScope === 'start' || sheetScope === 'end' ? 'Regenerate this image' : pick === 'all' ? 'Regenerate everything' : pick === 'images' ? 'Regenerate images' : 'Regenerate video'}</button>}>
        {sheetScope && sheetScope !== 'start' && sheetScope !== 'end' && (
          <fieldset>
            <legend className="sr-only">What to regenerate</legend>
            <div className="space-y-2">
              {SCOPES.map((s) => (
                <label key={s.id} className={cx('flex min-h-[60px] cursor-pointer items-center gap-3 rounded-2xl border p-3 transition', pick === s.id ? 'border-teal-600 bg-teal-50/60 ring-1 ring-teal-600' : 'border-slate-200 hover:bg-slate-50')}>
                  <input type="radio" name="scope" value={s.id} checked={pick === s.id} onChange={() => setPick(s.id)} className="h-5 w-5 accent-teal-700" />
                  <span className="flex-1"><span className="block font-semibold">{s.label}</span><span className="block text-sm text-slate-500">{s.hint}</span></span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {(sheetScope === 'start' || sheetScope === 'end') && (
          <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-2">
            <div className="w-24 shrink-0 overflow-hidden rounded-lg"><img src={imgs[sheetScope]} alt="" className="aspect-[4/3] w-full object-cover" /></div>
            <p className="text-sm text-slate-600">{sheetScope === 'start' ? 'Start position' : 'End position'}, version {version}</p>
          </div>
        )}
        <label htmlFor="rg-note" className="mt-4 block text-sm font-medium">Note for the AI <span className="font-normal text-slate-500">(optional)</span></label>
        <textarea id="rg-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: show forearm support, not straight arm" className={`${input} mt-1.5 resize-none`} />
        <div className="mt-2 flex flex-wrap gap-2">
          {['Show forearm support, not straight arm', 'Hips higher', 'Lower bench'].map((s) => (
            <button key={s} type="button" onClick={() => setNote(s)} className="min-h-11 rounded-full border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 hover:bg-slate-50">{s}</button>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">You can undo afterwards. The previous version is kept.</p>
      </Sheet>
    </section>
  );
};

const CUE_KEY: Record<StrengthType, TextKey> = { isometric: 'cueIsometric', concentric: 'cueConcentric', eccentric: 'cueEccentric' };

// Preview only: the version is chosen per program row.
const TypePreview = ({ kind, value, onChange, defaultFor, cue, flat }: { kind: Kind; value: StrengthType; onChange: (t: StrengthType) => void; defaultFor: DefaultFor; cue?: string; flat?: boolean }) => {
  const t: ExType = kind === 'stretch' ? 'stretching' : value;
  const d = defaultFor(t);
  return (
    <div className={cx(flat ? '' : 'mt-3 rounded-2xl border border-slate-200 p-3')}>
      <div className="mb-2 flex items-center justify-between gap-2"><span className="text-sm font-semibold">{kind === 'stretch' ? 'Stretching only' : 'Preview a version'}</span><KindTag kind={kind} /></div>
      {kind === 'strength' && <Segmented label="Preview version" options={STRENGTH_TYPES} value={value} onChange={onChange} labels={TYPE_LABEL} />}
      <div className="mt-2 rounded-xl bg-teal-50/70 px-3 py-2.5">
        <div className="text-[15px] font-semibold text-teal-900">{formatParams(d.params)}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2"><SourceNote source={d.source} /></div>
        {(cue || kind === 'strength') && <p className="mt-1.5 text-sm text-slate-700"><span className="font-medium">Cue:</span> {cue ?? DEFAULT_TYPE_CUES[value]}</p>}
      </div>
      {kind === 'strength' && <p className="mt-2 text-xs text-slate-500">Preview only. Same images and video for all 3. You pick the version on each program row.</p>}
    </div>
  );
};

const MyDefaultsView = ({ mine, setMine, onBack, toast, defaultExpiry, setDefaultExpiry }: { mine: MyDefaults; setMine: (m: MyDefaults) => void; onBack: () => void; toast: (t: string) => void; defaultExpiry: Expiry; setDefaultExpiry: (x: Expiry) => void }) => {
  const [editing, setEditing] = useState<ExType | null>(null);
  const [draft, setDraft] = useState<Params>({});
  const start = (t: ExType) => { setDraft({ ...(mine[t] ?? GLOBAL_DEFAULTS[t]) }); setEditing(t); };
  return (
    <section aria-labelledby="def-h">
      <BackLink onClick={onBack}>Programs</BackLink>
      <h1 id="def-h" className="mt-1 text-2xl font-semibold tracking-tight lg:text-3xl">My defaults</h1>
      <p className="mt-1 text-sm text-slate-600">Your defaults fill in new program rows and new share links. Where you haven't set one, the global default is used. Edits on a single exercise in My exercises win over both.</p>
      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2"><Icon d={I.clock} className="h-5 w-5 text-teal-700" /><h2 className="text-lg font-semibold">Share link expiry</h2>{defaultExpiry !== '365' && <Badge tone="teal">Your default</Badge>}</div>
        <p className="mt-0.5 text-sm text-slate-500">New share links use this. You can change it on each program.</p>
        <div className="mt-3"><ExpiryPicker value={defaultExpiry} onChange={(x) => { setDefaultExpiry(x); toast(x === 'never' ? 'New links will never expire' : `New links will expire after ${expiryLabel(x).toLowerCase()}`); }} label="Default share link expiry" /></div>
        <p className="mt-2 text-xs text-slate-500">{defaultExpiry === 'never' ? 'Never means a link works until you close it.' : 'Global default: 1 year.'} Existing links keep their own setting. To end a link on a specific date, use Pick a date on that program's Share screen.</p>
      </div>
      <h2 className="mt-6 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Exercise types</h2>
      <div className="mt-3 flex items-start gap-2 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">
        <Icon d={I.alert} className="mt-0.5 h-4 w-4 shrink-0" />
        <p>Changing your defaults only affects exercises you add from now on. Existing programs and share links stay the same.</p>
      </div>
      <ul className="mt-4 grid gap-3 lg:grid-cols-2">
        {TYPES.map((t) => {
          const own = mine[t];
          const isEdit = editing === t;
          return (
            <li key={t} className={cx('rounded-2xl border bg-white p-4', isEdit ? 'border-teal-500 ring-1 ring-teal-500' : 'border-slate-200')}>
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold">{TYPE_LABEL[t]}</h2><KindTag kind={t === 'stretching' ? 'stretch' : 'strength'} /></div>
                  <p className="text-sm text-slate-500">{TYPE_HINT[t]}</p>
                </div>
                {own && !isEdit && <Badge tone="teal">Your default</Badge>}
              </div>
              {!isEdit && (
                <>
                  {own ? (
                    <div className="mt-3 rounded-xl bg-teal-50/70 px-3 py-2.5">
                      <div className="text-xs font-semibold uppercase tracking-wide text-teal-800">Your default</div>
                      <div className="mt-0.5 text-[15px] font-semibold text-teal-950">{formatParams(own)}</div>
                      <div className="mt-1 text-sm text-slate-500">Global: {formatParams(GLOBAL_DEFAULTS[t])}</div>
                    </div>
                  ) : (
                    <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2.5">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Global default, in use</div>
                      <div className="mt-0.5 text-[15px] font-semibold">{formatParams(GLOBAL_DEFAULTS[t])}</div>
                    </div>
                  )}
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={() => start(t)} className={`${secondary} flex-1`} aria-label={own ? `Edit your ${t} default` : `Set your own ${t} default`}><Icon d={I.pencil} className="h-4 w-4" />{own ? 'Edit' : 'Set my own'}</button>
                    {own && <button type="button" onClick={() => { const n = { ...mine }; delete n[t]; setMine(n); toast(`${TYPE_LABEL[t]} reset to global`); }} className={`${ghost} flex-1 text-teal-800`}><Icon d={I.undo} className="h-4 w-4" />Reset to global</button>}
                  </div>
                </>
              )}
              {isEdit && (
                <div className="mt-3">
                  <p className="mb-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-500">Global: {formatParams(GLOBAL_DEFAULTS[t])}</p>
                  <ParamEditor type={t} params={draft} onChange={setDraft} />
                  <div className="mt-3 rounded-xl bg-teal-50/70 px-3 py-2 text-sm"><span className="font-medium text-teal-900">Reads as:</span> <span className="text-slate-800">{formatParams(draft)}</span></div>
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={() => { setMine({ ...mine, [t]: draft }); setEditing(null); toast(`Saved your ${t} default`); }} className={`${primary} flex-1`}>Save</button>
                    <button type="button" onClick={() => setEditing(null)} className={`${secondary} flex-1`}>Cancel</button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-4 px-1 text-xs text-slate-500">Global defaults are set for all practitioners. Up, down and rest can be added with "Add parameter".</p>
    </section>
  );
};

const Section = ({ id, title, summary, open, setOpen, busy, updated, children }: { id: string; title: string; summary: string; open: boolean; setOpen: (v: boolean) => void; busy?: boolean; updated?: boolean; children: React.ReactNode }) => (
  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <h3>
      <button type="button" aria-expanded={open} aria-controls={`sec-${id}`} onClick={() => setOpen(!open)} className="flex min-h-14 w-full items-center gap-3 px-4 text-left focus:outline-none focus-visible:bg-slate-50">
        <span className="flex-1 font-semibold">{title}</span>
        {busy ? <Badge tone="teal"><Spinner />Generating</Badge> : updated ? <UpdatedTag /> : <span className="text-sm text-slate-500">{summary}</span>}
        <Icon d={I.chevron} className={cx('h-5 w-5 shrink-0 text-slate-400 transition', open && 'rotate-180')} />
      </button>
    </h3>
    {open && <div id={`sec-${id}`} className={cx('relative border-t border-slate-100 px-4 py-2', busy && 'pointer-events-none')}>{children}{busy && <div className="mp-shimmer" />}</div>}
  </div>
);

const useEditSignal = (signal: number, start: () => void) => { const seen = useRef(signal); useEffect(() => { if (signal === seen.current) return; seen.current = signal; start(); }, [signal]); };

const FieldShell = ({ label, hideLabel, children, actions }: { label: string; hideLabel?: boolean; children: React.ReactNode; actions?: React.ReactNode }) => (
  <div className="border-b border-slate-100 py-2 last:border-0">
    <div className={cx('flex items-center gap-2', hideLabel && 'sr-only')}><span className="flex-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>{actions}</div>
    {children}
  </div>
);

const AiButton = ({ onClick, busy }: { onClick: () => void; busy: boolean }) => (
  <button type="button" onClick={onClick} disabled={busy} className="-mr-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-teal-700 hover:bg-teal-50 disabled:opacity-60">{busy ? <Spinner /> : <Icon d={I.sparkle} className="h-4 w-4" />}Rewrite with AI</button>
);

const SaveCancel = ({ onSave, onCancel, disabled }: { onSave: () => void; onCancel: () => void; disabled?: boolean }) => (
  <div className="mt-2 flex gap-2">
    <button type="button" onClick={onSave} disabled={disabled} className={`${primary} flex-1 lg:flex-none`}>Save</button>
    <button type="button" onClick={onCancel} className={`${secondary} flex-1 lg:flex-none`}>Cancel</button>
  </div>
);

const TextField = ({ label, value, onSave, multiline, aiValue, hideLabel, editSignal }: { label: string; value: string; onSave: (v: string) => void; multiline?: boolean; aiValue?: string; hideLabel?: boolean; editSignal: number }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [ai, setAi] = useState(false);
  const [rewritten, setRewritten] = useState<string | null>(null);
  const start = () => { setDraft(value); setEditing(true); };
  useEditSignal(editSignal, start);
  const rewrite = () => { setAi(true); window.setTimeout(() => { setAi(false); const prev = value; onSave(aiValue ?? value); setRewritten(prev); }, 1400); };
  return (
    <FieldShell label={label} hideLabel={hideLabel && !editing} actions={!editing && aiValue ? <AiButton onClick={rewrite} busy={ai} /> : undefined}>
      {editing ? (
        <>
          {multiline ? <textarea aria-label={label} rows={4} value={draft} onChange={(e) => setDraft(e.target.value)} className={`${input} mt-1 resize-y`} autoFocus /> : <input aria-label={label} value={draft} onChange={(e) => setDraft(e.target.value)} className={`${input} mt-1`} autoFocus />}
          <SaveCancel onSave={() => { onSave(draft.trim() || value); setEditing(false); }} onCancel={() => setEditing(false)} />
        </>
      ) : (
        <>
          <button type="button" onClick={start} aria-label={`Edit ${label}`} className={cx('group relative -mx-2 flex min-h-11 w-[calc(100%+1rem)] items-start gap-2 rounded-lg px-2 py-2 text-left text-[15px] leading-relaxed text-slate-800 transition hover:bg-slate-50 active:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 lg:text-sm', ai && 'pointer-events-none')}>
            <span className="min-w-0 flex-1 break-words">{value}</span>
            <Icon d={I.pencil} className="mt-1 h-4 w-4 shrink-0 text-slate-300 group-hover:text-teal-700" />
            {ai && <span className="mp-shimmer rounded-lg" />}
          </button>
          {rewritten !== null && !ai && (
            <div className="flex items-center gap-2 text-xs text-slate-500"><UpdatedTag /><span className="flex-1">Rewritten by AI</span><button type="button" onClick={() => { onSave(rewritten); setRewritten(null); }} className="min-h-11 rounded-lg px-3 font-semibold text-teal-700 hover:bg-teal-50">Undo</button></div>
          )}
        </>
      )}
    </FieldShell>
  );
};

const ListField = ({ label, items, onSave, numbered, editSignal }: { label: string; items: string[]; onSave: (v: string[]) => void; numbered?: boolean; editSignal: number }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<{ id: number; text: string }[]>([]);
  const start = () => { setDraft(items.map((text, i) => ({ id: i + 1, text }))); setEditing(true); };
  useEditSignal(editSignal, start);
  const move = (i: number, d: number) => setDraft((xs) => { const ys = [...xs]; const [m] = ys.splice(i, 1); ys.splice(i + d, 0, m); return ys; });
  if (!editing) {
    return (
      <button type="button" onClick={start} aria-label={`Edit ${label}`} className="group -mx-2 my-1 flex w-[calc(100%+1rem)] items-start gap-2 rounded-lg px-2 py-2 text-left transition hover:bg-slate-50 active:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
        <ol className="min-w-0 flex-1 space-y-2 text-[15px] leading-relaxed text-slate-800 lg:text-sm">
          {items.map((t, i) => (
            <li key={i} className="flex gap-2.5">
              <span className={cx('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold', numbered ? 'bg-teal-50 text-teal-800' : 'text-teal-700')}>{numbered ? i + 1 : '•'}</span>
              <span className="min-w-0 flex-1 break-words">{t}</span>
            </li>
          ))}
        </ol>
        <Icon d={I.pencil} className="mt-1 h-4 w-4 shrink-0 text-slate-300 group-hover:text-teal-700" />
      </button>
    );
  }
  return (
    <div className="py-2">
      <div className="mb-2 flex items-center gap-2"><Badge tone="teal">Editing {label.toLowerCase()}</Badge></div>
      <ol className="space-y-2">
        {draft.map((it, i) => (
          <li key={it.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-2">
            <div className="flex items-start gap-2">
              <span className="mt-3 w-5 shrink-0 text-center text-xs font-bold text-slate-400">{numbered ? i + 1 : '•'}</span>
              <textarea aria-label={`${label} item ${i + 1}`} rows={1} value={it.text} onChange={(e) => setDraft((xs) => xs.map((x) => (x.id === it.id ? { ...x, text: e.target.value } : x)))} className={`${input} resize-none`} style={{ fieldSizing: 'content' } as React.CSSProperties} />
            </div>
            <div className="flex items-center justify-end">
              <button type="button" aria-label={`Move item ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)} className={iconBtn}><Icon d={I.up} /></button>
              <button type="button" aria-label={`Move item ${i + 1} down`} disabled={i === draft.length - 1} onClick={() => move(i, 1)} className={iconBtn}><Icon d={I.down} /></button>
              <button type="button" aria-label={`Remove item ${i + 1}`} onClick={() => setDraft((xs) => xs.filter((x) => x.id !== it.id))} className={cx(iconBtn, 'text-red-600 hover:bg-red-50 hover:text-red-700')}><Icon d={I.trash} /></button>
            </div>
          </li>
        ))}
      </ol>
      <button type="button" onClick={() => setDraft((xs) => [...xs, { id: Date.now(), text: '' }])} className={`${btn} mt-2 w-full border border-dashed border-slate-300 text-teal-800 hover:bg-teal-50`}><Icon d={I.plus} sw={2.2} />Add item</button>
      <SaveCancel onSave={() => { onSave(draft.map((x) => x.text.trim()).filter(Boolean)); setEditing(false); }} onCancel={() => setEditing(false)} disabled={draft.every((x) => !x.text.trim())} />
    </div>
  );
};

/* ---------- Share (v6: per-program expiry incl. Never, close keeps the program, PDF from the link) ---------- */

const TypeGlyph = ({ t }: { t: TypeChoice }) => (
  <span className="flex h-9 w-9 shrink-0 items-center justify-center gap-0.5 rounded-xl bg-slate-50 ring-1 ring-slate-200" aria-hidden>
    {t !== 'stretch' && <Icon d={CAT.strength.icon} className={cx(t === 'both' ? 'h-3.5 w-3.5' : 'h-4 w-4', CAT.strength.text)} sw={2.2} />}
    {t !== 'strength' && <Icon d={CAT.stretch.icon} className={cx(t === 'both' ? 'h-3.5 w-3.5' : 'h-4 w-4', CAT.stretch.text)} sw={2.2} />}
  </span>
);

const ExpiryPicker = ({ value, onChange, label, defaultValue, allowCustom }: { value: Expiry; onChange: (x: Expiry) => void; label: string; defaultValue?: Expiry; allowCustom?: boolean }) => (
  <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
    {(allowCustom ? EXPIRY_OPTIONS : DEFAULT_EXPIRY_OPTIONS).map((o) => (
      <button key={o.id} type="button" role="radio" aria-checked={value === o.id} onClick={() => onChange(o.id)} className={cx('inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600', value === o.id ? 'border-teal-700 bg-teal-700 text-white shadow-sm' : 'border-slate-300 bg-white text-slate-700 hover:border-teal-300')}>
        {o.id === 'custom' && <Icon d={I.calendar} className="h-4 w-4" sw={2} />}{o.label}{defaultValue === o.id && <span className={cx('text-xs font-medium', value === o.id ? 'text-teal-100' : 'text-slate-500')}>default</span>}
      </button>
    ))}
  </div>
);

const Share = ({ title, rows, poseFor, state, setState, sheetOpen, setSheetOpen, expiry, setExpiry, defaultExpiry, customDate, setCustomDate, onOpenDefaults, onPreview, onBack, onCopy, onDownload }: { title: string; rows: Row[]; poseFor: (r: Row) => string; state: ShareState; setState: (s: ShareState) => void; sheetOpen: boolean; setSheetOpen: (v: boolean) => void; expiry: Expiry; setExpiry: (x: Expiry) => void; defaultExpiry: Expiry; customDate: string; setCustomDate: (d: string) => void; onOpenDefaults: () => void; onPreview: () => void; onBack: () => void; onCopy: () => void; onDownload: () => void }) => {
  const name = title || 'Untitled program';
  const exp = { ...EXPIRY_OPTIONS.find((o) => o.id === expiry)!, date: expiryDate(expiry, customDate) };
  const Actions = ({ inSheet }: { inSheet?: boolean }) => (
    state === 'closed' ? (
      <div className="rounded-2xl bg-slate-50 p-4">
        <Badge tone="slate">Link closed</Badge>
        <p className="mt-2 text-sm text-slate-600">Anyone who opens the old link sees a "This link was closed" page. The program stays in Programs, so you can reuse it with another patient.</p>
        <button type="button" onClick={() => setState('active')} className={`${primary} mt-4 w-full`}>Create a new link</button>
      </div>
    ) : (
      <>
        <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-700 text-white"><Icon d={I.link} /></div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{name}</div>
            <div className="truncate font-mono text-xs text-slate-500">{LINK.replace('https://', '')}</div>
          </div>
        </div>
        <p className="mt-2 px-1 text-xs text-slate-500">Anyone with the link can view the program and save it as a PDF. No sign-in, no patient details stored.</p>
        <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-700"><Icon d={I.refresh} className="mt-px h-3.5 w-3.5 shrink-0 text-teal-700" sw={2} />The link always shows your latest published version. Edits stay a draft until you publish them.</p>
        <div className="mt-4">
          <div className="flex items-baseline justify-between gap-2 px-1"><h3 className="text-sm font-semibold">Link expires</h3><span className="text-xs text-slate-500">This program only</span></div>
          <div className="mt-2"><ExpiryPicker value={expiry} onChange={setExpiry} defaultValue={defaultExpiry} label="Link expires" allowCustom /></div>
          {expiry === 'custom' && (
            <div className="mt-3 rounded-2xl border border-teal-300 bg-white p-3 ring-1 ring-teal-300">
              <label htmlFor="exp-date" className="text-sm font-semibold">Link stops working on</label>
              <input id="exp-date" type="date" min="2026-10-25" aria-describedby="exp-date-h" value={customDate} onChange={(e) => setCustomDate(e.target.value)} className={`${input} mt-1.5`} />
              <div className="mt-2 flex flex-wrap gap-2">
                {[['2026-11-06', 'In 2 weeks'], ['2026-12-15', 'Mid December'], ['2027-01-31', 'End of January'], ['2027-06-30', 'End of June 2027']].map(([d, l]) => (
                  <button key={d} type="button" onClick={() => setCustomDate(d)} aria-pressed={customDate === d} className={cx('min-h-11 rounded-full border px-3 text-xs font-semibold', customDate === d ? 'border-teal-700 bg-teal-50 text-teal-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50')}>{l}</button>
                ))}
              </div>
              <p id="exp-date-h" className="mt-2 text-xs text-slate-500">Any date from tomorrow. There is no latest date.</p>
            </div>
          )}
          <p className={cx('mt-2 flex items-start gap-1.5 rounded-xl px-3 py-2 text-sm', expiry === 'never' ? 'bg-amber-50 text-amber-950 ring-1 ring-inset ring-amber-200' : 'bg-teal-50/70 text-teal-950')}>
            <Icon d={expiry === 'never' ? I.info : I.clock} className="mt-0.5 h-4 w-4 shrink-0" />
            {expiry === 'never' ? <span><span className="font-semibold">Never expires.</span> Good for a general program you reuse. It works until you close it.</span> : <span>Expires on <span className="font-semibold">{exp.date}</span>{expiry === 'custom' ? '' : ` (${exp.label})`}.</span>}
          </p>
          {expiry !== 'never' && (
            <div className="mt-2 flex items-center gap-3 rounded-xl border border-dashed border-teal-300 px-3 py-2">
              <p className="min-w-0 flex-1 text-sm text-slate-700"><span className="font-semibold">Reusing this program with other patients?</span> Set it to Never. Each program has one link at a time.</p>
              <button type="button" onClick={() => setExpiry('never')} className={`${secondary} shrink-0 px-3`}>Set to Never</button>
            </div>
          )}
          <button type="button" onClick={onOpenDefaults} className={`${linkBtn} -ml-1 mt-1 text-xs`}>Your default is {expiryLabel(defaultExpiry).toLowerCase()}. Change it in My defaults</button>
        </div>
        <ul className={cx('mt-3 overflow-hidden rounded-2xl border border-slate-200', inSheet && 'divide-y divide-slate-100')}>
          {[
            { label: 'Copy link', hint: '', icon: I.link, on: () => { onCopy(); if (inSheet) setSheetOpen(false); }, tone: 'text-slate-900' },
            { label: 'See the link page', hint: 'What your patient sees, with Save as PDF', icon: I.eye, on: () => { setSheetOpen(false); onPreview(); }, tone: 'text-slate-900' },
            { label: 'Download PDF', hint: 'The same PDF the link page makes', icon: I.download, on: () => { onDownload(); if (inSheet) setSheetOpen(false); }, tone: 'text-slate-900' },
            { label: 'Close link', hint: 'The program stays in Programs', icon: I.close, on: () => { setSheetOpen(false); setState('confirm'); }, tone: 'text-red-600' },
          ].map((a) => (
            <li key={a.label} className="border-b border-slate-100 last:border-0">
              <button type="button" onClick={a.on} className={cx('flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left text-[15px] font-medium transition hover:bg-slate-50 active:bg-slate-100 focus:outline-none focus-visible:bg-slate-50', a.tone)}>
                <Icon d={a.icon} className="h-5 w-5 shrink-0" /><span className="min-w-0 flex-1"><span className="block">{a.label}</span>{a.hint && <span className="block text-xs font-normal text-slate-500">{a.hint}</span>}</span>
              </button>
            </li>
          ))}
        </ul>
      </>
    )
  );
  return (
    <section aria-labelledby="s-h">
      <BackLink onClick={onBack}>Back to program</BackLink>
      <h1 id="s-h" className="mt-1 text-2xl font-semibold tracking-tight lg:text-3xl">Share program</h1>
      <div className="mt-4 grid gap-6 lg:mt-6 lg:grid-cols-[1fr_380px]">
        <div className="-mx-4 bg-slate-200/70 px-3 py-4 lg:mx-0 lg:rounded-2xl lg:p-8">
          <div className="mx-auto max-w-[560px] rounded-sm bg-white px-4 py-5 shadow-md lg:px-10 lg:py-8" aria-label="PDF preview">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-teal-700">Exercise program</div>
                <div className="mt-0.5 text-lg font-semibold leading-tight">{name}</div>
              </div>
              <div className="shrink-0 text-right text-[10px] text-slate-500">PRG-7K3Q<br />Oct 23, 2026</div>
            </div>
            <ol className="mt-3 space-y-3">
              {rows.map((r, i) => {
                const slug = poseFor(r); const im = EXERCISE_IMAGES[slug];
                return (
                  <li key={r.id} className="flex gap-2.5">
                    <div className="flex shrink-0 gap-1">
                      {im ? (<><Thumb pose={slug} size="h-10 w-[52px] lg:h-12 lg:w-16" /><div className="h-10 w-[52px] shrink-0 overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200 lg:h-12 lg:w-16"><img src={im.end} alt="" className="h-full w-full object-cover" /></div></>)
                        : (<><Thumb pose="pending" size="h-10 w-[52px] lg:h-12 lg:w-16" /><Thumb pose="pending" size="h-10 w-[52px] lg:h-12 lg:w-16" /></>)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] leading-snug text-slate-800"><span className="font-semibold">{i + 1}. {r.name}{r.type !== 'stretching' && `, ${r.type}`}:</span> {formatParams(r.params)}</p>
                      <p className="text-[11px] leading-snug text-slate-500">{r.pending ? 'Instructions and images added once approved.' : r.notes || r.cue || 'Follow the steps shown in the video at the link.'}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
            <p className="mt-5 border-t border-slate-200 pt-2.5 text-[10px] text-slate-400">Prepared by your physiotherapist. Watch the videos at the link on this page.</p>
          </div>
          <p className="mt-3 text-center text-xs text-slate-500">PDF preview, page 1 of 1. Made from the link page.</p>
        </div>
        <aside className="hidden lg:block">
          <div className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="mb-3 font-semibold">Share link</h2><Actions /></div>
        </aside>
      </div>
      <MobileActionBar>
        {state === 'closed'
          ? <button type="button" onClick={() => setState('active')} className={`${primary} w-full`}>Create a new link</button>
          : <><button type="button" onClick={onPreview} className={`${secondary} flex-1`}><Icon d={I.eye} />Link page</button><button type="button" onClick={() => setSheetOpen(true)} className={`${primary} flex-[2]`}><Icon d={I.share} />Share</button></>}
      </MobileActionBar>
      <div className="lg:hidden">
        <Sheet open={sheetOpen && state !== 'confirm'} onClose={() => setSheetOpen(false)} title="Share program" subtitle={state === 'closed' ? 'Link closed' : expiryLine(expiry, customDate)} labelId="sh-h"><Actions inSheet /></Sheet>
      </div>
      <Sheet open={state === 'confirm'} onClose={() => setState('active')} title="Close this share link?" labelId="del-h"
        footer={<div className="flex flex-col-reverse gap-2 lg:flex-row lg:justify-end"><button type="button" onClick={() => setState('active')} className={`${secondary} min-h-12 lg:min-h-11`}>Cancel</button><button type="button" onClick={() => setState('closed')} className={`${btn} min-h-12 bg-red-600 text-white hover:bg-red-700 lg:min-h-11`}>Close link</button></div>}>
        <p className="text-sm text-slate-600">Anyone with the link loses access right away{expiry === 'never' ? '' : `, before ${exp.date}`}.</p>
        <div className="mt-3 flex items-start gap-2 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-950"><Icon d={I.check} className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" sw={2.2} /><span>The program stays in Programs. You can reuse it with another patient and create a new link any time.</span></div>
      </Sheet>
    </section>
  );
};

/* ---------- Link page: what anyone with the link sees, with Save as PDF ---------- */

const LinkPage = ({ title, rows, poseFor, expiry, customDate, onBack, onPdf }: { title: string; rows: Row[]; poseFor: (r: Row) => string; expiry: Expiry; customDate: string; onBack: () => void; onPdf: () => void }) => {
  const name = title || 'Exercise program';
  const [play, setPlay] = useState<string | null>(null);
  const exp = { date: expiryDate(expiry, customDate) };
  return (
    <section aria-labelledby="lp-h">
      <BackLink onClick={onBack}>Back to share</BackLink>
      <p className="mt-1 flex items-start gap-2 rounded-2xl border border-dashed border-teal-300 bg-white px-4 py-2.5 text-sm text-slate-700"><Icon d={I.eye} className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />Preview of the link page. This is what anyone with the link sees, no sign-in.</p>
      <div className="mx-auto mt-3 max-w-2xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-teal-700 text-[11px] font-bold text-white">D</span>
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-500">{LINK.replace('https://', '')}</span>
        </div>
        <div className="px-4 pb-5 pt-4 lg:px-6">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-teal-700">Exercise program</div>
          <h1 id="lp-h" className="mt-0.5 text-2xl font-semibold tracking-tight">{name}</h1>
          <p className="mt-1 text-sm text-slate-500">From your physiotherapist · {rows.length} exercises · Published Oct 24, 2026</p>
          <p className="mt-1 text-xs text-slate-500">This page always shows the latest published version of your program.</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" onClick={onPdf} className={primary}><Icon d={I.download} />Save as PDF</button>
            <button type="button" onClick={onPdf} className={secondary}><Icon d={I.printer} />Print</button>
          </div>
          <ol className="mt-5 space-y-4">
            {rows.map((r, i) => {
              const slug = poseFor(r); const im = EXERCISE_IMAGES[slug];
              return (
                <li key={r.id} className="rounded-2xl border border-slate-200 p-3">
                  <p className="font-semibold leading-snug">{i + 1}. {r.name}{r.type !== 'stretching' && <span className="font-normal text-slate-500">, {r.type}</span>}</p>
                  <p className="mt-0.5 text-[15px] font-semibold text-teal-900">{formatParams(r.params)}</p>
                  {im ? (
                    play === r.id ? <LoopVideo images={im} name={r.name} className="mt-2 rounded-xl" buttonClass="bg-white text-teal-800 hover:bg-teal-50 focus-visible:ring-teal-600" /> : (
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <figure><img src={im.start} alt={`${r.name}, start`} className="aspect-[4/3] w-full rounded-xl object-cover" /><figcaption className="mt-1 text-xs text-slate-500">Start</figcaption></figure>
                        <figure><img src={im.end} alt={`${r.name}, end`} className="aspect-[4/3] w-full rounded-xl object-cover" /><figcaption className="mt-1 text-xs text-slate-500">End</figcaption></figure>
                      </div>
                    )
                  ) : <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">Instructions and images are on the way.</p>}
                  {(r.notes || r.cue) && <p className="mt-2 text-sm text-slate-700">{r.notes || r.cue}</p>}
                  {im && <button type="button" onClick={() => setPlay(play === r.id ? null : r.id)} className={`${linkBtn} -ml-2 mt-1`}>{play === r.id ? 'Show images' : 'Play video'}</button>}
                </li>
              );
            })}
          </ol>
          <p className="mt-5 border-t border-slate-100 pt-3 text-xs text-slate-500">{expiry === 'never' ? 'This link stays open until your physiotherapist closes it.' : `This link works until ${exp.date}.`} No patient details are stored here.</p>
        </div>
      </div>
    </section>
  );
};

/* ---------- Edit for everyone (open editing, wiki style) ---------- */

type LibDraft = { name: string; aliases: string; description: string; steps: string; cues: Partial<Record<ExType, string>> };
const LibEditView = ({ ex, seed, saved, onBack, onMyCopy, onHistory, onPublish }: { ex: Exercise; seed?: { alias: string; note: string }; saved: boolean; onBack: () => void; onMyCopy: () => void; onHistory: () => void; onPublish: (next: Partial<Exercise>, summary: string, changes: string[]) => void }) => {
  const types = typesOf(ex);
  const start: LibDraft = { name: ex.name, aliases: ex.aliases.join(', '), description: ex.description, steps: stepsFor(ex).join('\n'), cues: Object.fromEntries(types.map((t) => [t, libText(ex, cueKey(t))])) };
  const [d, setD] = useState<LibDraft>(() => (seed && !ex.aliases.some((a) => a.toLowerCase() === seed.alias.toLowerCase()) ? { ...start, aliases: [start.aliases, seed.alias].filter(Boolean).join(', ') } : start));
  const [summary, setSummary] = useState(seed ? `Merged a request for "${seed.alias}"${seed.note ? `: ${seed.note}` : ''}` : '');
  const changed: string[] = [
    ...(d.name !== start.name ? ['Name'] : []),
    ...(d.aliases !== start.aliases ? ['Also called'] : []),
    ...(d.description !== start.description ? ['Description'] : []),
    ...types.filter((t) => d.cues[t] !== start.cues[t]).map((t) => `${TYPE_LABEL[t]} cue`),
    ...(d.steps !== start.steps ? ['Steps'] : []),
  ];
  const Changed = ({ on }: { on: boolean }) => (on ? <Badge tone="amber">Changed</Badge> : null);
  const field = 'border-b border-slate-100 py-3 last:border-0';
  const lbl = 'flex min-h-6 items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500';
  const publish = () => onPublish({ name: d.name.trim() || ex.name, aliases: d.aliases.split(',').map((x) => x.trim()).filter(Boolean), description: d.description.trim(), steps: d.steps.split('\n').map((x) => x.trim()).filter(Boolean), cues: { ...ex.cues, ...d.cues } }, summary.trim() || `Edited ${changed.join(', ').toLowerCase()}`, changed.map((c) => `${c} changed`));
  return (
    <section aria-labelledby="le-h">
      <BackLink onClick={onBack}>Exercise details</BackLink>
      <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-teal-800">Edit for everyone</p>
      <div className="flex flex-wrap items-center gap-2"><h1 id="le-h" className="text-2xl font-semibold tracking-tight lg:text-3xl">{ex.name}</h1><Badge tone="green">Version {ex.version}, live</Badge></div>
      <div className="mt-3 flex items-start gap-2 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-950">
        <Icon d={I.users} className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />
        <p>This is the shared library entry. When you save, it becomes <span className="font-semibold">version {ex.version + 1}</span> for every practitioner. Version {ex.version} stays in <button type="button" onClick={onHistory} className="font-semibold text-teal-800 underline underline-offset-2">history</button> and anyone can restore it.</p>
      </div>
      {seed && <div className="mt-3 flex items-start gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700" role="status"><Icon d={I.merge} className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" /><p><span className="font-semibold">Merging your request into {ex.name}.</span> "{seed.alias}" is added under Also called{seed.note ? ', and your note is in "What did you change?"' : ''}. Check it, then save. No new request is made.</p></div>}
      <p className="mt-2 flex items-start gap-1.5 px-1 text-xs text-slate-500"><Icon d={I.info} className="mt-px h-3.5 w-3.5 shrink-0 text-teal-700" />Programs that use it aren't updated on their own. Their builder asks whether to update or keep the original. To change images or video, use Regenerate on the exercise details.</p>

      <div className="mt-4 grid gap-4 lg:grid-cols-2 lg:gap-6">
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-1">
          <div className={field}><label htmlFor="le-name" className={lbl}>Name<Changed on={d.name !== start.name} /></label><input id="le-name" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} className={`${input} mt-1.5`} /></div>
          <div className={field}><label htmlFor="le-al" className={lbl}>Also called<Changed on={d.aliases !== start.aliases} /></label><input id="le-al" value={d.aliases} onChange={(e) => setD({ ...d, aliases: e.target.value })} className={`${input} mt-1.5`} /><p className="mt-1 text-xs text-slate-500">Separate with commas. Aliases help others find it instead of adding a duplicate.</p></div>
          <div className={field}><label htmlFor="le-desc" className={lbl}>Description<Changed on={d.description !== start.description} /></label><textarea id="le-desc" rows={3} value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} className={`${input} mt-1.5 resize-y`} /></div>
          <div className={field}><label htmlFor="le-steps" className={lbl}>Steps, one per line<Changed on={d.steps !== start.steps} /></label><textarea id="le-steps" rows={5} value={d.steps} onChange={(e) => setD({ ...d, steps: e.target.value })} className={`${input} mt-1.5 resize-y`} /></div>
        </div>
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-1">
            <h2 className="pt-3 font-semibold">{types.length > 1 ? 'Cues per version' : 'Cue'}</h2>
            {types.map((t) => (
              <div key={t} className={field}><label htmlFor={`le-cue-${t}`} className={lbl}>{TYPE_LABEL[t]}<Changed on={d.cues[t] !== start.cues[t]} /></label><input id={`le-cue-${t}`} value={d.cues[t] ?? ''} onChange={(e) => setD({ ...d, cues: { ...d.cues, [t]: e.target.value } })} className={`${input} mt-1.5`} /></div>
            ))}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <label htmlFor="le-sum" className="font-semibold">What did you change? <span className="font-normal text-slate-500">(optional)</span></label>
            <input id="le-sum" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="For example: clearer knee cue" className={`${input} mt-2`} />
            <p className="mt-1 text-xs text-slate-500">Shown in version history so others know why it changed.</p>
          </div>
          {saved && <button type="button" onClick={onMyCopy} className={`${linkBtn} -ml-1`}>Only want it different for you? Edit my copy instead<Icon d={I.right} className="h-4 w-4" sw={2.2} /></button>}
          <div className="hidden gap-2 lg:flex">
            <button type="button" onClick={publish} disabled={changed.length === 0} className={`${primary} flex-1`}>Save as version {ex.version + 1}</button>
            <button type="button" onClick={onBack} className={secondary}>Cancel</button>
          </div>
        </div>
      </div>
      <MobileActionBar>
        <button type="button" onClick={onBack} className={`${secondary} flex-1`}>Cancel</button>
        <button type="button" onClick={publish} disabled={changed.length === 0} className={`${primary} flex-[2]`}>{changed.length ? `Save as version ${ex.version + 1}` : 'No changes yet'}</button>
      </MobileActionBar>
    </section>
  );
};

/* ---------- Version history ---------- */

const HistoryView = ({ ex, versions, initialRestore, onBack, onEdit, onRestore }: { ex: Exercise; versions: LibVersion[]; initialRestore: number | null; onBack: () => void; onEdit: () => void; onRestore: (v: LibVersion) => void }) => {
  const [confirm, setConfirm] = useState<LibVersion | null>(() => versions.find((v) => v.v === initialRestore) ?? null);
  return (
    <section aria-labelledby="vh-h">
      <BackLink onClick={onBack}>Exercise details</BackLink>
      <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-teal-800">{ex.name}</p>
      <h1 id="vh-h" className="text-2xl font-semibold tracking-tight lg:text-3xl">Version history</h1>
      <p className="mt-1 text-sm text-slate-600">Every change to the shared entry is kept: text edits, regenerated images and video, and merges. Restoring an older version saves it as a new version, so nothing is lost. A merge can't be undone.</p>
      <ol className="relative mt-5 space-y-3 border-l-2 border-slate-200 pl-4 lg:max-w-2xl">
        {versions.map((v, i) => (
          <li key={`${v.v}-${i}`} className={cx('relative rounded-2xl border bg-white p-4', i === 0 ? 'border-teal-300 ring-1 ring-teal-300' : 'border-slate-200')}>
            <span className={cx('absolute -left-[25px] top-5 h-3 w-3 rounded-full ring-4 ring-slate-50', i === 0 ? 'bg-teal-600' : 'bg-slate-300')} aria-hidden />
            <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">Version {v.v}</h2>{i === 0 && <Badge tone="green">Live</Badge>}<span className="ml-auto text-xs text-slate-500">{v.date}</span></div>
            <p className="mt-0.5 text-sm text-slate-600">{HISTORY_BY_LABEL[v.by]} · {v.summary}</p>
            {(v.media || v.from || v.merge) && <div className="mt-1.5 flex flex-wrap gap-1.5">{v.merge && <Badge tone="slate"><Icon d={I.merge} className="h-3 w-3" sw={2.2} />Merge, permanent</Badge>}{v.media && <Badge tone="teal"><Icon d={I.refresh} className="h-3 w-3" sw={2.2} />Images and video</Badge>}{v.from && <Badge tone="slate"><Icon d={I.merge} className="h-3 w-3" sw={2.2} />From {v.from}</Badge>}</div>}
            {v.media && EXERCISE_IMAGES[ex.pose] && <div className="mt-2 flex gap-2"><Thumb pose={ex.pose} size="h-12 w-16" /><div className="h-12 w-16 shrink-0 overflow-hidden rounded-lg ring-1 ring-slate-200"><img src={EXERCISE_IMAGES[ex.pose].end} alt="" className="h-full w-full object-cover" /></div></div>}
            <ul className="mt-2 space-y-1 text-sm text-slate-800">{v.changes.map((c) => <li key={c} className="flex gap-2"><span className="text-teal-700" aria-hidden>•</span>{c}</li>)}</ul>
            {i > 0 && !v.from && <button type="button" onClick={() => setConfirm(v)} className={`${secondary} mt-3 w-full lg:w-auto`}><Icon d={I.undo} className="h-4 w-4" />Restore this version</button>}
          </li>
        ))}
      </ol>
      <p className="mt-4 flex items-start gap-1.5 px-1 text-xs text-slate-500 lg:max-w-2xl"><Icon d={I.info} className="mt-px h-3.5 w-3.5 shrink-0 text-teal-700" />Programs aren't updated on their own. When this changes, programs that use it ask whether to update or keep the original. Merges are permanent and can't be undone.</p>
      <button type="button" onClick={onEdit} className={`${primary} mt-4 w-full lg:w-auto`}><Icon d={I.pencil} className="h-4 w-4" />Edit for everyone</button>
      <Sheet open={!!confirm} onClose={() => setConfirm(null)} title={confirm ? `Restore version ${confirm.v}?` : ''} labelId="rs-h"
        footer={<div className="flex flex-col-reverse gap-2 lg:flex-row lg:justify-end"><button type="button" onClick={() => setConfirm(null)} className={`${secondary} min-h-12 lg:min-h-11`}>Cancel</button><button type="button" onClick={() => { if (confirm) onRestore(confirm); setConfirm(null); }} className={`${primary} min-h-12 lg:min-h-11`}>Restore as version {ex.version + 1}</button></div>}>
        {confirm && <>
          <p className="text-sm text-slate-600">The text, images and video from version {confirm.v} become version {ex.version + 1} for every practitioner. Version {ex.version} stays in history.</p>
          {versions.some((x) => x.merge && x.v > confirm.v) && <p className="mt-2 text-sm text-slate-600">This doesn't undo the merge. Merged names stay as aliases, because merges are permanent.</p>}
          <p className="mt-2 text-xs text-slate-500">Programs that use it get a prompt to update or keep their original.</p>
          <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm"><div className="font-semibold">Version {confirm.v}, {confirm.date}</div><div className="text-slate-600">{HISTORY_BY_LABEL[confirm.by]} · {confirm.summary}</div></div>
        </>}
      </Sheet>
    </section>
  );
};

/* ---------- Report duplicate and merge (3C) ---------- */

const DupView = ({ ex, library, history, reportedWith, initialStep, onBack, onReport, onMerge }: { ex: Exercise; library: Exercise[]; history: Record<string, LibVersion[]>; reportedWith?: string; initialStep: 'pick' | 'keep' | 'confirm'; onBack: () => void; onReport: (otherId: string) => void; onMerge: (keepId: string, dropId: string) => void }) => {
  const [q, setQ] = useState('');
  const [other, setOther] = useState<string | null>(reportedWith ?? (initialStep !== 'pick' ? (ex.id === 'ex14' ? 'ex8' : 'ex14') : null));
  const [step, setStep] = useState<'pick' | 'keep'>(reportedWith || initialStep !== 'pick' ? 'keep' : 'pick');
  const [keep, setKeep] = useState<string | null>(initialStep !== 'pick' || reportedWith ? (ex.id === 'ex14' ? 'ex8' : ex.id) : null);
  const [confirm, setConfirm] = useState(initialStep === 'confirm');
  const words = ex.name.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4);
  const score = (e: Exercise) => (e.region === ex.region ? 1 : 0) + ([e.name, ...e.aliases].join(' ').toLowerCase().split(/[^a-z]+/).some((w) => words.some((x) => w.slice(0, 4) === x.slice(0, 4))) ? 2 : 0);
  const cands = library.filter((e) => e.id !== ex.id && e.kind === ex.kind).filter((e) => !q || [e.name, ...e.aliases].join(' ').toLowerCase().includes(q.toLowerCase())).sort((a, b) => score(b) - score(a));
  const suggested = cands.filter((e) => score(e) >= 2);
  const rest = cands.filter((e) => score(e) < 2);
  const o = library.find((e) => e.id === other);
  const pair = o ? [ex, o] : [];
  const kept = pair.find((e) => e.id === keep); const dropped = keep ? pair.find((e) => e.id !== keep) : undefined;
  const Pick = ({ e }: { e: Exercise }) => (
    <li>
      <label className={cx('flex min-h-[68px] cursor-pointer items-center gap-3 rounded-2xl border p-2.5 transition', other === e.id ? 'border-teal-600 bg-teal-50/60 ring-1 ring-teal-600' : 'border-slate-200 bg-white hover:bg-slate-50')}>
        <input type="radio" name="dupof" checked={other === e.id} onChange={() => setOther(e.id)} className="h-5 w-5 accent-teal-700" />
        <Thumb pose={e.pose} size="h-12 w-16" />
        <span className="min-w-0 flex-1"><span className="block font-semibold leading-snug">{e.name}</span><span className="block truncate text-xs text-slate-500">{e.aliases.join(', ')}</span><span className="block text-xs text-slate-500">{e.region} · {ADDED_BY_LABEL[e.addedBy]}</span></span>
      </label>
    </li>
  );
  return (
    <section aria-labelledby="dup-h">
      <BackLink onClick={onBack}>Exercise details</BackLink>
      <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-teal-800">{ex.name}</p>
      <h1 id="dup-h" className="text-2xl font-semibold tracking-tight lg:text-3xl">{step === 'pick' ? 'Report duplicate' : 'Merge into one'}</h1>
      <ol className="mt-3 flex gap-2 text-xs font-semibold" aria-label="Steps">
        {['Which one is it the same as?', 'Which one stays?'].map((t, i) => (
          <li key={t} className={cx('flex flex-1 items-center gap-1.5 rounded-full px-3 py-1.5', (i === 0 ? step === 'pick' : step === 'keep') ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-600')}><span className="tabular-nums">{i + 1}</span>{t}</li>
        ))}
      </ol>
      {step === 'pick' ? (
        <>
          <p className="mt-3 text-sm text-slate-600">Duplicates make the library hard to search. Pick the exercise that {ex.name} repeats.</p>
          <label htmlFor="dupq" className="sr-only">Search the library</label>
          <div className="relative mt-3"><Icon d={I.search} className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" /><input id="dupq" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the library" className={`${input} pl-11`} /></div>
          {suggested.length > 0 && <><h2 className="mt-4 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Most likely</h2><ul className="mt-2 space-y-2">{suggested.map((e) => <Pick key={e.id} e={e} />)}</ul></>}
          {rest.length > 0 && <><h2 className="mt-4 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Other {CAT[ex.kind].label.toLowerCase()} exercises</h2><ul className="mt-2 space-y-2">{rest.slice(0, 4).map((e) => <Pick key={e.id} e={e} />)}</ul></>}
          <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] mt-5 grid grid-cols-2 gap-2 rounded-2xl bg-slate-50/95 py-2 backdrop-blur lg:static">
            <button type="button" disabled={!other} onClick={() => other && onReport(other)} className={secondary}><Icon d={I.flag} className="h-4 w-4" />Report only</button>
            <button type="button" disabled={!other} onClick={() => setStep('keep')} className={primary}><Icon d={I.merge} className="h-4 w-4" />Merge now</button>
          </div>
          <p className="px-1 text-xs text-slate-500">Report only adds a "Possible duplicate" note on both, so any practitioner can merge them later.</p>
        </>
      ) : o && (
        <>
          <p className="mt-3 text-sm text-slate-600">Pick the one to keep. The other is folded into it.</p>
          <fieldset className="mt-3"><legend className="sr-only">Exercise to keep</legend>
            <div className="space-y-2">
              {pair.map((e) => (
                <label key={e.id} className={cx('flex cursor-pointer items-start gap-3 rounded-2xl border p-3 transition', keep === e.id ? 'border-teal-600 bg-teal-50/60 ring-1 ring-teal-600' : 'border-slate-200 bg-white hover:bg-slate-50')}>
                  <input type="radio" name="keep" checked={keep === e.id} onChange={() => setKeep(e.id)} className="mt-1 h-5 w-5 accent-teal-700" />
                  <Thumb pose={e.pose} size="h-14 w-[75px]" />
                  <span className="min-w-0 flex-1"><span className="block font-semibold leading-snug">{e.name}</span><span className="block text-xs text-slate-500">Also called {e.aliases.join(', ') || 'nothing yet'}</span><span className="mt-0.5 block text-xs text-slate-600">{ADDED_BY_LABEL[e.addedBy]} · {historyFor(e, history).length} {historyFor(e, history).length === 1 ? 'version' : 'versions'} · updated {e.updated}</span></span>
                  {keep === e.id && <Badge tone="teal">Keep</Badge>}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="font-semibold">What happens</h2>
            <ul className="mt-2 space-y-1.5 text-sm text-slate-700">
              {[
                kept && dropped ? `${kept.name} stays in the library as one entry.` : 'The one you keep stays in the library as one entry.',
                dropped ? `"${dropped.name}" and its aliases become aliases, so search still finds it.` : 'The other name and its aliases become aliases, so search still finds it.',
                'The history of both is kept in one version history.',
                'Programs and share links that used either one keep working.',
              ].map((t) => <li key={t} className="flex gap-2"><Icon d={I.check} className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" sw={2.4} />{t}</li>)}
              <li className="flex gap-2 font-medium text-slate-900"><Icon d={I.alert} className="mt-0.5 h-4 w-4 shrink-0 text-slate-700" sw={2.2} />It's permanent. A merge can't be undone.</li>
            </ul>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => (reportedWith ? onBack() : setStep('pick'))} className={secondary}>Back</button>
            <button type="button" disabled={!keep} onClick={() => setConfirm(true)} className={primary}><Icon d={I.merge} className="h-4 w-4" />Merge</button>
          </div>
        </>
      )}
      <Sheet open={confirm && !!kept && !!dropped} onClose={() => setConfirm(false)} title={kept && dropped ? `Merge ${dropped.name} into ${kept.name}?` : ''} labelId="mg-h"
        footer={<div className="flex flex-col-reverse gap-2 lg:flex-row lg:justify-end"><button type="button" onClick={() => setConfirm(false)} className={`${secondary} min-h-12 lg:min-h-11`}>Cancel</button><button type="button" onClick={() => { if (kept && dropped) onMerge(kept.id, dropped.id); }} className={`${primary} min-h-12 lg:min-h-11`}>Merge permanently</button></div>}>
        {kept && dropped && <>
          <p className="text-sm text-slate-700">Every practitioner will see one exercise, <span className="font-semibold">{kept.name}</span>, as version {kept.version + 1}. "{dropped.name}" becomes an alias.</p>
          <p className="mt-2 text-sm text-slate-700">Both histories are kept, and the merge is recorded in version history.</p>
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-slate-100 px-3 py-2.5 text-sm font-medium text-slate-900"><Icon d={I.alert} className="mt-0.5 h-4 w-4 shrink-0" sw={2.2} />This can't be undone. Programs may already use the merged exercise, so merges are permanent.</p>
        </>}
      </Sheet>
    </section>
  );
};
