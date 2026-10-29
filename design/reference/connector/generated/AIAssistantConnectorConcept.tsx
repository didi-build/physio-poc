import { useEffect, useRef, useState } from 'react';
import { EXERCISE_IMAGES } from './exerciseImages';

type Scenario = 'build' | 'routine' | 'read' | 'edit' | 'expiry' | 'delete' | 'notfound';
type Decision = 'yes' | 'no' | null;
type ConfirmId = 'publish-build' | 'publish-routine' | 'publish-edit' | 'delete';
type Level = 'text' | 'card';
type Step =
  | { kind: 'user'; text: string }
  | { kind: 'tool'; text: string; detail: string }
  | { kind: 'reply'; id: string }
  | { kind: 'confirm'; id: ConfirmId };

const LINK = 'https://physio.didi.build/p/7K3Q-9XLM';
const LINK2 = 'https://physio.didi.build/p/6T2P-2XQM';
const MISSING = 'Copenhagen plank, short lever';
const SEARCH_URL = `https://physio.didi.build/library?q=${encodeURIComponent(MISSING).replace(/%20/g, '+')}`;
const PROGRAM = [
  { name: 'Heel slides', dose: '3 x 10', pose: 'heel-slides' },
  { name: 'Straight leg raise', dose: '3 x 10', pose: 'straight-leg-raise' },
  { name: 'Terminal knee extension', dose: '3 x 15, light band', pose: 'terminal-knee-extension' },
  { name: 'Wall sit', dose: '3 x 30s hold', pose: 'wall-sit' },
] as const;
// v11 (DIDI-852, locked on DIDI-594): the connector can search routines and create a program from one.
// The program is a separate copy with a name the practitioner picks and a code. Routine edits never change it.
const KNEE_OA = [
  { name: 'Heel slides', dose: '2 x 10', pose: 'heel-slides' },
  { name: 'Straight leg raise', dose: '3 x 10', pose: 'straight-leg-raise' },
  { name: 'Sit to stand', dose: '2 x 10', pose: 'sit-to-stand', changed: 'was 8 reps' },
  { name: 'Wall sit', dose: '3 x 20s hold', pose: 'wall-sit' },
  { name: 'Calf stretch', dose: '30s hold, 1 to 2 times a day', pose: 'calf-stretch' },
] as const;

// v8 (DIDI-828 Q6 and DIDI-829, locked on DIDI-594): edits save as a draft, only Publish changes the live link.
// v10 (#17, locked on DIDI-594): drafts save automatically. No manual save step. Publish still needs the confirm card.
// Publish and Delete always need the practitioner to confirm. Delete closes the link and can be restored for 30 days.
type Script = { steps: Step[]; yes?: Step[]; no?: Step[] };
const SCRIPTS: Record<Scenario, Script> = {
  build: {
    steps: [
      { kind: 'user', text: 'Build a week 1 knee rehab program: heel slides, straight leg raises, terminal knee extensions with a light band, and wall sits. 3 sets each. Call it "Knee rehab, week 1" and give me a link I can send.' },
      { kind: 'tool', text: 'Searched exercise library', detail: '4 approved matches' },
      { kind: 'tool', text: 'Draft saved automatically', detail: 'Knee rehab, week 1, 4 exercises' },
      { kind: 'reply', id: 'build-draft' },
      { kind: 'confirm', id: 'publish-build' },
    ],
    yes: [
      { kind: 'tool', text: 'Published program', detail: 'You confirmed' },
      { kind: 'tool', text: 'Created share link', detail: 'Expires in 1 year, your default' },
      { kind: 'reply', id: 'build-published' },
    ],
    no: [{ kind: 'reply', id: 'build-kept' }],
  },
  routine: {
    steps: [
      { kind: 'user', text: 'Find a routine for knee arthritis and make a program from it called "Knee OA, week 1". Make the sit to stands 10 reps.' },
      { kind: 'tool', text: 'Searched routines', detail: '2 matches for knee arthritis' },
      { kind: 'tool', text: 'Created program from routine', detail: 'Knee osteoarthritis, starter, v3. Separate copy, PRG-6T2P' },
      { kind: 'tool', text: 'Set parameters', detail: 'Sit to stand, 2 x 10' },
      { kind: 'tool', text: 'Draft saved automatically', detail: 'Not live yet' },
      { kind: 'reply', id: 'routine-draft' },
      { kind: 'confirm', id: 'publish-routine' },
    ],
    yes: [
      { kind: 'tool', text: 'Published program', detail: 'You confirmed' },
      { kind: 'tool', text: 'Created share link', detail: 'Expires in 1 year, your default' },
      { kind: 'reply', id: 'routine-published' },
    ],
    no: [{ kind: 'reply', id: 'routine-kept' }],
  },
  read: {
    steps: [
      { kind: 'user', text: "What's in PRG-2M8D? Is the link live?" },
      { kind: 'tool', text: 'Found program by code', detail: 'PRG-2M8D, Hip strength, phase 2, 4 exercises' },
      { kind: 'reply', id: 'read' },
    ],
  },
  edit: {
    steps: [
      { kind: 'user', text: 'In Knee rehab, week 1: add clamshells after heel slides, remove the straight leg raises, move wall sits to the top and make them 45s holds.' },
      { kind: 'tool', text: 'Read program', detail: '4 exercises, published Oct 24' },
      { kind: 'tool', text: 'Added exercise', detail: 'Clamshell, 3 x 10, after Heel slides' },
      { kind: 'tool', text: 'Removed exercise', detail: 'Straight leg raise' },
      { kind: 'tool', text: 'Reordered', detail: 'Wall sit moved to the top' },
      { kind: 'tool', text: 'Set parameters', detail: 'Wall sit, 3 x 45s hold' },
      { kind: 'tool', text: 'Draft saved automatically', detail: 'Not live yet' },
      { kind: 'reply', id: 'edit-saved' },
      { kind: 'confirm', id: 'publish-edit' },
    ],
    yes: [
      { kind: 'tool', text: 'Published program', detail: 'You confirmed. Same link' },
      { kind: 'reply', id: 'edit-published' },
    ],
    no: [{ kind: 'reply', id: 'edit-kept' }],
  },
  expiry: {
    steps: [
      { kind: 'user', text: 'Make the Knee rehab, week 1 link expire on Dec 15.' },
      { kind: 'tool', text: 'Updated share link', detail: 'Expires Dec 15, 2026' },
      { kind: 'reply', id: 'expiry' },
    ],
  },
  delete: {
    steps: [
      { kind: 'user', text: "Delete Hip strength, phase 2. I don't use it anymore." },
      { kind: 'tool', text: 'Read program', detail: 'PRG-2M8D, 4 exercises, link open' },
      { kind: 'reply', id: 'delete-ask' },
      { kind: 'confirm', id: 'delete' },
    ],
    yes: [
      { kind: 'tool', text: 'Deleted program', detail: 'You confirmed. Moved to Recently deleted' },
      { kind: 'tool', text: 'Closed share link', detail: 'physio.didi.build/p/2M8D-4TQR' },
      { kind: 'reply', id: 'delete-done' },
    ],
    no: [{ kind: 'reply', id: 'delete-kept' }],
  },
  notfound: {
    steps: [
      { kind: 'user', text: `Add ${MISSING}, 3 x 20s hold each side, to Knee rehab, week 1.` },
      { kind: 'tool', text: 'Searched exercise library', detail: 'No approved match' },
      { kind: 'reply', id: 'notfound' },
    ],
  },
};

const HIP = [
  ['Glute bridge', '3 x 10'], ['Clamshell', '2 x 15'], ['Sit to stand', '3 x 8'], ['Hamstring stretch', '30s hold, 1 to 2 times a day'],
] as const;

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(' ');
const focus = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2';

const Thumb = ({ pose }: { pose: string }) => (
  <div className="h-11 w-[60px] shrink-0 overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200">
    <img src={EXERCISE_IMAGES[pose]?.start} alt="" loading="lazy" className="h-full w-full object-cover" />
  </div>
);

const AssistantAvatar = () => (
  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-700 to-slate-900 text-white" aria-hidden>
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor"><path d="M10 2l1.8 4.7L16.5 8.5l-4.7 1.8L10 15l-1.8-4.7L3.5 8.5l4.7-1.8z" /></svg>
  </div>
);

export type ChatProps = { initialScenario?: Scenario; initialLevel?: Level; instant?: boolean; openPreview?: boolean; initialDecision?: Decision };

export const AIAssistantConnectorConcept = ({ initialScenario = 'build', initialLevel = 'text', instant = false, openPreview = false, initialDecision = null }: ChatProps) => {
  const [scenario, setScenario] = useState<Scenario>(initialScenario);
  const [level, setLevel] = useState<Level>(initialLevel);
  const [decision, setDecision] = useState<Decision>(initialDecision);
  const stepsFor = (sc: Scenario, d: Decision) => { const x = SCRIPTS[sc]; return [...x.steps, ...(d === 'yes' ? x.yes ?? [] : d === 'no' ? x.no ?? [] : [])]; };
  const [shown, setShown] = useState(instant ? stepsFor(initialScenario, initialDecision).length : 0);
  const [run, setRun] = useState(0);
  const [preview, setPreview] = useState(openPreview);
  const scroller = useRef<HTMLDivElement>(null);
  const steps = stepsFor(scenario, decision);

  useEffect(() => {
    if (shown >= steps.length) return;
    const next = steps[shown];
    const delay = shown === 0 ? 400 : next.kind === 'tool' ? 750 : 900;
    const t = setTimeout(() => setShown((s) => s + 1), delay);
    return () => clearTimeout(t);
  }, [shown, steps, run]);

  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' }); }, [shown, level]);

  const play = (s: Scenario = scenario) => { setScenario(s); setDecision(null); setShown(0); setRun((r) => r + 1); setPreview(false); };
  const done = shown >= steps.length;
  const thinking = !done && shown > 0 && steps[shown - 1]?.kind !== 'confirm';

  return (
    <div className="flex min-h-screen w-full justify-center bg-[#f4f4f6] text-slate-900" style={{ fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}>
      <div className="flex w-full max-w-[1280px] flex-col px-3 py-4 sm:px-6 sm:py-6">
        {/* Concept header */}
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-dashed border-indigo-300 bg-white px-4 py-3 sm:px-5">
          <span className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-extrabold uppercase tracking-[0.18em] text-white">Concept</span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold sm:text-base">Using the physio connector inside an AI assistant</div>
            <div className="text-xs text-slate-500">A generic assistant, not any real product. The connector works in ChatGPT, Microsoft Copilot, Grok and Claude. ChatGPT and Copilot come first for the MVP.</div>
          </div>
        </div>

        {/* Controls */}
        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Scenario">
            {([['build', 'Build'], ['routine', 'From a routine'], ['read', 'Find by code'], ['edit', 'Edit and publish'], ['expiry', 'Set expiry'], ['delete', 'Delete'], ['notfound', 'Not found']] as const).map(([id, label]) => (
              <button key={id} role="tab" aria-selected={scenario === id} type="button" onClick={() => play(id)} className={cx('rounded-full px-4 py-2 text-sm font-semibold transition', focus, scenario === id ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50')}>{label}</button>
            ))}
            <button type="button" onClick={() => play()} className={cx('ml-1 inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50', focus)}>
              <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor"><path d="M4 2.5v11a.5.5 0 0 0 .77.42l8.5-5.5a.5.5 0 0 0 0-.84l-8.5-5.5A.5.5 0 0 0 4 2.5z" /></svg>
              {done ? 'Replay' : 'Playing'}
            </button>
          </div>
          {scenario === 'build' && decision === 'yes' ? (
            <div className="flex items-center rounded-xl bg-white p-1 ring-1 ring-slate-200" role="radiogroup" aria-label="Reply level">
              {([['text', 'Text reply (every assistant)'], ['card', 'Inline card (MCP Apps)']] as const).map(([id, label]) => (
                <button key={id} role="radio" aria-checked={level === id} type="button" onClick={() => setLevel(id)} className={cx('rounded-lg px-3 py-1.5 text-xs font-semibold transition sm:text-sm', focus, level === id ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50')}>{label}</button>
              ))}
            </div>
          ) : (
            <div className="rounded-xl bg-white px-3 py-2 text-xs font-medium text-slate-600 ring-1 ring-slate-200 sm:text-sm">Text reply, works in every assistant</div>
          )}
        </div>

        <div className="mt-4 grid flex-1 gap-4 lg:grid-cols-[1fr_300px]">
          {/* Chat surface */}
          <section aria-label="Chat" className="flex min-h-[640px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
              <AssistantAvatar />
              <div className="text-sm font-semibold">Your AI assistant</div>
              <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-800 ring-1 ring-teal-200">
                <span className="h-1.5 w-1.5 rounded-full bg-teal-600" /> Physio library connector
              </span>
            </div>

            <div ref={scroller} className="flex-1 space-y-4 overflow-y-auto px-4 py-6 sm:px-8">
              {steps.slice(0, shown).map((s, i) => {
                if (s.kind === 'user') return (
                  <div key={`${run}-${i}`} className="flex justify-end animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="max-w-[85%] rounded-2xl rounded-br-md bg-slate-100 px-4 py-3 text-sm leading-relaxed sm:max-w-[70%]">{s.text}</div>
                  </div>
                );
                if (s.kind === 'tool') return (
                  <div key={`${run}-${i}`} className="flex items-center gap-2 pl-10 text-xs text-slate-500 animate-in fade-in duration-300">
                    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-teal-600" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    <span className="font-medium text-slate-600">{s.text}</span>
                    <span className="text-slate-400">{s.detail}</span>
                  </div>
                );
                if (s.kind === 'confirm') return (
                  <div key={`${run}-${i}`} className="pl-10 animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <ConfirmCard id={s.id} decision={decision} onDecide={setDecision} />
                  </div>
                );
                return (
                  <div key={`${run}-${i}-${level}`} className="flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <AssistantAvatar />
                    <div className="min-w-0 flex-1 text-sm leading-relaxed text-slate-800">
                      {s.id === 'build-published' ? (level === 'text' ? <TextReply /> : <CardReply />) : s.id === 'notfound' ? <NotFoundReply onOpen={() => setPreview(true)} /> : REPLIES[s.id]}
                    </div>
                  </div>
                );
              })}
              {thinking && (
                <div className="flex items-center gap-1.5 pl-10" aria-label="Assistant is working">
                  {[0, 1, 2].map((d) => <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: `${d * 120}ms` }} />)}
                </div>
              )}
            </div>

            <div className="border-t border-slate-100 p-3 sm:p-4">
              <div className="flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3">
                <input aria-label="Message" disabled placeholder="Message your assistant" className="flex-1 bg-transparent text-sm placeholder:text-slate-400 focus:outline-none" />
                <button type="button" disabled className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-slate-500" aria-label="Send">↑</button>
              </div>
            </div>
          </section>

          {/* Explainer */}
          <aside className="space-y-4 text-sm">
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="font-semibold">What the connector can do (v1)</h2>
              <ul className="mt-3 space-y-2 text-slate-600">
                <li className="flex gap-2"><span className="text-teal-600">✓</span>Search approved exercises</li>
                <li className="flex gap-2"><span className="text-teal-600">✓</span>Build a program, or find one by its name or code</li>
                <li className="flex gap-2"><span className="text-teal-600">✓</span>Search routines and create a program from one. It is a separate copy with its own name and code</li>
                <li className="flex gap-2"><span className="text-teal-600">✓</span>Add, remove and reorder exercises and set parameters. Changes save as a draft automatically</li>
                <li className="flex gap-2"><span className="text-teal-600">✓</span>Publish to the live link, only after you confirm</li>
                <li className="flex gap-2"><span className="text-teal-600">✓</span>Set link expiry: any date from tomorrow, or never</li>
                <li className="flex gap-2"><span className="text-teal-600">✓</span>Delete a program, only after you confirm. It closes the link and can be restored for 30 days</li>
                <li className="flex gap-2"><span className="text-teal-600">✓</span>Point to the PDF, which anyone can save from the link</li>
                <li className="flex gap-2"><span className="text-slate-400">✕</span>Create or edit exercises. A missing exercise links to the web app, where any practitioner can request it.</li>
                <li className="flex gap-2"><span className="text-slate-400">✕</span>Create or edit routines. That happens in the web app.</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="font-semibold">Routines</h2>
              <p className="mt-2 text-slate-600">Ready-made programs for common conditions, shared by every practitioner. A program made from a routine is a separate copy with its own name and code, so later routine edits never change what a patient already has.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="font-semibold">Drafts save automatically</h2>
              <p className="mt-2 text-slate-600">Every edit saves as a draft right away. There is no save step. Your patient sees changes only after you publish, on the same link. Publish and Delete always show a card you have to confirm. It works the same in the web app.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="font-semibold">Where it works</h2>
              <ul className="mt-3 space-y-2">
                {([['ChatGPT', true], ['Microsoft Copilot', true], ['Grok', false], ['Claude', false]] as const).map(([n, first]) => (
                  <li key={n} className="flex items-center justify-between gap-2"><span className="font-medium text-slate-800">{n}</span>{first ? <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-800 ring-1 ring-inset ring-teal-200">MVP first</span> : <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 ring-1 ring-inset ring-slate-200">Supported</span>}</li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-slate-500">All four must work. ChatGPT and Copilot are built, tested and polished first.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="font-semibold">Two reply levels</h2>
              <p className="mt-2 text-slate-600"><span className="font-medium text-slate-800">Text reply:</span> every assistant shows this. Program summary, link and PDF. Confirm cards fall back to a typed yes or no.</p>
              <p className="mt-2 text-slate-600"><span className="font-medium text-slate-800">Inline card:</span> an interactive card for assistants that support the MCP Apps standard. Others fall back to the text reply.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-600">
              <h2 className="font-semibold text-slate-900">No patient details</h2>
              <p className="mt-2">Programs have a name you pick, like "Knee OA, week 1", and a code. Nothing that identifies a patient is sent to the assistant or stored.</p>
            </div>
          </aside>
        </div>
      </div>

      {preview && <WebPreview onClose={() => setPreview(false)} />}
    </div>
  );
};

const LinkText = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a href={href} onClick={(e) => e.preventDefault()} className="break-all font-medium text-indigo-700 underline decoration-indigo-300 underline-offset-2 hover:decoration-indigo-700">{children}</a>
);

const TextReply = () => (
  <div className="space-y-3">
    <p>Published. <span className="font-semibold">Knee rehab, week 1</span> is live:</p>
    <ol className="list-decimal space-y-1 pl-5">
      {PROGRAM.map((p) => <li key={p.name}><span className="font-medium">{p.name}</span>, {p.dose}</li>)}
    </ol>
    <p><span className="font-medium">Share link:</span> <LinkText href={LINK}>{LINK}</LinkText><br /><span className="text-slate-500">The link expires in 1 year, on Oct 23, 2027, your default. I can change that to any date from tomorrow, or never.</span></p>
    <p><span className="font-medium">PDF:</span> anyone with the link can save the program as a PDF from the link page.</p>
    <p>Want me to change sets, reps or notes? Changes save as a draft right away, and I'll ask before publishing.</p>
  </div>
);

const CardReply = () => {
  const [copied, setCopied] = useState(false);
  const [opened, setOpened] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <p>Published. Here's <span className="font-semibold">Knee rehab, week 1</span>.</p>
      <div className="max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-xs text-slate-500">
          <span className="flex h-5 w-5 items-center justify-center rounded bg-teal-700 text-[10px] font-bold text-white">D</span>
          Physio library app
          <span className="ml-auto">PRG-7K3Q</span>
        </div>
        <div className="px-4 pb-2 pt-4">
          <div className="text-base font-semibold text-slate-900">Knee rehab, week 1</div>
          <div className="text-xs text-slate-500">4 exercises · Published · Link expires in 1 year (Oct 23, 2027)</div>
        </div>
        <ul className="divide-y divide-slate-100 px-4">
          {PROGRAM.map((p) => (
            <li key={p.name} className="flex items-center gap-3 py-2.5">
              <Thumb pose={p.pose} />
              <span className="flex-1 text-sm font-medium text-slate-800">{p.name}</span>
              <span className="text-right text-xs font-medium text-slate-600 sm:text-sm">{p.dose}</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2 border-t border-slate-100 p-3">
          <button type="button" onClick={() => setOpened('Opening the share link')} className={cx('rounded-lg bg-teal-700 px-3.5 py-2 text-sm font-semibold text-white hover:bg-teal-800', focus)}>Open link</button>
          <button type="button" onClick={() => setOpened('Saving Knee rehab, week 1.pdf from the link page')} className={cx('rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50', focus)}>Save as PDF</button>
          <button type="button" onClick={() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }} className={cx('rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50', focus)}>{copied ? 'Copied' : 'Copy link'}</button>
        </div>
        {opened && <div className="border-t border-slate-100 bg-teal-50 px-4 py-2 text-xs text-teal-800" role="status">{opened}...</div>}
      </div>
      <p className="max-w-xl text-xs leading-relaxed text-slate-500">Inline card works in assistants that support MCP Apps, such as Claude, ChatGPT and Microsoft 365 Copilot. Others, including Grok for now, show the text reply.</p>
    </div>
  );
};

const Li = ({ children }: { children: React.ReactNode }) => <li>{children}</li>;
const REPLIES: Record<string, React.ReactNode> = {
  'routine-draft': (
    <div className="space-y-3">
      <p>I found 2 routines for knee arthritis:</p>
      <ol className="list-decimal space-y-1 pl-5">
        <li><span className="font-medium">Knee osteoarthritis, starter</span>, v3, 5 exercises, used 31 times <span className="text-slate-500">(I used this one)</span></li>
        <li><span className="font-medium">Knee replacement, weeks 2 to 6</span>, v2, after surgery</li>
      </ol>
      <p>I made a separate copy called <span className="font-semibold">Knee OA, week 1</span> (code <span className="font-semibold">PRG-6T2P</span>). It saved automatically as a draft:</p>
      <ol className="list-decimal space-y-1 pl-5">{KNEE_OA.map((p) => <li key={p.name}><span className="font-medium">{p.name}</span>, {p.dose}{'changed' in p && <span className="text-slate-500"> ({p.changed})</span>}</li>)}</ol>
      <p>Later edits to the routine won't change this program. It isn't live yet. To get a link to send, please confirm below.</p>
    </div>
  ),
  'routine-published': (
    <div className="space-y-3">
      <p>Published <span className="font-semibold">Knee OA, week 1</span> (PRG-6T2P). Send this link:</p>
      <p><LinkText href={LINK2}>{LINK2}</LinkText><br /><span className="text-slate-500">It expires in 1 year, on Oct 23, 2027, your default.</span></p>
      <p>To change just this patient's copy later, ask me for PRG-6T2P or Knee OA, week 1, or find it in Programs in the web app.</p>
    </div>
  ),
  'routine-kept': <p>Okay, nothing is published. <span className="font-semibold">Knee OA, week 1</span> (PRG-6T2P) stays as a draft in your Programs, already saved. Ask me to publish it when you're ready.</p>,
  'build-draft': (
    <div className="space-y-3">
      <p>I built <span className="font-semibold">Knee rehab, week 1</span> from your approved exercises. It saved automatically as a draft:</p>
      <ol className="list-decimal space-y-1 pl-5">{PROGRAM.map((p) => <li key={p.name}><span className="font-medium">{p.name}</span>, {p.dose}</li>)}</ol>
      <p>It isn't live yet. To get a link to send, it needs to be published. Please confirm below.</p>
    </div>
  ),
  'build-kept': <p>Okay, nothing is published. <span className="font-semibold">Knee rehab, week 1</span> stays as a draft in your Programs, already saved. Ask me to publish it when you're ready.</p>,
  read: (
    <div className="space-y-3">
      <p><span className="font-semibold">Hip strength, phase 2</span> (PRG-2M8D) has 4 exercises. It was made from the routine <span className="font-semibold">Hip osteoarthritis, mobility and strength</span> (v2), then tweaked:</p>
      <ol className="list-decimal space-y-1 pl-5">{HIP.map(([n, d]) => <li key={n}><span className="font-medium">{n}</span>, {d}</li>)}</ol>
      <p><span className="font-medium">Live:</span> yes. Published Oct 23, 2026. The link never expires.<br /><span className="font-medium">Draft changes:</span> none. Your patient sees exactly this.</p>
      <p className="text-slate-500">Changes to this program affect only this patient's copy. The routine stays the same.</p>
    </div>
  ),
  'edit-saved': (
    <div className="space-y-3">
      <p>Saved automatically as a draft for <span className="font-semibold">Knee rehab, week 1</span>:</p>
      <ol className="list-decimal space-y-1 pl-5">
        <Li><span className="font-medium">Wall sit</span>, 3 x 45s hold <span className="text-slate-500">(moved to the top, was 30s)</span></Li>
        <Li><span className="font-medium">Heel slides</span>, 3 x 10</Li>
        <Li><span className="font-medium">Clamshell</span>, 3 x 10 <span className="text-slate-500">(added)</span></Li>
        <Li><span className="font-medium">Terminal knee extension</span>, 3 x 15, light band</Li>
      </ol>
      <p className="text-slate-500">Removed: Straight leg raise.</p>
      <p>This isn't live yet. Your patient still sees the version published Oct 24, 2:10 PM on <LinkText href={LINK}>{LINK}</LinkText>.</p>
    </div>
  ),
  'edit-published': (
    <div className="space-y-3">
      <p>Published. Your patient now sees the new <span className="font-semibold">Knee rehab, week 1</span> on the same link:</p>
      <p><LinkText href={LINK}>{LINK}</LinkText><br /><span className="text-slate-500">No need to send a new link.</span></p>
    </div>
  ),
  'edit-kept': <p>Okay, I didn't publish. The changes are already saved as a draft, and the link still shows the version from Oct 24, 2:10 PM. You can publish here or in the web app.</p>,
  expiry: (
    <div className="space-y-3">
      <p>Done. The share link for <span className="font-semibold">Knee rehab, week 1</span> now expires on <span className="font-semibold">Dec 15, 2026</span>.</p>
      <p className="text-slate-500">I can set any date from tomorrow, with no latest date, or make it never expire.</p>
    </div>
  ),
  'delete-ask': <p><span className="font-semibold">Hip strength, phase 2</span> (PRG-2M8D) has 4 exercises and an open share link. Deleting it closes that link. Please confirm below.</p>,
  'delete-done': (
    <div className="space-y-3">
      <p>Deleted <span className="font-semibold">Hip strength, phase 2</span> and closed its share link. Anyone who opens it sees "This link was closed".</p>
      <p>You can restore it from Recently deleted in the web app until <span className="font-semibold">Nov 23, 2026</span>. The old link stays closed after a restore.</p>
    </div>
  ),
  'delete-kept': <p>Okay, I kept <span className="font-semibold">Hip strength, phase 2</span>. Nothing changed, and its link still works.</p>,
};

const CONFIRMS: Record<ConfirmId, { title: string; lines: string[]; yes: string; no: string; danger?: boolean }> = {
  'publish-build': { title: 'Publish Knee rehab, week 1?', lines: ['Creates the share link. Anyone with it sees this version.', 'Expires in 1 year (Oct 23, 2027), your default.'], yes: 'Publish', no: 'Not yet' },
  'publish-routine': { title: 'Publish Knee OA, week 1?', lines: ['A separate copy of Knee osteoarthritis, starter, v3. Later routine edits won\'t change it.', 'Code PRG-6T2P. Creates the share link.', 'Expires in 1 year (Oct 23, 2027), your default.'], yes: 'Publish', no: 'Not yet' },
  'publish-edit': { title: 'Publish changes to Knee rehab, week 1?', lines: ['Wall sit to the top, 3 x 45s hold', 'Added Clamshell, 3 x 10', 'Removed Straight leg raise', 'Your patient sees this on the same link right away.'], yes: 'Publish', no: 'Not yet' },
  delete: { title: 'Delete Hip strength, phase 2?', lines: ['PRG-2M8D, 4 exercises. It moves to Recently deleted.', 'Closes its share link, so anyone who opens it sees "This link was closed".', 'You can restore it in the web app for 30 days.'], yes: 'Delete program', no: 'Keep it', danger: true },
};

const ConfirmCard = ({ id, decision, onDecide }: { id: ConfirmId; decision: Decision; onDecide: (d: Decision) => void }) => {
  const c = CONFIRMS[id];
  return (
    <div className={cx('max-w-xl overflow-hidden rounded-2xl border bg-white shadow-sm', c.danger ? 'border-red-200' : 'border-slate-200')} role="group" aria-label={c.title}>
      <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-xs text-slate-500">
        <span className="flex h-5 w-5 items-center justify-center rounded bg-teal-700 text-[10px] font-bold text-white">D</span>
        Physio library app · Needs your OK
      </div>
      <div className="px-4 py-3">
        <div className="text-base font-semibold text-slate-900">{c.title}</div>
        <ul className="mt-1.5 space-y-1 text-sm text-slate-600">{c.lines.map((l) => <li key={l} className="flex gap-2"><span aria-hidden className="text-slate-400">•</span>{l}</li>)}</ul>
      </div>
      {decision ? (
        <div className={cx('border-t px-4 py-2.5 text-sm font-medium', decision === 'yes' ? (c.danger ? 'border-red-100 bg-red-50 text-red-800' : 'border-teal-100 bg-teal-50 text-teal-900') : 'border-slate-100 bg-slate-50 text-slate-600')} role="status">
          {decision === 'yes' ? `You confirmed: ${c.yes}` : `You chose: ${c.no}`}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 border-t border-slate-100 p-3">
          <button type="button" onClick={() => onDecide('yes')} className={cx('min-h-11 rounded-lg px-4 text-sm font-semibold text-white', focus, c.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-teal-700 hover:bg-teal-800')}>{c.yes}</button>
          <button type="button" onClick={() => onDecide('no')} className={cx('min-h-11 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50', focus)}>{c.no}</button>
        </div>
      )}
    </div>
  );
};

const NotFoundReply = ({ onOpen }: { onOpen: () => void }) => (
  <div className="space-y-3">
    <p><span className="font-semibold">{MISSING}</span> isn't in your exercise library yet, and I can't create new exercises from here.</p>
    <p>You can request it in the web app. The search is already filled in:</p>
    <button type="button" onClick={onOpen} className={cx('flex w-full max-w-xl items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-indigo-300 hover:bg-indigo-50/40', focus)}>
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-indigo-700 ring-1 ring-slate-200">
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="9" r="6" /><path d="M14 14l4 4" strokeLinecap="round" /></svg>
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-slate-900">Search "{MISSING}" in the web app</span>
        <span className="block break-all text-xs text-indigo-700">{SEARCH_URL}</span>
      </span>
    </button>
    <p>Once a practitioner approves it, ask me again and I'll add it to Knee rehab, week 1. The rest of the program is unchanged.</p>
  </div>
);

const WebPreview = ({ onClose }: { onClose: () => void }) => {
  const [note, setNote] = useState('');
  const [requested, setRequested] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 animate-in fade-in sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Web app preview">
      <div className="w-full max-w-2xl overflow-hidden rounded-t-2xl bg-white shadow-2xl animate-in slide-in-from-bottom-4 sm:rounded-2xl">
        <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
          <span className="rounded bg-indigo-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-indigo-700">Concept</span>
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-500">{SEARCH_URL}</span>
          <button type="button" onClick={onClose} className={cx('rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-200', focus)} aria-label="Close preview">Close</button>
        </div>
        <div className="p-5 sm:p-7" style={{ fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}>
          <div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-700 text-xs font-bold text-white">D</span><span className="text-sm font-semibold">Didi Physio, Library</span><span className="ml-auto text-xs text-slate-500">Signed in as Kojo</span></div>
          <div className="mt-5 rounded-lg border border-slate-200 px-3 py-2.5 text-sm">{MISSING}</div>
          {requested ? (
            <div className="mt-5 rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm">
              <div className="font-semibold text-teal-900">Requested: {MISSING}</div>
              <p className="mt-1 text-teal-900/80">The AI is drafting it now. Every practitioner can see it in Requests and drafts, and any of them can approve it.</p>
            </div>
          ) : (
            <div className="mt-5 rounded-xl border border-dashed border-slate-300 p-4">
              <div className="text-sm font-semibold">No exercises match "{MISSING}"</div>
              <label htmlFor="pv-note" className="mt-3 block text-sm font-medium">Note for the AI <span className="font-normal text-slate-500">(optional)</span></label>
              <input id="pv-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: rehab version, supine" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20" />
              <button type="button" onClick={() => setRequested(true)} className={cx('mt-4 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800', focus)}>Request it</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
