import { describe, expect, it } from "vitest";
import {
  personalChangesUnavailable,
  projectPersonalChanges,
  type RoutineRowComparable,
} from "../src/services/routines/routine-personal-change-projection.js";

const baseRow: RoutineRowComparable = {
  exercise_id: "ex-1",
  exercise_version_id: "ver-1",
  prescription_type: "stretching",
  params: { hold_s: 30, per_day: { min: 1, max: 2 }, days_per_week: 7 },
};

describe("routine personal change projection (DIDI-1022)", () => {
  it("counts dose change at the same position", () => {
    const current = [
      {
        ...baseRow,
        params: { hold_s: 45, per_day: { min: 1, max: 2 }, days_per_week: 7 },
      },
    ];
    const result = projectPersonalChanges([baseRow], current);
    expect(result.baseline_available).toBe(true);
    expect(result.change_count).toBe(1);
    expect(result.your_change_positions).toEqual([0]);
  });

  it("counts removed trailing baseline rows", () => {
    const second: RoutineRowComparable = {
      ...baseRow,
      exercise_id: "ex-2",
      exercise_version_id: "ver-2",
    };
    const result = projectPersonalChanges([baseRow, second], [baseRow]);
    expect(result.change_count).toBe(1);
    expect(result.your_change_positions).toEqual([]);
  });

  it("counts added row without matching baseline position", () => {
    const second: RoutineRowComparable = {
      ...baseRow,
      exercise_id: "ex-2",
      exercise_version_id: "ver-2",
    };
    const result = projectPersonalChanges([baseRow], [baseRow, second]);
    expect(result.change_count).toBe(1);
    expect(result.your_change_positions).toEqual([1]);
  });

  it("treats duplicate exercises at different positions independently", () => {
    const dup: RoutineRowComparable = {
      ...baseRow,
      exercise_id: "ex-2",
      exercise_version_id: "ver-2",
    };
    const baseline = [baseRow, dup];
    const current = [dup, baseRow];
    const result = projectPersonalChanges(baseline, current);
    expect(result.change_count).toBe(2);
    expect(result.your_change_positions).toEqual([0, 1]);
  });

  it("returns unavailable shape for missing baseline", () => {
    expect(personalChangesUnavailable()).toEqual({
      baseline_available: false,
      change_count: 0,
      your_change_positions: [],
    });
  });
});
