import type { ExerciseParams } from "../../domain/exercise-params.js";
import type { PrescriptionType } from "../../domain/exercise-types.js";
import type { ShareLinkExpiryChoice } from "../../domain/share-link-expiry.js";

export type ShareLinkExpiryDefaultsView = {
  global: ShareLinkExpiryChoice;
  practitioner: ShareLinkExpiryChoice | null;
  effective: ShareLinkExpiryChoice;
};

export type MyDefaultsExerciseTypeView = {
  type: PrescriptionType;
  global_params: ExerciseParams;
  practitioner_params: ExerciseParams | null;
};

export type MyDefaultsPageView = {
  share_link_expiry: ShareLinkExpiryDefaultsView;
  exercise_types: MyDefaultsExerciseTypeView[];
};
