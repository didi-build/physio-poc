import type { PrescriptionType } from "../../domain/exercise-types.js";
import {
  parseTextOverridesJson,
  type LibraryVersionText,
  type TextOverrides,
} from "../../domain/exercise-text-overrides.js";
import type { ParamOverridesByType } from "../../domain/exercise-params.js";
import {
  resolveExerciseParams,
  type ResolvedExerciseParams,
} from "../../domain/resolve-exercise-params.js";
import type { ProgramRowTextSnapshot } from "../../domain/program-types.js";
import type { LatestApprovedVersionRow } from "../../storage/repositories/exercise-library-read.js";

function cueKeyForPrescriptionType(type: PrescriptionType): keyof LibraryVersionText {
  if (type === "stretching") {
    return "cue_stretching";
  }
  if (type === "isometric") {
    return "cue_isometric";
  }
  if (type === "concentric") {
    return "cue_concentric";
  }
  return "cue_eccentric";
}

export function toLibraryVersionText(
  row: LatestApprovedVersionRow,
): LibraryVersionText {
  return {
    title: row.title,
    description: row.description,
    cue_stretching: row.cue_stretching,
    cue_isometric: row.cue_isometric,
    cue_concentric: row.cue_concentric,
    cue_eccentric: row.cue_eccentric,
  };
}

export function buildProgramRowTextSnapshot(input: {
  version: LatestApprovedVersionRow;
  overrides: TextOverrides;
  prescriptionType: PrescriptionType;
}): ProgramRowTextSnapshot {
  const library = toLibraryVersionText(input.version);
  const title = input.overrides.title?.value ?? library.title;
  const description =
    input.overrides.description?.value ??
    (library.description !== "" ? library.description : undefined);
  const cueKey = cueKeyForPrescriptionType(input.prescriptionType);
  const overrideCue = input.overrides[cueKey]?.value;
  const libraryCue = library[cueKey] ?? "";
  const cueRaw = overrideCue ?? libraryCue;
  const snapshot: ProgramRowTextSnapshot = { title };
  if (description !== undefined && description !== "") {
    snapshot.description = description;
  }
  if (cueRaw !== "") {
    snapshot.cue = cueRaw;
  }
  return snapshot;
}

export function resolveParamsForProgramRow(input: {
  prescriptionType: PrescriptionType;
  version: LatestApprovedVersionRow;
  paramOverrides: ParamOverridesByType;
  practitionerTypeDefaults: import("../../domain/exercise-params.js").ExerciseParams;
  globalTypeDefaults: import("../../domain/exercise-params.js").ExerciseParams;
}): ResolvedExerciseParams {
  return resolveExerciseParams({
    prescriptionType: input.prescriptionType,
    paramOverrides: input.paramOverrides,
    practitionerTypeDefaults: input.practitionerTypeDefaults,
    globalTypeDefaults: input.globalTypeDefaults,
  });
}

export function parsePractitionerParamOverrides(raw: string): ParamOverridesByType {
  try {
    return JSON.parse(raw) as ParamOverridesByType;
  } catch {
    return {};
  }
}

export function parsePractitionerTextOverrides(raw: string): TextOverrides {
  try {
    return parseTextOverridesJson(raw);
  } catch {
    return {};
  }
}
