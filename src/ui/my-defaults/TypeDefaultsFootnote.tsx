import { TYPE_DEFAULT_FOOTNOTE_LABEL_IDS } from "./type-default-editor-a11y.js";

/** Verbatim spec.md Copy inventory line 207; span ids expose Up, down, and rest for aria-labelledby. */
export function TypeDefaultsFootnote({ className }: { className?: string }) {
  return (
    <p className={className}>
      Global defaults are set for all practitioners.{" "}
      <span id={TYPE_DEFAULT_FOOTNOTE_LABEL_IDS.up}>Up</span>,{" "}
      <span id={TYPE_DEFAULT_FOOTNOTE_LABEL_IDS.down}>down</span> and{" "}
      <span id={TYPE_DEFAULT_FOOTNOTE_LABEL_IDS.rest}>rest</span> can be added with
      &quot;Add parameter&quot;.
    </p>
  );
}
