import { evaluateAnalysisQuality, type AnalysisResult } from "./contract-analyzer";

export type QualityFixture = {
  name: string;
  minimumScore: number;
  analysis: Pick<AnalysisResult, "summary" | "mainObligations" | "potentialRisks" | "redFlags" | "mode">;
};

export type QualityEvalResult = {
  fixture: string;
  score: number;
  minimumScore: number;
  passed: boolean;
  suggestions: string[];
};

export function getDefaultQualityFixtures(): QualityFixture[] {
  return [
    {
      name: "quick-good",
      minimumScore: 80,
      analysis: {
        mode: "quick",
        summary:
          "This contract sets monthly payments, confidentiality requirements, and termination notice timelines between the provider and client.",
        mainObligations: [
          "The document states payment is due monthly",
          "The agreement indicates each side keeps information confidential",
          "This clause requires 30-day written termination notice",
        ],
        potentialRisks: [
          { title: "Late payment fees", description: "Late invoices may accrue additional fees", severity: "medium" },
          { title: "Auto-renewal term", description: "The contract may renew without explicit confirmation", severity: "medium" },
          { title: "Broad indemnity", description: "One side may carry broad third-party claims", severity: "high" },
        ],
        redFlags: [
          { category: "payment", title: "Unclear fee changes", description: "Future fee adjustment terms are vague" },
          { category: "termination", title: "Uneven exit rights", description: "Only one side has immediate termination rights" },
          { category: "liability", title: "High liability exposure", description: "Damages cap is not clearly limited" },
        ],
      },
    },
    {
      name: "quick-poor",
      minimumScore: 0,
      analysis: {
        mode: "quick",
        summary: "You must sign this now.",
        mainObligations: ["You must pay"],
        potentialRisks: [{ title: "Risk", description: "Bad", severity: "high" }],
        redFlags: [{ category: "other", title: "Flag", description: "Bad" }],
      },
    },
  ];
}

export function runQualityEvaluation(fixtures: QualityFixture[]) {
  const results: QualityEvalResult[] = fixtures.map((fixture) => {
    const report = evaluateAnalysisQuality(fixture.analysis);
    return {
      fixture: fixture.name,
      score: report.score,
      minimumScore: fixture.minimumScore,
      passed: report.score >= fixture.minimumScore,
      suggestions: report.suggestions,
    };
  });

  const passed = results.filter((result) => result.passed).length;
  const failed = results.length - passed;
  const averageScore =
    results.length > 0
      ? Math.round(results.reduce((sum, result) => sum + result.score, 0) / results.length)
      : 0;

  return {
    passed,
    failed,
    averageScore,
    results,
  };
}
