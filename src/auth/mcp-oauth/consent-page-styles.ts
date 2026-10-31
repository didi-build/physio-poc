export const CONSENT_PAGE_STYLES = `/* OAuth consent pages (DIDI-1126). Matches sign-in chrome from src/ui/styles/sign-in.css. */
*, *::before, *::after {
  box-sizing: border-box;
}

body {
  margin: 0;
}

.consent-root {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background: #f8fafc;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  color: #0f172a;
}

.consent-card {
  width: 100%;
  max-width: 24rem;
  padding: 2rem;
  border-radius: 1rem;
  background: #ffffff;
  box-shadow: 0 1px 2px rgb(15 23 42 / 0.08);
  overflow-x: clip;
}

.consent-card-centered {
  text-align: center;
}

.consent-wordmark {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1.25rem;
}

.consent-wordmark-centered {
  justify-content: center;
}

.consent-wordmark-tile {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 0.5rem;
  background: #0f766e;
  color: #ffffff;
  font-weight: 700;
  font-size: 1rem;
  line-height: 1;
}

.consent-wordmark-text {
  font-weight: 600;
  font-size: 1.125rem;
  color: #0f172a;
}

.consent-host-line {
  font-size: 0.875rem;
  color: #64748b;
  margin: 0 0 0.5rem;
}

.consent-host-emphasis {
  font-weight: 700;
  color: #0f172a;
}

.consent-heading {
  font-size: 1.25rem;
  font-weight: 700;
  margin: 0 0 1rem;
  line-height: 1.3;
}

.consent-name-line {
  font-size: 0.9375rem;
  margin: 0 0 1rem;
  line-height: 1.5;
}

.consent-name-lead {
  white-space: nowrap;
}

.consent-name-inline {
  overflow-wrap: anywhere;
  white-space: normal;
}

.consent-tag {
  display: inline-block;
  margin-left: 0.35rem;
  vertical-align: baseline;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  border: 1px dashed #cbd5e1;
  background: transparent;
  color: #64748b;
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  white-space: nowrap;
}

@media (min-width: 640px) {
  .consent-name-line {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    column-gap: 0.375rem;
    row-gap: 0.25rem;
    font-size: 0.875rem;
  }

  .consent-name-lead {
    flex: 0 0 auto;
    white-space: nowrap;
  }

  .consent-name-inline {
    flex: 0 1 auto;
    min-width: 0;
    overflow-wrap: anywhere;
    white-space: normal;
  }

  .consent-tag {
    flex: 0 0 auto;
    margin-left: 0;
  }
}

@media (max-width: 639.98px) {
  .consent-name-line {
    display: block;
  }

  .consent-name-lead {
    display: inline;
    white-space: nowrap;
    margin-right: 0.375rem;
  }

  .consent-name-inline {
    display: inline;
    overflow-wrap: anywhere;
    white-space: normal;
  }

  .consent-tag {
    display: inline-block;
    margin-left: 0;
    margin-top: 0.35rem;
    width: fit-content;
    max-width: 100%;
  }
}

.consent-list-heading {
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #64748b;
  margin: 0 0 0.35rem;
}

.consent-list {
  margin: 0 0 1rem;
  padding: 0;
  list-style: none;
  font-size: 0.875rem;
  color: #334155;
}

.consent-list li {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.consent-list-icon-wrap {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  margin-top: 0.05rem;
  border-radius: 9999px;
}

.consent-list-icon-wrap-can {
  background: #ccfbf1;
  color: #0f766e;
}

.consent-list-icon-wrap-cant {
  background: #f1f5f9;
  color: #94a3b8;
}

.consent-list-icon {
  width: 0.875rem;
  height: 0.875rem;
}

.consent-muted-line {
  font-size: 0.8125rem;
  color: #64748b;
  margin: 0 0 0.75rem;
  line-height: 1.45;
}

.consent-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
  margin: 1.25rem 0 1rem;
}

.consent-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 2.75rem;
  padding: 0.625rem 1rem;
  border-radius: 9999px;
  font-weight: 600;
  font-size: 0.9375rem;
  cursor: pointer;
  border: 1px solid transparent;
}

.consent-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.consent-btn-deny {
  background: #ffffff;
  color: #0f172a;
  border-color: #e2e8f0;
}

.consent-btn-allow {
  background: #0f766e;
  color: #ffffff;
}

.consent-btn-allow:hover:not(:disabled) {
  background: #115e59;
}

.consent-account-line {
  text-align: center;
  font-size: 0.8125rem;
  color: #64748b;
  margin: 0;
}

.consent-sign-out-wrap {
  text-align: center;
  margin-top: 0.35rem;
}

.consent-sign-out-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.75rem;
  padding: 0 0.75rem;
  color: #0f766e;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
  font-size: 0.8125rem;
  font-family: inherit;
}

.consent-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 3.5rem;
  height: 3.5rem;
  margin: 0 auto 1rem;
  border-radius: 9999px;
}

.consent-icon-wrap-warn {
  background: #fef3c7;
  color: #d97706;
}

.consent-icon-wrap-clock {
  background: #f1f5f9;
  color: #64748b;
}

.consent-body {
  font-size: 0.9375rem;
  color: #475569;
  margin: 0 0 1rem;
  line-height: 1.5;
}

.consent-next-step {
  font-size: 0.875rem;
  color: #475569;
  background: #f1f5f9;
  border-radius: 0.75rem;
  padding: 0.875rem 1rem;
  margin: 0 0 1.25rem;
  line-height: 1.45;
}

.consent-btn-full {
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-height: 2.75rem;
  padding: 0.75rem 1rem;
  border-radius: 9999px;
  background: #0f766e;
  color: #ffffff;
  font-weight: 600;
  text-decoration: none;
  border: none;
  cursor: pointer;
  font-size: 0.9375rem;
}

.consent-btn-full:hover {
  background: #115e59;
}

.consent-status-card {
  width: 100%;
  max-width: 24rem;
  padding: 1.5rem 2rem;
  border-radius: 1rem;
  background: #ffffff;
  box-shadow: 0 1px 2px rgb(15 23 42 / 0.08);
}

.consent-status-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.consent-status-row .consent-heading {
  margin: 0;
  font-size: 1.125rem;
}

.consent-spinner {
  flex-shrink: 0;
  width: 1.25rem;
  height: 1.25rem;
  border: 2px solid #e2e8f0;
  border-top-color: #0f766e;
  border-radius: 9999px;
  animation: consent-spin 0.8s linear infinite;
}

.consent-status-card .consent-body {
  margin: 0;
  text-align: left;
}

@keyframes consent-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .consent-spinner {
    animation: none;
    border-top-color: #0f766e;
  }
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
`;
