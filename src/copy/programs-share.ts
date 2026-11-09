/** Verbatim strings from design/app/programs/spec.md for publish and public share links. */

export const PROGRAM_PUBLISH_NAME_REQUIRED =
  "Add a program name to publish. Use something you will recognise, not the patient's name.";

export const PUBLIC_LINK_CLOSED_HEADING = "This link was closed";

export const PUBLIC_LINK_PAGE_INTRO =
  "This page always shows the latest published version of your program.";

export const PUBLIC_LINK_SAVE_AS_PDF = "Save as PDF";

export const PUBLIC_LINK_PRINT = "Print";

export const PUBLIC_LINK_EXPIRY_NEVER =
  "This link stays open until your physiotherapist closes it.";

export function publicLinkExpiryUntilDateLine(dateLabel: string): string {
  return `This link works until ${dateLabel}.`;
}

export function formatShareLinkExpiryDisplayDate(isoInstant: string): string {
  const instant = Date.parse(isoInstant);
  if (Number.isNaN(instant)) {
    return isoInstant;
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(instant));
}
