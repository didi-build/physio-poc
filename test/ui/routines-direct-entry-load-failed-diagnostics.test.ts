import { describe, expect, it } from "vitest";
import {
  ROUTINE_DETAIL_LOAD_FAILED_BOOTSTRAP_DIAGNOSIS,
  ROUTINE_DETAIL_LOAD_FAILED_INCONCLUSIVE_DIAGNOSIS,
  ROUTINE_DETAIL_LOAD_FAILED_UI_BUG_DIAGNOSIS,
  formatRoutineDetailLoadFailedTimeoutMessage,
  routineDetailLoadFailedDiagnosis,
  type RoutineDetailLoadFailedProbeState,
} from "./routines-direct-entry-load-failed-diagnostics.js";

const baseState: RoutineDetailLoadFailedProbeState = {
  routinesDetailCount: 0,
  busyPresent: true,
  errorSlotPresent: false,
  errorSlotInRtDetail: false,
  layoutRootPresent: true,
  rtDetailPresent: true,
  href: "http://127.0.0.1:0/?fixture=routines-detail-load-failed",
};

describe("routines direct entry load-failed timeout diagnostics", () => {
  it("labels count 0 as bootstrap/session-gate failure", () => {
    expect(routineDetailLoadFailedDiagnosis(baseState)).toBe(
      ROUTINE_DETAIL_LOAD_FAILED_BOOTSTRAP_DIAGNOSIS,
    );
    const message = formatRoutineDetailLoadFailedTimeoutMessage(
      baseState,
      [],
      [],
      30_000,
    );
    expect(message).toContain(ROUTINE_DETAIL_LOAD_FAILED_BOOTSTRAP_DIAGNOSIS);
    expect(message).toContain("routines.detail count=0");
  });

  it("labels count >= 1 without error slot as possible UI bug", () => {
    const state = {
      ...baseState,
      routinesDetailCount: 1,
      busyPresent: false,
      errorSlotPresent: false,
      errorSlotInRtDetail: false,
    };
    expect(routineDetailLoadFailedDiagnosis(state)).toBe(
      ROUTINE_DETAIL_LOAD_FAILED_UI_BUG_DIAGNOSIS,
    );
    const message = formatRoutineDetailLoadFailedTimeoutMessage(
      state,
      ["console err"],
      ["page err"],
      30_000,
    );
    expect(message).toContain(ROUTINE_DETAIL_LOAD_FAILED_UI_BUG_DIAGNOSIS);
    expect(message).toContain("recent console errors: console err");
    expect(message).toContain("recent page errors: page err");
  });

  it("uses inconclusive diagnosis when error slot is present but busy remains", () => {
    const state = {
      ...baseState,
      routinesDetailCount: 1,
      busyPresent: true,
      errorSlotPresent: true,
      errorSlotInRtDetail: true,
    };
    expect(routineDetailLoadFailedDiagnosis(state)).toBe(
      ROUTINE_DETAIL_LOAD_FAILED_INCONCLUSIVE_DIAGNOSIS,
    );
  });
});
