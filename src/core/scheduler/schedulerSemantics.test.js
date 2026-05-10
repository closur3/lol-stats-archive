import { describe, expect, it } from "vitest";
import { assertLeagueState, derivePhase } from "./scheduleState.js";
import { shouldRunPlayLeagueAt } from "./cronBuckets.js";

describe("scheduler semantics", () => {
  it("throws when play window is out of range", () => {
    expect(() => assertLeagueState("lck", {
      phase: "play",
      playStartHour: 25,
      playEndHour: 23
    })).toThrow(/play window out of range/);
  });

  it("play phase only when unfinished and now in play window", () => {
    const now = new Date("2026-05-11T10:00:00Z");
    const leagueState = { phase: "idle", playStartHour: 8, playEndHour: 11 };
    const meta = { todayUnfinished: 1, hasHistoryUnfinished: false };
    expect(derivePhase(leagueState, meta, now)).toBe("play");
    expect(shouldRunPlayLeagueAt(leagueState, now)).toBe(true);
  });

  it("idle phase when outside play window even if unfinished", () => {
    const now = new Date("2026-05-11T12:00:00Z");
    const leagueState = { phase: "idle", playStartHour: 8, playEndHour: 11 };
    const meta = { todayUnfinished: 1, hasHistoryUnfinished: false };
    expect(derivePhase(leagueState, meta, now)).toBe("idle");
    expect(shouldRunPlayLeagueAt(leagueState, now)).toBe(false);
  });
});

