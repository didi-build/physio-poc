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

### Failed-save strings (Designer pick, DIDI-1273)

**Designer pick** ([DIDI-1273](https://linear.app/didi-build/issue/DIDI-1273) comment `abb34765`, corrected one-liners in comment `beb059a5` Nov 21, 2026, CTO ruling `0ca2d594` on DIDI-594): same **7e4a9711** failed-save alert as above: one semibold line ending **Try again.** (words in the sentence), plus a separate **Try again** button. No secondary **Check your connection, then try again.** on these alerts (that line is for list and item **load** banners only).

| Screen | Action | Alert |
| -- | -- | -- |
| Exercise library | Regenerate media (confirm) | Couldn't regenerate the images. Try again. |
| Exercise library | Restore this version | Couldn't restore this version. Try again. |
| Exercise library | Merge (confirm) | Couldn't merge the exercises. Try again. |
| Routines | Draft autosave | Couldn't save the draft. Try again. |
| Routines | Publish now (community publish) | Couldn't publish the routine. Try again. |
| Routines | Discard draft | Couldn't discard the draft. Try again. |
| Routines | Use version N (adopt community on saved copy) | Couldn't switch to this version. Try again. |
| Routines | Restore this version | Couldn't restore this version. Try again. |
| Programs | Builder autosave | Couldn't save the program. Try again. |
| Programs | Publish or republish | Couldn't publish the program. Try again. |
| Programs | Restore from Recently deleted | Couldn't restore the program. Try again. |
| Programs | Remove exercise row from builder | Couldn't remove the exercise. Try again. |
| Programs | Save per-program expiry (Publish or share sheet) | Couldn't save the link expiry. Try again. |
| Requests and drafts | Submit request | Couldn't submit the request. Try again. |
| Requests and drafts | Draft review edits | Couldn't save your edits. Try again. |
| Requests and drafts | Approve | Couldn't approve the draft. Try again. |
| Requests and drafts | Discard or dismiss draft | Couldn't discard the draft. Try again. |
| My defaults | Save share-link default | Couldn't save your default. Try again. |
| My defaults | Save exercise-type default row | Couldn't save your default. Try again. |

**Couldn't regenerate the images. Try again.** covers only a failed regenerate **request**. It does not replace [DIDI-1210](https://linear.app/didi-build/issue/DIDI-1210) G2 (**The AI couldn't make the images. The text is kept.**) or the daily-limit copy on that flow.

Success copy on My defaults remains **Saved your {t} default** (`design/app/settings-link-expiry/spec.md`).

### Failed-save mapping

Per DIDI-594 lock `fed76bfb` ("change the wording so it matching the error"), use lock `7e4a9711` only when the action truly matches. Use the **Failed-save strings (Designer pick, DIDI-1273)** table for every other listed action.

#### Mapped actions (lock `7e4a9711` one-liner format)

| Screen | Action (from feature specs) | Alert (lock `7e4a9711`) |
| -- | -- | -- |
| Exercise library | Save as version N+1 (Edit for everyone) | Couldn't save the exercise. Try again. |
| Exercise library | Edit my copy save | Couldn't save the exercise. Try again. |
| Exercise library | Remove from My exercises | Couldn't remove the exercise. Try again. |
| Exercise library | Use library version (field conflict) | Couldn't switch to the library version. Try again. |
| Exercise library | Keep mine (field conflict) | Couldn't keep your version. Try again. |
| Routines | Edit for everyone save | Couldn't save the routine. Try again. |
| Routines | Edit my copy save | Couldn't save the routine. Try again. |
| Routines | Remove from My routines | Couldn't remove the routine. Try again. |
| Routines | Keep mine (decline community update) | Couldn't keep your version. Try again. |
| Programs | Delete program (confirm) | Couldn't remove the program. Try again. |

All other actions in the feature specs use the matching row in **Failed-save strings (Designer pick, DIDI-1273)**.

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

**Designer pick** ([DIDI-1080](https://linear.app/didi-build/issue/DIDI-1080) comment `6e041ed6`): On **list load error** and **item load error** banners only, the approved secondary line **Check your connection, then try again.** appears as a second line in the banner body under the semibold primary line (`font-normal`, same amber-900). **Refresh failure** uses only **Couldn't refresh. You're seeing what loaded earlier.** (no secondary line). Mockups 02 and 04 include both load-error lines; mockup 03 does not.

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
| Message | One semibold line (includes **Try again.** as words), from the `7e4a9711` table or the DIDI-1273 table |
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
| Failed save errors | No shared strings in design specs | Four `7e4a9711` one-liners plus 19 DIDI-1273 one-liners (`abb34765`, corrected `beb059a5`); [DIDI-1094](https://linear.app/didi-build/issue/DIDI-1094) depends on them |

## Changes

- **Nov 21, 2026**: DIDI-1080. Option C approved; strings locked `fed76bfb` and `7e4a9711`; variant lock `2bdbb75b`. Blocks [DIDI-1082](https://linear.app/didi-build/issue/DIDI-1082) until merged. https://linear.app/didi-build/issue/DIDI-1080
- **Nov 21, 2026**: Designer picks recorded on [DIDI-1080](https://linear.app/didi-build/issue/DIDI-1080) comment `6e041ed6` (My defaults scope, banner layout, failed-save placement). Refresh vs list load rule is lock `2bdbb75b`, not a Designer pick.
- **Nov 21, 2026**: QA R1 fixes. Narrow failed-save mapping; Open rows for non-matching actions (`6e041ed6`). Recaptured mockups (390 / 1280, DIDI-1173 nav, banner secondary line, item loading). https://github.com/didi-build/physio-poc/pull/144#pullrequestreview-6003519268
- **Nov 21, 2026**: Follow-up after merge `2a2b3ca`. Failed-save strings for 19 actions ([DIDI-1273](https://linear.app/didi-build/issue/DIDI-1273) comment `abb34765`, CTO `0ca2d594`). Mockup R2: hide preview chrome, refresh banner single line. https://linear.app/didi-build/issue/DIDI-1080
- **Nov 21, 2026**: [DIDI-1273](https://linear.app/didi-build/issue/DIDI-1273) comment `beb059a5`: failed-save Designer picks use **7e4a9711** one-line alerts only (no load-error secondary line). QA R1 on https://github.com/didi-build/physio-poc/pull/149

