/** Five exercises from ADR 0005 / 0006 (slug used in filenames; nameSlug in prompts). */
export const FIVE_TEST_EXERCISES = [
  { id: "bridge", nameSlug: "bridge" },
  { id: "straight-leg-raise", nameSlug: "straight leg raise rehab supine" },
  { id: "sit-to-stand", nameSlug: "sit to stand" },
  { id: "band-shoulder-rotation", nameSlug: "band shoulder external rotation" },
  { id: "heel-slides", nameSlug: "heel slides supine" },
] as const;

export type FiveTestExercise = (typeof FIVE_TEST_EXERCISES)[number];
