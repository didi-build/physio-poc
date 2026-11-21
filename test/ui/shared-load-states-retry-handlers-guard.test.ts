import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const uiRoot = join(fileURLToPath(new URL("../..", import.meta.url)), "src/ui");

const LOAD_RETRY_SOURCES = [
  "programs/ProgramsListPage.tsx",
  "exercise-library/ExerciseLibraryPage.tsx",
  "routines/RoutinesPage.tsx",
  "exercise-requests/RequestsAndDraftsPage.tsx",
  "my-defaults/MyDefaultsPage.tsx",
  "exercise-requests/DraftReviewPage.tsx",
  "programs/ProgramBuilderPage.tsx",
  "exercise-library/ExerciseDetailsPage.tsx",
  "exercise-library/MyCopyEditorPage.tsx",
  "routines/RoutineDetailsPage.tsx",
  "routines/RoutineMyCopyEditorPage.tsx",
  "routines/RoutineEditForEveryonePage.tsx",
  "routines/RoutineVersionHistoryPage.tsx",
  "routines/RoutineDraftEditorPage.tsx",
  "programs/AddExerciseSheet.tsx",
  "programs/ProgramSharePage.tsx",
];

function readUiSource(relativePath: string): string {
  return readFileSync(join(uiRoot, relativePath), "utf8");
}

describe("DIDI-1082 load retry handlers return refresh promises", () => {
  it("does not void session refresh inside onTryAgain handlers", () => {
    const violations: string[] = [];
    for (const path of LOAD_RETRY_SOURCES) {
      const text = readUiSource(path);
      for (const match of text.matchAll(/onTryAgain[\s\S]{0,120}/g)) {
        const snippet = match[0];
        if (/void\s+refresh/.test(snippet)) {
          violations.push(`${relative(uiRoot, join(uiRoot, path))}: ${snippet.trim()}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("list reload helpers return refresh({ force: true })", () => {
    const listPages = [
      "programs/ProgramsListPage.tsx",
      "exercise-library/ExerciseLibraryPage.tsx",
      "routines/RoutinesPage.tsx",
      "my-defaults/MyDefaultsPage.tsx",
    ];
    for (const path of listPages) {
      const text = readUiSource(path);
      expect(text).toMatch(
        /useCallback\(\(\)\s*=>\s*refresh\(\{\s*force:\s*true\s*\}\)/,
      );
    }
  });
});
