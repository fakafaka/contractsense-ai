import { describe, expect, it } from "vitest";
import { evaluateAnalysisQuality } from "../server/contract-analyzer";
import { getDefaultQualityFixtures, runQualityEvaluation } from "../server/analysis-eval";

describe("analysis quality scoring", () => {
  it("returns lower score for imperative low-structure outputs", () => {
    const poor = evaluateAnalysisQuality({
      mode: "standard",
      summary: "You must sign this contract immediately.",
      mainObligations: ["You must pay now"],
      potentialRisks: [{ title: "Risk", description: "Bad", severity: "high" }],
      redFlags: [{ category: "other", title: "Flag", description: "Bad" }],
    });

    expect(poor.score).toBeLessThan(60);
    expect(poor.checks.neutralToneOk).toBe(false);
    expect(poor.suggestions.length).toBeGreaterThan(0);
  });

  it("passes baseline fixture evaluation for growth harness", () => {
    const summary = runQualityEvaluation(getDefaultQualityFixtures());
    expect(summary.results.length).toBeGreaterThan(0);
    expect(summary.passed).toBeGreaterThan(0);
    expect(summary.averageScore).toBeGreaterThan(0);
  });
});
