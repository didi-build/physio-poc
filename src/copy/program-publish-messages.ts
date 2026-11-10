/** Publish sheet change lines — spec.md Toasts and messages from app logic ~733-739 only. */

export const PUBLISH_CHANGE_TITLE_CHANGED = "Title changed";
export const PUBLISH_CHANGE_REORDERED = "Exercises reordered";
export const PUBLISH_CHANGE_AFTER_SENDING = "Changed after sending";

export function publishChangeAddedExercise(name: string): string {
  return `Added ${name}`;
}

export function publishChangeRemovedExercise(name: string): string {
  return `Removed ${name}`;
}
