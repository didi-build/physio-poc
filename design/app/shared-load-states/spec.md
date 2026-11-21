# Shared loading, load-error, refresh, not-found and failed-save states

Area: app · Feature: shared-load-states

## Purpose

One shared pattern for every Physio list and detail surface at first load, reload, missing item, and failed save. Applies to **Exercises**, **Routines**, **Programs**, **Requests and drafts**, and **My defaults** (list surfaces only where noted below). Dev wires this in [DIDI-1082](https://linear.app/didi-build/issue/DIDI-1082) after this spec merges. Failed-save strings unblock [DIDI-1094](https://linear.app/didi-build/issue/DIDI-1094). Patient share link load and error treatment is [DIDI-1270](https://linear.app/didi-build/issue/DIDI-1270) and is out of scope here.

**Matches Product direction: yes.** Checked against [DIDI-594](https://linear.app/didi-build/issue/DIDI-594) on Nov 21, 2026, including the Hard rule (no patient information in user-facing error copy).

## Design source (approved Nov 21, 2026)

| Choice | MagicPath link | Component id | Revision |
| -- | -- | -- | -- |
| **C. Keep the page, banner with Try again** (final) | https://designs.magicpath.ai/v1/gladly-room-2758 | 466879036132560896 | 466879036132560897 |

MagicPath project: DIDI-1080 Physio loading and load-error states (466877428799770624). Source: `LoadStatesCore.tsx` / `OptionCKeepThePageBannerWithTryAgain.tsx`, revision `466879036132560897`. Mockups are full-frame page captures at 390 px (phone) and 1280 px (desktop), without MagicPath preview controls, with nav matching DIDI-1173 (three primary tabs; Requests only in the account dropdown). Content column `max-w-3xl` (768 px) centred inside the shared `max-w-6xl` gutter from [design/README.md](../../README.md).

### Approvals (Diadem, Designer chat, ET)

**Nov 21, 2026, 12:49 AM**, verbatim (CTO lock `2bdbb75b` on DIDI-594): "didn't link option B . loading error option C"

**Nov 21, 2026, 12:52 AM**, verbatim (CTO lock `fed76bfb` on DIDI-594): "approve, don't quietly retry, yes it will cover failed saves, but change the wording so it matching the error, share link page will get its own ticket."

**Nov 21, 2026, 12:53 AM**, verbatim (CTO lock `7e4a9711` on DIDI-594): "approve" (failed-save strings).

**Nov 21, 2026, 12:58 AM**, verbatim standing rule (CTO lock `a887af34` on DIDI-594): "going forward please pick something reasonable. only ask me if it's a true product decision that you are unsure about"

## Locked behaviour

| Topic | Rule |
| -- | -- |
| Variant | **Option C only.** Keep page chrome (nav, headings where applicable). Report load and refresh failures in an amber banner with **Try again**. Do not ship option A (quiet skeleton with specific inline errors), option B (spinner with text, one generic error), or baseline (blank error slot). Exploration labels: DIDI-1080 ticket comment `b147c7e1`. |
| Retry | **No automatic retry.** Retry runs only when the user taps **Try again**. On failure after retry, focus stays on **Try again** (button stays disabled with **Trying again...** while the request runs). |
| Initial list load error | Heading stays visible. Amber banner with list strings and **Try again**. Content below may show skeleton placeholders (see mockups). |
| Refresh failure after content loaded | Previously loaded content **stays on screen**. Banner: "Couldn't refresh. You're seeing what loaded earlier." with **Try again**. |
| Item load error | **Back to {list}** link above the banner (same label as not-found). Amber banner with item load strings and **Try again**. |
| Not found | **No retry.** Card with title and helper lines; primary action **Back to {list}** button only. |
| Failed save | Short inline **alert** (`role="alert"`) with the approved one-line message and a separate **Try again** button (same retry behaviour as banners). Not the list refresh banner. |
| Copy | No patient information, status codes, or server error details in any string. |
| Layout | Mobile first at 390 px; at 1280 px the state UI lives in the same centred column (max 768 px) as other app pages. |
| Refresh vs list load error | One rule on every surface (option C, DIDI-594 lock `2bdbb75b`): If the screen already shows data, keep that data and show the refresh-failure banner. If nothing is on screen yet, show the initial list load error. Item surfaces use the same rule for their body (loaded item vs empty skeleton). |
| My defaults | **Designer pick** ([DIDI-1080](https://linear.app/didi-build/issue/DIDI-1080) comment `6e041ed6`): List states only: loading and list load error (plus refresh failure when settings were already visible). No not-found or item-load states; it is a single settings surface, not a library list with detail routes. |

### `{list}` and `{item}` tokens

| Surface | `{list}` | `{item}` | Page heading (context) |
| -- | -- | -- | -- |
| Exercises | exercises | exercise | Exercise library |
| Routines | routines | routine | Routines |
| Programs | programs | program | Programs |
| Requests and drafts | requests and drafts | draft | Requests and drafts |
| My defaults | your defaults | (not used; no item routes) | My defaults |

**Back to {list}** visible labels use the table (for example **Back to exercises**). Screen reader phrasing may use the same words.

## Locked strings (DIDI-594 lock `fed76bfb`)

### Loading

| Role | String |
| -- | -- |
| Visible (list surfaces) | Loading {list}... |
| Visible (item surfaces) | (no extra visible line; skeleton only under back link when the heading is hidden) |
| Screen reader (`role="status"`) | Loading {list} or Loading {item} |
| Live region | Skeleton placeholders are `aria-hidden`. Container uses `aria-busy` while loading or retrying. |

### List load error

| String |
| -- |
| Couldn't load {list}. |
| Check your connection, then try again. |

### Item load error

| String |
| -- |
| Couldn't load this {item}. |
| Check your connection, then try again. |
| Back to {list} (navigation link above banner) |

### Retry control

| State | Label |
| -- | -- |
| Idle | Try again |
| In flight | Trying again... (button `disabled`) |

### Refresh failure

| String |
| -- |
| Couldn't refresh. You're seeing what loaded earlier. |

### Not found

| String |
| -- |
| This {item} isn't available. |
| {type-specific helper}, then **Back to {list}** button |

| `{item}` | Helper line (verbatim) |
| -- | -- |
| exercise | It may have been merged into another exercise. |
| program | It may have been deleted. Deleted programs stay in Recently deleted for 30 days. |
| draft | It may have been approved or discarded. Approved exercises are in My exercises. |
| routine | It may have been deleted. |

### Failed save (DIDI-594 lock `7e4a9711`; wording for DIDI-1094)

Each line is one alert. **{item}** uses the noun only (exercise, routine, program, draft). **Try again** is both the trailing words in the sentence and the button label.

| String |
| -- |
| Couldn't save the {item}. Try again. |
| Couldn't remove the {item}. Try again. |
| Couldn't switch to the library version. Try again. |
| Couldn't keep your version. Try again. |

Last two lines use fixed wording (library exercise field conflict), not `{item}`.

### Failed-save mapping by action type

Per DIDI-594 lock `fed76bfb` ("change the wording so it matching the error") and Designer response to QA R1 on [DIDI-1080](https://linear.app/didi-build/issue/DIDI-1080) comment `6e041ed6`, map the four locked strings (`7e4a9711`) only when the action truly matches. Map by **action type**; developer maps any new action by type once wording exists. No new strings in this spec.

| Action type | Alert string |
| -- | -- |
| Save or edit | Couldn't save the {item}. Try again. |
| Delete or remove | Couldn't remove the {item}. Try again. |
| Switch to the library version | Couldn't switch to the library version. Try again. |
| Keep your own version | Couldn't keep your version. Try again. |

#### Mapped actions (locked strings apply)

| Screen | Action (from feature specs) | Action type | `{item}` when used |
| -- | -- | -- | -- |
| Exercise library | Save as version N+1 (Edit for everyone) | Save or edit | exercise |
| Exercise library | Edit my copy save | Save or edit | exercise |
| Exercise library | Remove from My exercises | Delete or remove | exercise |
| Exercise library | Use library version (field conflict) | Switch to the library version | (fixed string) |
| Exercise library | Keep mine (field conflict) | Keep your own version | (fixed string) |
| Routines | Edit for everyone save | Save or edit | routine |
| Routines | Edit my copy save | Save or edit | routine |
| Routines | Remove from My routines | Delete or remove | routine |
| Routines | Keep mine (decline community update) | Keep your own version | (fixed string) |
| Programs | Delete program (confirm) | Delete or remove | program |

#### Open: needs Diadem (no string in this spec)

| Screen | Action | Why open |
| -- | -- | -- |
| Exercise library | Regenerate media (confirm) | Not a save; conflicts with DIDI-1210 image-failure copy |
| Exercise library | Restore this version | Locked save string does not match restore |
| Exercise library | Merge (confirm) | Locked save string does not match merge |
| Routines | Draft autosave | Wording not approved for autosave failure |
| Routines | Publish now (community publish) | Publish is not the same as save in copy |
| Routines | Discard draft | Remove string does not match discard |
| Routines | Use version N (adopt community on saved copy) | Not switch or save as locked |
| Routines | Restore this version | Locked save string does not match restore |
| Programs | Builder autosave | Wording not approved (programs spec still has its own save-failure block until wired) |
| Programs | Publish / republish | Publish is not the same as save in copy |
| Programs | Restore from Recently deleted | Locked save string does not match restore |
| Programs | Remove exercise row from builder | Wording not approved |
| Programs | Save per-program expiry (Publish or share sheet) | Wording not approved |
| Requests and drafts | Submit request | Not approved |
| Requests and drafts | Draft review edits | Not approved |
| Requests and drafts | Approve | Approve is not save |
| Requests and drafts | Discard or dismiss draft | Wording not approved |
| My defaults | Save share-link default | Success copy is already **Saved your … default**; failure string not approved |
| My defaults | Save exercise-type default row | Same as above |

## Layout and accessibility (option C)

From revision `466879036132560897` (`LoadStatesCore.tsx`, variant `C`).

### Loading (list)

| Element | Treatment |
| -- | -- |
| Heading | Page `h1` unchanged |
| Progress | Full-width `h-1` rounded track, teal pulse segment (`aria-hidden`) |
| Visible status | `p` with `role="status"`: Loading {list}... |
| Skeleton list | `ul` `aria-hidden`, rounded rows with image and text placeholders |

### Amber banner (list error, refresh error, item error)

| Element | Classes / attrs |
| -- | -- |
| Container | `role="alert"`; `rounded-2xl border border-amber-200 bg-amber-50 p-3`; flex row |
| Icon | Alert triangle, `text-amber-700`, `aria-hidden` |
| Primary text | `text-sm font-semibold text-amber-900` |
| **Try again** | Ghost-style control on the right; min height 44 px; teal text |

**Designer pick** ([DIDI-1080](https://linear.app/didi-build/issue/DIDI-1080) comment `6e041ed6`): The approved secondary line **Check your connection, then try again.** appears as a second line in the banner body under the semibold primary line (`font-normal`, same amber-900). MagicPath revision `466879036132560897` shows only the primary line in the banner; build and mockups 02 and 04 include both lines.

### Not found

| Element | Treatment |
| -- | -- |
| Container | White card `rounded-2xl border border-slate-200 p-5` |
| Title | `h1` This {item} isn't available. |
| Helper | `text-sm text-slate-600` type-specific line |
| **Back to {list}** | Secondary button styling (`min-h-11`, bordered, teal text) |

### Failed save alert

| Element | Treatment |
| -- | -- |
| Container | `role="alert"`; amber panel matching banner colours, compact padding |
| Message | One semibold line (includes **Try again** as words) |
| **Try again** button | Bordered secondary button, same retry behaviour as banners |

**Designer pick** ([DIDI-1080](https://linear.app/didi-build/issue/DIDI-1080) comment `6e041ed6`): Failed-save alert layout follows mockup `06-failed-save`; placement is directly under the screen or sheet title on whichever surface triggered the save.

## States (mockups)

Exercises screen is the canonical capture; the same patterns apply on the other surfaces with tokens from the table above.

| # | State | What it shows |
| -- | -- | -- |
| 01 | loading | Heading, progress sliver, Loading exercises..., skeleton list |
| 02 | list error | Heading, banner, skeleton rows, **Try again** |
| 03 | refresh error | Heading, banner, **previous list content visible**, **Try again** |
| 04 | item error | **Back to exercises**, banner, placeholder detail region |
| 05 | not found | **Back to exercises**, card with not-found copy, **Back to exercises** button |
| 06 | failed save | Full page with nav chrome; edit surface with save alert (routine sample) |
| 07 | item loading | **Back to exercises**, skeleton only; screen reader **Loading exercise** (no visible loading line) |

| # | Phone | Desktop |
| -- | -- | -- |
| 01 loading | [phone](mockups/01-loading-phone.png) | [desktop](mockups/01-loading-desktop.png) |
| 02 list error | [phone](mockups/02-list-error-phone.png) | [desktop](mockups/02-list-error-desktop.png) |
| 03 refresh error | [phone](mockups/03-refresh-error-phone.png) | [desktop](mockups/03-refresh-error-desktop.png) |
| 04 item error | [phone](mockups/04-item-error-phone.png) | [desktop](mockups/04-item-error-desktop.png) |
| 05 not found | [phone](mockups/05-not-found-phone.png) | [desktop](mockups/05-not-found-desktop.png) |
| 06 failed save | [phone](mockups/06-failed-save-phone.png) | [desktop](mockups/06-failed-save-desktop.png) |
| 07 item loading | [phone](mockups/07-item-loading-phone.png) | [desktop](mockups/07-item-loading-desktop.png) |

## Locked Product direction (verbatim from DIDI-594)

> **Hard rule:** nothing stores patient information, in the web app, the MCP server, share links or PDFs. Programs are identified by our own id and an optional non-identifying title. If Kojo wants a patient name on it, he adds it after downloading, outside our system.

(Source: DIDI-594 MVP scope block; quoted in sibling specs.)

### Is / was (this feature)

| Topic | Was | Is |
| -- | -- | -- |
| Loading copy | Visual-only busy state; skeleton without visible loading text (`design/app/body-region-picker/spec.md`; empty slots in `src/ui/copy`) | Visible **Loading {list}...** plus screen reader status; skeleton `aria-hidden` |
| Load and refresh errors | Blank or undefined error slots in app code | Option C amber banner; exact strings in this spec |
| Retry | No spec (implicit gaps in feature specs) | Manual **Try again** only; **Trying again...** while in flight; focus kept on failure |
| Not found vs load error | Not distinguished in shared spec | Not found has no **Try again**; type-specific helpers |
| Failed save errors | No shared strings in design specs | Four locked alert strings; [DIDI-1094](https://linear.app/didi-build/issue/DIDI-1094) depends on them |

## Changes

- **Nov 21, 2026**: DIDI-1080. Option C approved; strings locked `fed76bfb` and `7e4a9711`; variant lock `2bdbb75b`. Blocks [DIDI-1082](https://linear.app/didi-build/issue/DIDI-1082) until merged. https://linear.app/didi-build/issue/DIDI-1080
- **Nov 21, 2026**: Designer picks on DIDI-594 `a887af34`: refresh vs list load error rule, My defaults scope, failed-save action-type mapping and known-actions table (no new strings).
- **Nov 21, 2026**: QA R1 fixes. Narrow failed-save mapping; Open rows for non-matching actions (`6e041ed6`). Recaptured mockups (390 / 1280, DIDI-1173 nav, banner secondary line, item loading). Cite `2bdbb75b` for refresh rule. https://github.com/didi-build/physio-poc/pull/144#pullrequestreview-6003519268
