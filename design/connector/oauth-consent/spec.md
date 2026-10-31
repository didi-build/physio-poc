# OAuth consent page (ChatGPT connector)

Area: connector · Feature: oauth-consent (consent page after Google sign-in, invalid-client and expired-request pages, sign-in page wordmark)

Target path: `design/connector/oauth-consent/spec.md`, with mockups in `design/connector/oauth-consent/mockups/`. Final apart from the open questions below; not yet in a PR.

## Purpose

When an AI assistant (ChatGPT first) asks to connect to Didi Physio's `/mcp` server, Kojo signs in with Google and then sees one page that asks him to allow or deny read-only access for that app. The app's name is self-reported and never shown as verified; the return address (redirect host) is the trust signal. If the app can't be identified, or the request is too old, Kojo sees a short page that explains it and offers "Go to Didi Physio". Kojo uses a phone, so every screen is designed at 390 px first.

**Matches Product direction: yes.** Checked against the live DIDI-594 description and comments on Oct 31, 2026 (read after the 2:28 to 2:35 AM ET answers): "Connector is read-only in V1", "Sign-in is Google, through Better Auth" and "OAuth consent page for the connector" (quoted under Locked Product direction below).

## Design source (Diadem's pick, Oct 31, 2026, 2:28 AM ET: "Go with C plus A's safety line")

Final designs (these are what the mockups and this spec follow):

| Component | MagicPath link | Component id | Final revision | Earlier revision (kept) |
| -- | -- | -- | -- | -- |
| Option C: Can and can't, final (consent, After Allow, After Deny, invalid client, expired) | https://designs.magicpath.ai/v1/bold-ground-7791 | 466932541740429312 | 467169139593728000 | 466932541740429313 |
| Sign-in with wordmark, final (MagicPath name still "Baseline: current sign-in chrome") | https://designs.magicpath.ai/v1/zealously-shadow-4992 | 466932531900592128 | 467169143641223168 | 466932531900592129 |

Source of the safety line only:

| Component | MagicPath link | Component id | Revision |
| -- | -- | -- | -- |
| Option A: Plain card | https://designs.magicpath.ai/v1/fine-month-4826 | 466935470203486208 | 466935470207680512 |

MagicPath project: "DIDI-1125 OAuth consent page", https://www.magicpath.ai/files/466932504247545856 (id 466932504247545856, private until sharing is turned on). The final revisions were made on Oct 31, 2026. They add only Diadem's Oct 31 decisions to option C and the sign-in page; the earlier revisions are unchanged. The final option C revision keeps a dashed "design preview control, not app UI" panel for switching states and name samples; it is not part of the page.

## Mockups

In `design/connector/oauth-consent/mockups/`. Phone is 390 px wide (2x), desktop is 1280 px wide (1x). Rendered from the final revisions above with the app's font stack (`Inter, ui-sans-serif, system-ui, sans-serif`, `src/ui/styles/shell.css`), with Inter loaded. Sample values: `{host}` = chatgpt.com, `{name}` = ChatGPT, `{email}` = kojo@example.com. No design preview controls in the renders.

| # | Screen | Phone | Desktop |
| -- | -- | -- | -- |
| 01 | Consent | 01-consent-phone.png | 01-consent-desktop.png |
| 02 | Consent, long app name (cut at 64 characters with an ellipsis) | 02-consent-long-name-phone.png | 02-consent-long-name-desktop.png |
| 03 | Sign-in with wordmark | 03-sign-in-phone.png | 03-sign-in-desktop.png |
| 04 | Invalid client | 04-invalid-client-phone.png | 04-invalid-client-desktop.png |
| 05 | Expired request | 05-expired-phone.png | 05-expired-desktop.png |
| 06 | After Allow | 06-after-allow-phone.png | 06-after-allow-desktop.png |
| 07 | After Deny | 07-after-deny-phone.png | 07-after-deny-desktop.png |

Long name sample: "ChatGPT Connector for Clinics and Practitioners Extended Edition 2026 Beta Build" (sample input, not copy). "Not you? Sign out" does nothing in the mockups because its destination is open question 1.

## Diadem's decisions (verbatim, CTO's chat, Oct 31, 2026, ET)

Quoted from CTO's DIDI-1125 comment 44795ea9 and the DIDI-594 locked block.

| # | Time | Diadem's words | What it means here |
| -- | -- | -- | -- |
| 1 | 2:28 AM | "Go with C plus A's safety line" | Option C's layout and copy, plus A's line "Only allow it if you just started connecting from {host}." |
| 2 | 2:29 AM | "Show the email with a Not you? Sign out link" | C's "Signed in as {email}", plus a "Not you? Sign out" link. Sign-out is in the consent flow's scope (DIDI-1126). |
| 3 | 2:29 AM | "Remember consent and skip the page on reconnect" | Consent is remembered; a reconnect with the same values skips the page. |
| 4 | 2:31 AM | "No staying connected line" | No line about staying connected, and no revoke control in V1. |
| 5 | 2:31 AM | "Add the wordmark to both the consent and sign-in pages" | The Didi Physio wordmark goes on the consent page (as in C) and on the sign-in page. |
| 6 | 2:34 AM | "hmm we can go further and say: no patient details are needed, stored or shared / although this is lengthy" | Considered, not chosen. |
| 6 | 2:34 AM | "Use: Didi Physio never stores or shares patient details." | The consent page carries the line "Didi Physio never stores or shares patient details." |
| 7 | 2:35 AM | "Keep the Go to Didi Physio button" | The invalid-client and expired pages keep "Go to Didi Physio". |

Also applied (not Diadem's Oct 31 words):
- No gallery component. physio-poc has no gallery step (Diadem, Oct 29, 2026, 2:59 PM ET: "for the physio-poc gallery components and preview. its ok; it shouldnt block the work. the reason is because this is a poc. i think once the whole system is set up we will do a redesign"). Recorded as a CTO decision in comment 44795ea9.
- CTO's technical rulings in DIDI-1125 comment a7182c50 (Oct 30, 2026), summarised under Behaviour.

## Screens and states

`{host}` is the redirect host, `{name}` is the app's self-reported name, `{email}` is the signed-in Google account. All three are runtime values rendered as plain text.

| Screen or state | What it shows |
| -- | -- |
| Sign-in (existing, changed) | The current sign-in card with the Didi Physio wordmark added at the top. The button "Sign in with Google" is unchanged. Shown first if Kojo isn't signed in when the app asks to connect. |
| Consent | Wordmark; "Request from {host}"; heading "Allow read-only access to Didi Physio?"; "The app calls itself" "“{name}”" with a "Self-reported" tag; "It can" list (3 items); "It can't" list (2 items); "Didi Physio never stores or shares patient details."; "Only allow it if you just started connecting from {host}."; buttons "Deny" and "Allow" side by side; "Signed in as {email}"; link "Not you? Sign out". |
| After Allow | Spinner, heading "Connected", "Taking you back to {host}.", then the browser goes back to the app. |
| After Deny | Spinner, heading "Not connected", "Nothing was shared. Taking you back to {host}.", then the browser goes back to the app. |
| Remembered consent | No page. A reconnect with the same app, return address and access goes straight back to the app. |
| Invalid client | Centred: wordmark, warning icon, heading "This app can't connect", body, next step in a grey box, button "Go to Didi Physio". No name, no host, no error code, no redirect. |
| Expired request | Centred: wordmark, clock icon, heading "This request has expired", body, next step in a grey box, button "Go to Didi Physio". No restart. |
| Not allowlisted (existing, unchanged) | An account that isn't allowlisted never reaches the consent page. The existing refusal page ("This Google account isn't allowed") is unchanged. |

## Key copy (exact final copy)

Consent page, in screen order:

| Element | Visible text | Source |
| -- | -- | -- |
| Wordmark | Didi Physio (with the teal "D" tile) | C |
| Host line | Request from {host} | C |
| Heading | Allow read-only access to Didi Physio? | C |
| Name line | The app calls itself “{name}” | C |
| Name tag | Self-reported | C |
| List heading | It can | C |
| It can, item 1 | Search your approved exercises | C |
| It can, item 2 | Search your routines | C |
| It can, item 3 | See your programs and their share links | C |
| List heading | It can't | C (typographic apostrophe in the source: It can’t) |
| It can't, item 1 | Create, edit, publish or delete anything | C |
| It can't, item 2 | For changes, it sends you a link to the right page here instead | C |
| Patient details line | Didi Physio never stores or shares patient details. | Diadem, 2:34 AM |
| Safety line | Only allow it if you just started connecting from {host}. | A, Diadem 2:28 AM |
| Buttons | Deny / Allow | C |
| Account line | Signed in as {email} | C |
| Sign-out link | Not you? Sign out | Diadem, 2:29 AM |

After Allow and After Deny:

| Element | Visible text | Source |
| -- | -- | -- |
| After Allow heading | Connected | C |
| After Allow body | Taking you back to {host}. | C |
| After Deny heading | Not connected | C |
| After Deny body | Nothing was shared. Taking you back to {host}. | C |

Invalid client and expired request:

| Element | Invalid client | Expired request | Source |
| -- | -- | -- | -- |
| Wordmark | Didi Physio | Didi Physio | C |
| Heading | This app can't connect | This request has expired | C |
| Body | The app asking to connect didn't identify itself in a way Didi Physio accepts, so nothing was shared. | Connection requests only last a short time, so this one was stopped. Nothing was shared. | C |
| Next step | Go back to the app and try connecting again. If it keeps happening, the app may not work with Didi Physio yet. | Go back to the app you were connecting and start again. | C |
| Button | Go to Didi Physio | Go to Didi Physio | C, Diadem 2:35 AM |

Sign-in page: wordmark "Didi Physio" (added, Diadem 2:31 AM) and the existing button "Sign in with Google" (src/ui/copy/sign-in.ts, unchanged).

Apostrophes in the MagicPath source are typographic (’) and the name is wrapped in curly quotes (“ ”). Keep them as in the source.

## Behaviour

From CTO's rulings (comment a7182c50, Oct 30, 2026) and Diadem's Oct 31 calls. Already built server-side in DIDI-1043 where noted.

- **Host:** one host, the redirect_uri host, because that's where the authorization code goes. Shown in ASCII (punycode), never Unicode. CIMD clients whose client_id host doesn't match the redirect host are rejected, so only one host is ever shown. DCR clients follow the same rule.
- **Name:** NFC-normalised; control, bidi and zero-width characters stripped; capped at 64 characters with an ellipsis; if it ends up empty, the host is shown in its place. Plain text only, never HTML. Never shown as verified in V1; the "Self-reported" tag is always shown. Server: `src/auth/mcp-oauth/sanitize-client-name.ts`.
- **Allow:** records consent and returns to the app with a code and `iss`. **Deny:** returns `access_denied` to the app. Both are POSTs with CSRF protection, bound to Kojo's session (DIDI-1126).
- **Remembered consent:** keyed on client_id, redirect_uri and scope set. A reconnect with the same values skips the page; any change shows it again (Diadem, 2:29 AM; keys from CTO).
- **No staying-connected line and no revoke control in V1** (Diadem, 2:31 AM). Removing Kojo's email from the allowlist cuts access (DIDI-1109).
- **Sign out:** "Not you? Sign out" signs out the current Google session (existing `/api/auth/sign-out`). Where Kojo lands afterwards is open (see Open questions).
- **Invalid client:** an unknown or unfetchable client_id, a malformed CIMD document, or a redirect_uri that doesn't exactly match a registered one. The page never redirects to an unvalidated redirect_uri and shows no error code in V1. Errors found after the redirect is validated (bad scope, missing or non-S256 PKCE) go back to the app as OAuth errors with no page.
- **Expiry:** a pending request lasts 10 minutes and is single use (`PHYSIO_MCP_PENDING_CONSENT_TTL_MS`). The expired page has no restart, because only the app can start a new request.
- **Go to Didi Physio:** opens the app home. If Kojo isn't signed in, the normal sign-in applies.
- **Clickjacking:** `Content-Security-Policy: frame-ancestors 'none'` and `X-Frame-Options: DENY` on the consent GET and on Allow and Deny (DIDI-1043, `src/auth/mcp-oauth/consent-frame-headers.ts`); DIDI-1126 keeps them.

## Accessible names and roles

Taken from the final option C source (revision 467169139593728000). Accessible names equal the visible text unless listed.

| Element | Accessible name or role |
| -- | -- |
| Consent card | A section named by the heading "Allow read-only access to Didi Physio?" |
| "It can" and "It can't" | Real lists; the eye and cross icons are hidden from screen readers |
| Self-reported tag | Visible text, read after the name |
| Deny, Allow | Buttons named by their visible text |
| Not you? Sign out | A link named by its visible text |
| After Allow, After Deny | A polite status message; the spinner is hidden from screen readers |
| Invalid client, expired request | An alert; the card is named by its heading; the icon is hidden from screen readers |
| Wordmark "D" tile | Hidden from screen readers; "Didi Physio" is read as text |

Browser tab title: not in any approved design. See PROPOSED strings.

## Layout

- Inside the existing sign-in chrome (`src/ui/styles/sign-in.css`): slate-50 page, centred white card, max width 24rem, 2rem padding, 1rem radius, faint shadow, teal pill buttons. 390 px first.
- Consent (from C): wordmark top left; "Request from {host}" (host in bold mono) above the heading; name line with tag; the two lists, each with a small uppercase heading; Deny and Allow in a two-column row (Deny outlined on the left, Allow teal on the right); account line centred below.
- Diadem's additions, placement (layout only, no new copy): the patient details line and A's safety line sit between the "It can't" list and the buttons, in that order, in small slate text as in A. "Not you? Sign out" is a teal text link on its own line under "Signed in as {email}", with a 44 px tap target.
- Invalid and expired (from C): everything centred; 56 px round icon (amber for invalid, slate for expired); next step in a grey rounded box; full-width "Go to Didi Physio".
- Sign-in: the same wordmark as the consent page at the top of the card, above "Sign in with Google".

## PROPOSED strings (not in the approved designs or Diadem's words)

| String | Where | Why it's needed |
| -- | -- | -- |
| PROPOSED: "Connect an app · Didi Physio" | Browser tab title for the consent, invalid-client and expired pages | Every page needs a title. Should follow the page-title pattern from DIDI-1114 once that is approved. |

No other new strings. Placement of the two added lines and the sign-out link is a layout proposal (above), not copy.

## Is/was: final option C (revision 467169139593728000) against the picked option C (revision 466932541740429313)

**Added**
- A's safety line "Only allow it if you just started connecting from {host}." (Diadem, 2:28 AM).
- The line "Didi Physio never stores or shares patient details." (Diadem, 2:34 AM).
- The link "Not you? Sign out" under "Signed in as {email}" (Diadem, 2:29 AM).
- The wordmark on the sign-in page (Diadem, 2:31 AM). C already had it on the consent and error pages.
- Name rules from CTO: 64-character cap with an ellipsis, host fallback when empty, punycode host.

**Removed**
- The two-line clamp on the name and its full-name tooltip (`title`), replaced by the 64-character server cap.
- "Design preview: back to consent" on the After Allow and After Deny screens.
- In the built page: everything marked "design preview control, not app UI" (the state switcher and the name samples "ChatGPT", "Fake badge", "Very long"). The final MagicPath revision keeps this panel for previewing only.
- The sample values `chatgpt.com` and `kojo@example.com`; they become `{host}` and `{email}`.

**Unchanged**
- All other C copy, order and styling, including the invalid and expired pages and the After Allow and After Deny screens.

**Considered and not used:** a staying-connected line (Diadem, 2:31 AM: "No staying connected line"); option B's "What does self-reported mean?" disclosure; A's heading and one-sentence access line.

## Open questions (not decided here)

1. **After Sign out** (CTO, DIDI-1126): where does Kojo land? Suggested: back to sign-in with the same pending request, so he can sign in with the right account within the 10 minutes. If the request has expired by then, he sees the expired page.
2. **Expired wording** (Diadem): CTO's a7182c50 said the expired page "just says to start again from ChatGPT". Option C, which Diadem picked, says "Go back to the app you were connecting and start again." and doesn't name ChatGPT, because the name is self-reported. This draft keeps C. Confirm.
3. **Placement** (Diadem): the patient details line and the safety line between the lists and the buttons, as described under Layout. Confirm.

## Locked Product direction (DIDI-594, quoted)

> **Connector is read-only in V1 (LOCKED, Oct 29, 2026, 7:26 PM ET).** 7:16 PM ET: "ok v1 connector can be read only , and any "write" use cases will send a link that opens the exact page that he needs to do the action on". 7:26 PM ET: "for v1 we will do read only tools". **Is:** every V1 connector tool is read-only (annotations readOnlyHint true, destructiveHint false, openWorldHint false). Any write use case (build or edit a program, publish, set expiry, close a link, delete) returns a deep link that opens the exact web app page where Kojo does it himself.

> **Sign-in is Google, through Better Auth (LOCKED, Oct 29, 2026, 7:07 PM ET; approved for Linear 7:28 PM ET).** 7:02 PM ET: "For the second part yeah, it should be log in with Google, not a password sign in. That needs to change." 7:07 PM ET: "Okay, I, I, I agree with a better auth. is, it's okay. So that, that works." 7:30 PM ET: "I'm about to head out so please build around sign in." **Is:** the practitioner signs in with Google (Better Auth), and only allowlisted Google accounts (Kojo's) get in. The ChatGPT connector authenticates through the app's own OAuth server (Better Auth), with the same Google sign-in behind it.

> **OAuth consent page for the connector (LOCKED, Oct 31, 2026, 2:28 to 2:35 AM ET, DIDI-1125).** "Go with C plus A's safety line" / "Show the email with a Not you? Sign out link" / "Remember consent and skip the page on reconnect" / "No staying connected line" / "Add the wordmark to both the consent and sign-in pages" / "Use: Didi Physio never stores or shares patient details." / "Keep the Go to Didi Physio button". **Is:** the consent page uses option C's layout with A's safety line. It shows "Signed in as {email}" with a "Not you? Sign out" link. Consent is remembered per client, redirect and scope. There is no staying-connected line and no revoke in V1. The Didi Physio wordmark goes on both the consent and sign-in pages. The page carries the line "Didi Physio never stores or shares patient details." The invalid and expired states have a "Go to Didi Physio" button. **Was:** no consent page existed.

> **Constraints.** No patient info flows through the tool (by design). The product only needs exercises, sets, reps, and notes. No names, diagnoses, or other identifiers go to the AI or the MCP server.

Also applied: mobile first (Kojo uses a phone) and no em dashes in copy.

## Copy inventory (verbatim)

Every user-facing string, in screen order. `{...}` is a runtime value.

### Sign-in
- Didi Physio
- Sign in with Google

### Consent
- Didi Physio
- Request from {host}
- Allow read-only access to Didi Physio?
- The app calls itself
- “{name}”
- Self-reported
- It can
- Search your approved exercises
- Search your routines
- See your programs and their share links
- It can’t
- Create, edit, publish or delete anything
- For changes, it sends you a link to the right page here instead
- Didi Physio never stores or shares patient details.
- Only allow it if you just started connecting from {host}.
- Deny
- Allow
- Signed in as {email}
- Not you? Sign out

### After Allow and After Deny
- Connected
- Taking you back to {host}.
- Not connected
- Nothing was shared. Taking you back to {host}.

### Invalid client
- Didi Physio
- This app can’t connect
- The app asking to connect didn’t identify itself in a way Didi Physio accepts, so nothing was shared.
- Go back to the app and try connecting again. If it keeps happening, the app may not work with Didi Physio yet.
- Go to Didi Physio

### Expired request
- Didi Physio
- This request has expired
- Connection requests only last a short time, so this one was stopped. Nothing was shared.
- Go back to the app you were connecting and start again.
- Go to Didi Physio

### Existing, unchanged
- This Google account isn't allowed

### PROPOSED (not approved)
- Connect an app · Didi Physio

## Changes

- **Oct 30, 2026**: Exploration: baseline and options A, B and C in MagicPath. https://linear.app/didi-build/issue/DIDI-1125
- **Oct 30, 2026**: CTO security rulings (host, verified, invalid client, expiry, name hygiene, clickjacking). https://linear.app/didi-build/issue/DIDI-1125
- **Oct 31, 2026**: Diadem's calls, 2:28 to 2:35 AM ET: option C plus A's safety line, email with "Not you? Sign out", remembered consent, no staying-connected line, wordmark on consent and sign-in, patient details line, keep "Go to Didi Physio". https://linear.app/didi-build/issue/DIDI-1125
- **Oct 31, 2026**: Final revisions in MagicPath: option C 467169139593728000 and sign-in 467169143641223168. Mockups 01 to 07 at 390 px and 1280 px. https://linear.app/didi-build/issue/DIDI-1125
