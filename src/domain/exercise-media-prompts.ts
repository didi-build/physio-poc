import {
  validateExerciseTemplateText,
  validateExerciseTitle,
} from "./exercise-free-text.js";

export type ExerciseMediaPromptContext = {
  title: string;
  startingPosition?: string;
  endingPosition?: string;
  steps?: string;
  regenerationNote?: string | null;
};

/** Fallback when neither ending position nor steps supply pose text (image prompt only). */
export const END_POSE_DESCRIPTION_FALLBACK = "the end of the exercise movement";

const END_POSE_EDIT_PREFIX =
  "Same figure, clothing, camera angle, background and lighting. Change only the pose to the end position:";
const END_POSE_MOVEMENT_CLAUSE =
  "Change only the body parts that this exercise moves; keep every other body part exactly as in the start image.";

function exerciseLabel(ctx: ExerciseMediaPromptContext): string {
  const title = validateExerciseTitle(ctx.title);
  const starting = validateExerciseTemplateText(
    ctx.startingPosition ?? "",
    "Starting position",
  ).trim();
  if (starting.length > 0) {
    return `${title}. ${starting}`;
  }
  return title;
}

function titleOnlyLabel(ctx: ExerciseMediaPromptContext): string {
  return validateExerciseTitle(ctx.title);
}

function styleBlock(exerciseDescription: string, pose: string): string {
  return [
    `Clinical physiotherapy exercise demonstration: ${exerciseDescription}.`,
    "Single adult figure, androgynous, neutral skin tone, plain light grey studio background, soft even lighting.",
    "Clean 3D medical illustration style, teal accent on minimal athletic clothing, no text, no logos, no facial identity.",
    "Side or three-quarter view with unobstructed limbs and joints.",
    pose,
  ].join(" ");
}

function appendRegenerationNote(pose: string, note: string | null | undefined): string {
  const trimmed = note?.trim();
  if (!trimmed) {
    return pose;
  }
  return `${pose} Additional guidance from the practitioner: ${trimmed}.`;
}

export function parseNonEmptySteps(steps: string | undefined): string[] {
  return (steps ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function resolveEndPoseDescription(ctx: ExerciseMediaPromptContext): string {
  const endingRaw = ctx.endingPosition?.trim() ?? "";
  if (endingRaw.length > 0) {
    return validateExerciseTemplateText(endingRaw, "Ending position").trim();
  }
  const parsed = parseNonEmptySteps(ctx.steps);
  const lastStep = parsed.at(-1);
  if (lastStep) {
    return validateExerciseTemplateText(lastStep, "Steps").trim();
  }
  return END_POSE_DESCRIPTION_FALLBACK;
}

function buildEndPoseBase(ctx: ExerciseMediaPromptContext): string {
  const endDescription = resolveEndPoseDescription(ctx);
  return `${END_POSE_EDIT_PREFIX} ${endDescription}. ${END_POSE_MOVEMENT_CLAUSE}`;
}

export function buildStartImagePrompt(ctx: ExerciseMediaPromptContext): string {
  const pose = appendRegenerationNote(
    "Hold the starting position of the exercise, stable and anatomically neutral.",
    ctx.regenerationNote,
  );
  return styleBlock(exerciseLabel(ctx), pose);
}

export function buildEndImagePrompt(ctx: ExerciseMediaPromptContext): string {
  const pose = appendRegenerationNote(buildEndPoseBase(ctx), ctx.regenerationNote);
  return styleBlock(titleOnlyLabel(ctx), pose);
}
