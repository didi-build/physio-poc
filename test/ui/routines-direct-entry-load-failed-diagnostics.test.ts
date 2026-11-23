import { describe, expect, it } from "vitest";
import {
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
      "Diagnosis: bootstrap/session-gate failure (routines.detail read count is 0).",
    );
    const message = formatRoutineDetailLoadFailedTimeoutMessage(
      baseState,
      [],
      [],
      30_000,
    );
    expect(message).toContain(
      "Diagnosis: bootstrap/session-gate failure (routines.detail read count is 0).",
    );
    expect(message).toContain("routines.detail count=0");
    expect(message).toContain(
      "Routine detail load-failed harness wait timed out (30000ms).",
    );
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
      "Diagnosis: possible UI bug (routines.detail read count >= 1 but error slot missing).",
    );
    const message = formatRoutineDetailLoadFailedTimeoutMessage(
      state,
      ["console err"],
      ["page err"],
      30_000,
    );
    expect(message).toContain(
      "Diagnosis: possible UI bug (routines.detail read count >= 1 but error slot missing).",
    );
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
      "Diagnosis: inconclusive terminal state.",
    );
  });
});
