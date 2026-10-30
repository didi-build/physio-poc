import {
  validateExerciseTemplateText,
  validateExerciseTitle,
} from "./exercise-free-text.js";

export type ExerciseMediaPromptContext = {
  title: string;
  startingPosition?: string;
  steps?: string;
  regenerationNote?: string | null;
};

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

export function buildStartImagePrompt(ctx: ExerciseMediaPromptContext): string {
  const pose = appendRegenerationNote(
    "Hold the starting position of the exercise, stable and anatomically neutral.",
    ctx.regenerationNote,
  );
  return styleBlock(exerciseLabel(ctx), pose);
}

export function buildEndImagePrompt(ctx: ExerciseMediaPromptContext): string {
  const pose = appendRegenerationNote(
    "Hold the end position of the exercise, stable and anatomically neutral.",
    ctx.regenerationNote,
  );
  return styleBlock(exerciseLabel(ctx), pose);
}
