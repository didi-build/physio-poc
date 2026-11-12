/** Verbatim strings from design/app/programs/spec.md for publish and public share links. */

export const PROGRAM_PUBLISH_NAME_REQUIRED =
  "Add a program name to publish. Use something you will recognise, not the patient's name.";

export const PUBLIC_LINK_CLOSED_HEADING = "This link was closed";

export const PUBLIC_LINK_PAGE_INTRO =
  "This page always shows the latest published version of your program.";

export const PUBLIC_LINK_SAVE_AS_PDF = "Save as PDF";

export const PUBLIC_LINK_PRINT = "Print";

/** Verbatim design/app/programs/spec.md Copy inventory (link / PDF preview). */
export const PUBLIC_LINK_EXERCISE_PROGRAM_LABEL = "Exercise program";

export const PUBLIC_LINK_EXPIRY_NEVER =
  "This link stays open until your physiotherapist closes it.";

export function publicLinkExpiryUntilDateLine(dateLabel: string): string {
  return `This link works until ${dateLabel}.`;
}

/** design/app/programs/spec.md Approved Nov 9, 2026, 11:31 AM ET (DIDI-1192) */
export const PUBLIC_LINK_IMAGES_DIDNT_LOAD = "Images didn't load.";

export const PUBLIC_LINK_TRY_AGAIN = "Try again";

/** design/app/programs/spec.md Approved Nov 10, 2026, 12:09 AM ET (DIDI-1192) */
export const PUBLIC_LINK_CAROUSEL_VIDEO = "Video";
export const PUBLIC_LINK_CAROUSEL_START = "Start";
export const PUBLIC_LINK_CAROUSEL_END = "End";
export const PUBLIC_LINK_CAROUSEL_PREVIOUS = "Previous";
export const PUBLIC_LINK_CAROUSEL_NEXT = "Next";

export function publicLinkTryLoadingImagesAgainLabel(title: string): string {
  return `Try loading images for ${title} again`;
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
