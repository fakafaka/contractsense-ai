import { getDefaultQualityFixtures, runQualityEvaluation } from "../server/analysis-eval";

const fixtures = getDefaultQualityFixtures();
const summary = runQualityEvaluation(fixtures);

console.log("Quality evaluation summary");
console.table(
  summary.results.map((result) => ({
    fixture: result.fixture,
    score: result.score,
    minimumScore: result.minimumScore,
    passed: result.passed,
  })),
);
console.log(`averageScore=${summary.averageScore} passed=${summary.passed} failed=${summary.failed}`);

if (summary.failed > 0) {
  process.exitCode = 1;
}
