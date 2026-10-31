import { escapeHtml } from "./escape-html.js";
import { CONSENT_PAGE_STYLES } from "./consent-page-styles.js";

const CONSENT_TAB_TITLE = "Connect an app · Didi Physio";

function wordmarkHtml(): string {
  return `<div class="consent-wordmark">
  <span class="consent-wordmark-tile" aria-hidden="true">D</span>
  <span class="consent-wordmark-text">Didi Physio</span>
</div>`;
}

function pageShell(title: string, body: string, extraHead = ""): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>${CONSENT_PAGE_STYLES}</style>
  ${extraHead}
</head>
<body>
${body}
</body>
</html>`;
}

export type ConsentPageViewModel = {
  host: string;
  clientName: string;
  email: string;
  consentPageUrl: string;
  signInReturnUrl: string;
  csrfToken: string;
};

export function renderConsentPageHtml(model: ConsentPageViewModel): string {
  const host = escapeHtml(model.host);
  const name = escapeHtml(model.clientName);
  const email = escapeHtml(model.email);

  const script = `<script>
(function () {
  var busy = false;
  var csrfToken = ${JSON.stringify(model.csrfToken)};
  function setBusy(next) {
    busy = next;
    var deny = document.getElementById("consent-deny");
    var allow = document.getElementById("consent-allow");
    if (deny) deny.disabled = next;
    if (allow) allow.disabled = next;
  }
  function followConsentResponse(response) {
    if (response.status === 302) {
      var loc = response.headers.get("Location");
      if (loc) { window.location.href = loc; return; }
    }
    return response.text().then(function (html) {
      if (html && html.length > 0) {
        document.open();
        document.write(html);
        document.close();
      } else {
        setBusy(false);
      }
    });
  }
  function postDecision(path) {
    if (busy) return;
    setBusy(true);
    fetch(path, {
      method: "POST",
      credentials: "include",
      redirect: "manual",
      headers: { ${JSON.stringify("X-Physio-Mcp-Consent-Csrf")}: csrfToken }
    }).then(followConsentResponse).catch(function () { setBusy(false); });
  }
  var denyBtn = document.getElementById("consent-deny");
  var allowBtn = document.getElementById("consent-allow");
  if (denyBtn) denyBtn.addEventListener("click", function () { postDecision("/oauth/consent/deny"); });
  if (allowBtn) allowBtn.addEventListener("click", function () { postDecision("/oauth/consent/allow"); });
  var signOut = document.getElementById("consent-sign-out");
  if (signOut) signOut.addEventListener("click", function () {
    fetch("/api/auth/sign-out", { method: "POST", credentials: "include" }).then(function () {
      window.location.href = ${JSON.stringify(model.signInReturnUrl)};
    });
  });
})();
</script>`;

  const body = `<main class="consent-root">
  <section class="consent-card" aria-labelledby="consent-heading">
    ${wordmarkHtml()}
    <p class="consent-host-line">Request from <span class="consent-host-mono">${host}</span></p>
    <h1 id="consent-heading" class="consent-heading">Allow read-only access to Didi Physio?</h1>
    <p class="consent-name-line">The app calls itself “${name}” <span class="consent-tag">Self-reported</span></p>
    <p class="consent-list-heading">It can</p>
    <ul class="consent-list">
      <li>Search your approved exercises</li>
      <li>Search your routines</li>
      <li>See your programs and their share links</li>
    </ul>
    <p class="consent-list-heading">It can’t</p>
    <ul class="consent-list">
      <li>Create, edit, publish or delete anything</li>
      <li>For changes, it sends you a link to the right page here instead</li>
    </ul>
    <p class="consent-muted-line">Didi Physio never stores or shares patient details.</p>
    <p class="consent-muted-line">Only allow it if you just started connecting from ${host}.</p>
    <div class="consent-actions">
      <button type="button" class="consent-btn consent-btn-deny" id="consent-deny">Deny</button>
      <button type="button" class="consent-btn consent-btn-allow" id="consent-allow">Allow</button>
    </div>
    <p class="consent-account-line">Signed in as ${email}</p>
    <button type="button" class="consent-sign-out" id="consent-sign-out">Not you? Sign out</button>
  </section>
</main>
${script}`;

  return pageShell(CONSENT_TAB_TITLE, body);
}

export function renderInvalidClientPageHtml(homeHref: string): string {
  const home = escapeHtml(homeHref);
  const focus = `<script>document.getElementById("invalid-heading").focus();</script>`;
  const body = `<main class="consent-root">
  <div class="consent-card consent-card-centered" role="alert" aria-labelledby="invalid-heading">
    ${wordmarkHtml()}
    <div class="consent-icon-wrap consent-icon-wrap-warn" aria-hidden="true">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
    </div>
    <h1 id="invalid-heading" class="consent-heading" tabindex="-1">This app can’t connect</h1>
    <p class="consent-body">The app asking to connect didn’t identify itself in a way Didi Physio accepts, so nothing was shared.</p>
    <p class="consent-next-step">Go back to the app and try connecting again. If it keeps happening, the app may not work with Didi Physio yet.</p>
    <a class="consent-btn-full" href="${home}">Go to Didi Physio</a>
  </div>
</main>
${focus}`;
  return pageShell(CONSENT_TAB_TITLE, body);
}

export function renderExpiredRequestPageHtml(homeHref: string): string {
  const home = escapeHtml(homeHref);
  const focus = `<script>document.getElementById("expired-heading").focus();</script>`;
  const body = `<main class="consent-root">
  <div class="consent-card consent-card-centered" role="alert" aria-labelledby="expired-heading">
    ${wordmarkHtml()}
    <div class="consent-icon-wrap consent-icon-wrap-clock" aria-hidden="true">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
    </div>
    <h1 id="expired-heading" class="consent-heading" tabindex="-1">This request has expired</h1>
    <p class="consent-body">Connection requests only last a short time, so this one was stopped. Nothing was shared.</p>
    <p class="consent-next-step">Go back to the app you were connecting and start again.</p>
    <a class="consent-btn-full" href="${home}">Go to Didi Physio</a>
  </div>
</main>
${focus}`;
  return pageShell(CONSENT_TAB_TITLE, body);
}

export function renderAfterAllowPageHtml(host: string, redirectUrl: string): string {
  const hostEsc = escapeHtml(host);
  const redirect = escapeHtml(redirectUrl);
  const body = `<main class="consent-root">
  <div class="consent-status" role="status" aria-live="polite">
    <div class="consent-spinner" aria-hidden="true"></div>
    <h1 class="consent-heading">Connected</h1>
    <p class="consent-body">Taking you back to ${hostEsc}.</p>
  </div>
</main>
<meta http-equiv="refresh" content="0;url=${redirect}" />
<script>window.location.replace(${JSON.stringify(redirectUrl)});</script>`;
  return pageShell(CONSENT_TAB_TITLE, body);
}

export function renderAfterDenyPageHtml(host: string, redirectUrl: string): string {
  const hostEsc = escapeHtml(host);
  const redirect = escapeHtml(redirectUrl);
  const body = `<main class="consent-root">
  <div class="consent-status" role="status" aria-live="polite">
    <div class="consent-spinner" aria-hidden="true"></div>
    <h1 class="consent-heading">Not connected</h1>
    <p class="consent-body">Nothing was shared. Taking you back to ${hostEsc}.</p>
  </div>
</main>
<meta http-equiv="refresh" content="0;url=${redirect}" />
<script>window.location.replace(${JSON.stringify(redirectUrl)});</script>`;
  return pageShell(CONSENT_TAB_TITLE, body);
}

export function htmlResponse(
  html: string,
  extraHeaders?: HeadersInit,
  status = 200,
): Response {
  const headers = new Headers(extraHeaders);
  headers.set("content-type", "text/html; charset=utf-8");
  return new Response(html, { status, headers });
}
