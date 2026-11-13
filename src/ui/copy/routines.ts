/** Verbatim strings from design/app/routines/spec.md Copy inventory unless noted. */

import { PUBLISH_BLOCKED_BY_MISSING_IMAGES_MESSAGE } from "../../domain/exercise-publish-media.js";

export const MISSING_IMAGES_BLOCK_HEADING = PUBLISH_BLOCKED_BY_MISSING_IMAGES_MESSAGE;

export function missingImagesBlockBodyManyRoutine(count: number): string {
  return `${count} exercises are missing their start or end image. Remove them from this routine, then publish.`;
}

export const MISSING_IMAGES_BLOCK_BODY_ONE_ROUTINE =
  "One exercise is missing its start or end image. Remove it from this routine, then publish.";

export const MISSING_IMAGES_NONE_LEFT =
  "No exercises without images left. You can publish.";

export function missingImagesRemovedLiveRoutine(name: string): string {
  return `Removed ${name} from this routine.`;
}

export const ROUTINES_PAGE_TITLE = "Routines";
export const ROUTINES_TAB_MY = "My routines";
export const ROUTINES_TAB_ALL = "All routines";

export const MY_ROUTINES_INTRO =
  "Routines you saved or started. A saved routine stays as it was when you saved it. When the community version changes, it is flagged so you can update.";

export function allRoutinesIntro(count: number): string {
  return `${count} ready-made programs for common conditions, shared by every practitioner. Anyone can add or improve one, and every change is kept in version history.`;
}

export const MY_ROUTINES_EMPTY_HEADING = "No routines saved yet";
export const MY_ROUTINES_EMPTY_HELPER = "Save one from All routines, or make your own.";

export const ALL_ROUTINES_EMPTY_HEADING = "No routine matches";
export const ALL_ROUTINES_EMPTY_HELPER =
  "Try a body region or an exercise name. Or add the routine yourself.";

export const SEARCH_ROUTINES_LABEL = "Search routines";
export const SEARCH_MY_ROUTINES_LABEL = "Search my routines";
export const SEARCH_ALL_PLACEHOLDER = "Try: knee, low back, bridge";
export const SEARCH_ALL_WITH_CONDITIONS_PLACEHOLDER = "Try: arthritis, knee, low back";
export const SEARCH_MY_PLACEHOLDER = "Search my routines";

export const FILTERS_HEADER = "Filters & sort";
export const CONDITION = "Condition";
export const CONDITION_SAMPLE_LIST = "Sample list";
export const CONDITION_SAMPLE_NOTE =
  "Sample conditions for this concept. The real fixed list is still to come.";
export const ALL_CONDITIONS = "All conditions";
export const BODY_REGION = "Body region";
export const ALL_REGIONS = "All regions";
export const SORT = "Sort";
export const SORT_MOST_USED = "Most used";
export const SORT_NEWEST = "Newest";
export const SORT_A_TO_Z = "A to Z";
export const RESET = "Reset";
export const DONE = "Done";
export const CLEAR = "Clear";

export const DRAFTS_SECTION = "Drafts, only you can see them";
export const SAVED_SECTION = "Saved";
export const BROWSE_ALL_ROUTINES = "Browse all routines";

export const UNTITLED_ROUTINE = "Untitled routine";
export const TAG_DRAFT = "Draft";
export const DRAFT_SAVED_NOTE = "Saved automatically. Not published.";
export const TAG_EDITED = "Edited";
export const COMMUNITY_UPDATED_FLAG = "Community updated";
export function communityUpdatedToVersion(version: number): string {
  return `Community updated to v${version}`;
}
export const ADDED_BY_YOU = "Added by you";

export function exerciseCountLine(count: number, versionPart: string): string {
  return `${count} exercises · ${versionPart}`;
}

export function yourCopyVersion(version: number): string {
  return `Your copy, v${version}`;
}

export function versionN(version: number): string {
  return `Version ${version}`;
}

export function usedTimes(count: number): string {
  return `Used ${count} times`;
}

export function savedOn(date: string): string {
  return `Saved ${date}`;
}

export function usedOn(date: string): string {
  return `Used ${date}`;
}

export function flaggedBanner(count: number): string {
  const head =
    count === 1
      ? "1 saved routine has a newer community version."
      : `${count} saved routines have a newer community version.`;
  return `${head} Open it to see what changed and update in one tap.`;
}

export const BACK_ROUTINES = "Routines";
export const IN_MY_ROUTINES = "In My routines";
export const COMMUNITY_UPDATED_BADGE = "Community updated";
export const SAVE_TO_MY_ROUTINES = "Save to My routines";
export const EDIT_MY_COPY = "Edit my copy";
export const MAKE_MY_OWN_COPY = "Make my own copy";
export const EDIT_FOR_EVERYONE = "Edit for everyone";
export const VERSION_HISTORY = "Version history";
export const REMOVE_FROM_MY = "Remove from My routines";

export function saveRoutineLabel(name: string): string {
  return `Save ${name} to My routines`;
}

export function inMyRoutinesLabel(name: string): string {
  return `${name} is in My routines`;
}

export const ROUTINE_PAGE_NOTE =
  "Using a routine for a patient makes a separate program with its own name and code. Later edits to this routine never change programs already sent.";

export const EXERCISES_HEADING = "Exercises";
export const SEE_THEM_IN_PROGRAMS = "See them in Programs";
export const USE_THIS_ROUTINE = "Use this routine";
export const USE_FOR_PATIENT = "Use for a patient";
export const USE_FOR_PATIENT_HINT =
  "Makes a separate copy and opens Publish, with the link to send.";
export const CREATE_PROGRAM_FROM_ROUTINE = "Create program from routine";
export const CREATE_PROGRAM_HINT = "Opens the builder so you can tweak it first.";
export const CREATE_PROGRAM = "Create program";

export const VERSION_TO_USE = "Version to use";
export function myCopySegmentLabel(version: number, edited: boolean): string {
  return `My copy, v${version}${edited ? ", edited" : ""}`;
}

export function communitySegmentLabel(version: number): string {
  return `Community, v${version}`;
}

export function myCopyFrozenLine(
  version: number,
  edited: boolean,
  editCount: number,
): string {
  const edits =
    edited && editCount > 0
      ? ` with your ${editCount === 1 ? "change" : `${editCount} changes`}`
      : "";
  return `Your saved copy, frozen at version ${version}${edits}.`;
}

export const COMMUNITY_LIVE_LINE = "The live community version.";
export const SEGMENT_HINT =
  "Use for a patient and Create program use the one you pick here.";

export const WHAT_CHANGED = "What changed since your version";
export const USE_VERSION = "Use version";
export function useVersionN(version: number): string {
  return `Use version ${version}`;
}
export const KEEP_MINE = "Keep mine";
export function communityUpdatedBanner(
  version: number,
  date: string,
  myVersion: number,
): string {
  return `Community updated to version ${version} on ${date}. Your copy stays on version ${myVersion} until you choose.`;
}

export function adoptWarnsReplace(editCount: number, version: number): string {
  return `Updating replaces your own ${editCount === 1 ? "change" : `${editCount} changes`} with version ${version}. You can undo right after.`;
}

export function communityRoutineMeta(
  version: number,
  date: string,
  byYou: boolean,
  usage: number,
): string {
  const by = byYou ? "you" : "a practitioner";
  return `Community routine · Version ${version} · Updated ${date} by ${by} · Used ${usage} times`;
}

export function sentRoutineTimes(count: number): string {
  return `You sent this routine ${count === 1 ? "once" : `${count} times`}`;
}

export const YOUR_CHANGE = "Your change";
export const UPDATE_MY_COPY = "Update my copy to version";

export function toastSavedToMy(name: string): string {
  return `Saved ${name} to My routines`;
}

export function toastRemovedFromMy(name: string): string {
  return `Removed ${name} from My routines`;
}

export function toastAdoptedVersion(version: number): string {
  return `Your copy is now version ${version}`;
}

export function toastKeptCopy(version: number): string {
  return `Kept your copy on version ${version}. You can still update it from this page.`;
}

export const MY_COPY_EDITOR_INTRO =
  "Only you see these changes. The community routine stays the same, and programs already sent do not change.";
export const SAVE_MY_COPY = "Save my copy";
export const TOAST_SAVED_MY_COPY =
  "Saved to your copy. Only you see it. The community routine did not change.";

export const ROUTINE_DETAIL_HEADING = "Routine";
export const NEW_ROUTINE = "New routine";

export const ROUTINE_NAME_LABEL = "Routine name";
export const ROUTINE_NAME_PLACEHOLDER = "Knee osteoarthritis, starter";
export const ADD_NAME_TO_PUBLISH = "Add a name to publish.";
export const WHO_ITS_FOR_LABEL = "Who it's for";
export const OPTIONAL_SUFFIX = "(optional)";
export const WHO_ITS_FOR_PLACEHOLDER =
  "Gentle strength for knee osteoarthritis, three days a week";
export const WHO_ITS_FOR_PRIVACY =
  "Describe the condition, not a patient. No names or patient details.";
export const NO_EXERCISES_YET = "No exercises yet.";
export const NO_EXERCISES_ADD_FROM_LIBRARY =
  "No exercises yet. Add them from the exercise library.";
export const ADD_AT_LEAST_ONE_EXERCISE_PUBLISH =
  "Add at least one exercise to publish.";
export const ADD_EXERCISE = "Add exercise";
export const ADD_EXERCISE_TO_ROUTINE = "Add exercise to routine";
export const FROM_EXERCISE_LIBRARY = "From the exercise library";

export const DRAFT_SAVING = "Saving…";
export const DRAFT_SAVED_UNTIL_PUBLISH =
  "Draft saved. Only you can see it until you publish.";
export const DRAFT_DETAIL_VISIBILITY = "Draft, only you can see it";
export const DRAFT_DETAIL_SAVED_NOTE = "Saved automatically today. Not published yet.";
export const DRAFT_PUBLISH_NOTE =
  "Publish it to use it for patients and share it with every practitioner. There is no review step for routines.";
export const EDIT_DRAFT = "Edit draft";
export const PUBLISH = "Publish";
export const DISCARD_DRAFT = "Discard draft";
export const DONE_FOR_NOW = "Done for now";

export const BEFORE_YOU_PUBLISH = "Before you publish";
export const VALIDATION_ADD_ROUTINE_NAME = "Add a routine name";
export const VALIDATION_ADD_EXERCISE = "Add at least one exercise";
export const DRAFT_STILL_SAVED = "Your draft is still saved.";

export const PUBLISH_THIS_ROUTINE = "Publish this routine?";
export const PUBLISH_NOW = "Publish now";
export const NOT_YET = "Not yet";
export const KEPT_AS_DRAFT = "Kept as a draft. Only you can see it.";
export const WHAT_HAPPENS = "What happens";
export const PUBLISH_POINT_LIVE_V1 =
  "It goes live as version 1 in All routines, for every practitioner.";
export const PUBLISH_POINT_VERSION_HISTORY =
  "Anyone can use it, improve it and restore older versions. Every change is kept in version history.";
export const PUBLISH_POINT_NO_REVIEW =
  "There is no review step. Routines reuse approved exercises, so nothing new needs checking.";
export const NOT_YET_KEEPS_DRAFT = "Not yet keeps it as a draft that only you can see.";

export function toastPublishedVersion1(name: string): string {
  return `Published. Version 1 of ${name} is live for every practitioner.`;
}

export function toastDiscardedDraft(name: string): string {
  const display = name.trim().length > 0 ? name : UNTITLED_ROUTINE;
  return `Discarded the draft ${display}`;
}

export const EDIT_FOR_EVERYONE_KICKER = "Edit for everyone";
export function versionLiveLine(version: number): string {
  return `Version ${version}, live`;
}
export const EDIT_FOR_EVERYONE_BANNER_HISTORY_LINK = "history";

export function editForEveryoneBannerBeforeHistory(
  liveVersion: number,
  nextVersion: number,
): string {
  return `This is the community routine. When you save, it becomes version ${nextVersion} for every practitioner. Version ${liveVersion} stays in `;
}

export const EDIT_FOR_EVERYONE_BANNER_AFTER_HISTORY = " and anyone can restore it.";
export const EDIT_FOR_EVERYONE_PROGRAMS_NOTE =
  "Programs already sent don't change. Saved copies in My routines get a flag to update.";
export const CHANGED = "Changed";
export const NO_CHANGES_YET = "No changes yet";
export const WHAT_DID_YOU_CHANGE = "What did you change?";
export const WHAT_DID_YOU_CHANGE_PLACEHOLDER = "For example: added calf stretch";
export const WHAT_DID_YOU_CHANGE_HELPER =
  "Shown in version history so others know why it changed.";
export const EDIT_MY_COPY_INSTEAD =
  "Only want it different for you? Edit my copy instead";
export function saveAsVersionNext(version: number): string {
  return `Save as version ${version + 1}`;
}
export function toastSavedCommunityVersion(version: number): string {
  return `Saved as version ${version} for everyone. Programs already sent did not change.`;
}

export const LIVE = "Live";
export const YOUR_COPY_BADGE = "Your copy";
export const RESTORED_FROM_BADGE_PREFIX = "Restored from v";
export function sentProgramsFromVersion(count: number): string {
  return `You sent ${count} programs made from this version`;
}
export const RESTORE_THIS_VERSION = "Restore this version";
export const RESTORE_VERSION_PROGRAMS_NOTE =
  "Programs already sent never change. Saved copies in My routines get a flag to update.";
export function restoreVersionConfirmTitle(version: number): string {
  return `Restore version ${version}?`;
}
export const RESTORE_CANCEL_NOTE =
  "Programs already sent keep their version. Practitioners who saved this routine get a flag to update.";
export function restoreAsVersion(version: number): string {
  return `Restore as version ${version}`;
}
export function toastVersionRestored(fromVersion: number, newVersion: number): string {
  return `Version ${fromVersion} restored as version ${newVersion}. Programs already sent did not change.`;
}
export const FIRST_VERSION = "First version";

export function moveExerciseUpAria(name: string): string {
  return `Move ${name} up`;
}
export function moveExerciseDownAria(name: string): string {
  return `Move ${name} down`;
}
export function removeExerciseAria(name: string): string {
  return `Remove ${name}`;
}
export function typeForExerciseAria(name: string): string {
  return `Type for ${name}`;
}

export function addedExerciseToast(name: string): string {
  return `Added ${name}`;
}
