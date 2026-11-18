import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const weights = [0.15, 0.10, 0.20, 0.20, 0.15, 0.10, 0.05, 0.05];

async function check(week, filename) {
  const source = await fs.readFile(path.join(root, "src/lib", filename), "utf8");
  const data = JSON.parse(source.slice(source.indexOf(" = ") + 3).trim().replace(/;$/, ""));
  const inputs = data.map(({ details }) => {
    const metrics = Object.fromEntries(details.metrics.map(({ label, value }) => [label, value]));
    function rate(record) {
      const [wins, losses, ties = 0] = record.split("-").map(Number);
      return (wins + ties / 2) / (wins + losses + ties);
    }
    return [rate(details.record), parseFloat(metrics["Point differential"]), rate(metrics["All-play record"]),
      parseFloat(metrics["Lineup today"]), parseFloat(metrics["Expected pts / week"]), parseFloat(metrics["Last 3 weeks · PPG"]),
      parseFloat(metrics["Lineup efficiency"]), -Number(metrics["Remaining schedule"].match(/\d+/)[0])];
  });
  if (inputs.flat().some((value) => !Number.isFinite(value))) throw Error(`Invalid Week ${week} input.`);
  const means = weights.map((_, j) => inputs.reduce((sum, row) => sum + row[j], 0) / data.length);
  const spreads = means.map((mean, j) => Math.sqrt(inputs.reduce((sum, row) => sum + (row[j] - mean) ** 2, 0) / data.length));
  const weightedZ = inputs.map((row) => row.reduce((sum, value, j) => sum + weights[j] * (spreads[j] ? (value - means[j]) / spreads[j] : 0), 0));
  const predicted = weightedZ.map((value) => 100 + 10 * value);
  const fittedScale = weightedZ.reduce((sum, value, i) => sum + value * (data[i].details.score - 100), 0)
    / weightedZ.reduce((sum, value) => sum + value * value, 0);
  const order = [...data.keys()].sort((a, b) => predicted[b] - predicted[a]);
  const rows = data.map((entry, i) => ({ team: entry.team, publishedRank: i + 1, calculatedRank: order.indexOf(i) + 1,
    publishedScore: entry.details.score, calculatedScore: predicted[i], error: predicted[i] - entry.details.score,
    fittedScore: 100 + fittedScale * weightedZ[i] }));
  const summary = { week, note: "Published snapshot inputs; remaining schedule uses inverted published rank because underlying strength values are unavailable.",
    exactRanks: rows.filter((row) => row.publishedRank === row.calculatedRank).length,
    maxRankDifference: Math.max(...rows.map((row) => Math.abs(row.publishedRank - row.calculatedRank))),
    meanAbsoluteError: rows.reduce((sum, row) => sum + Math.abs(row.error), 0) / rows.length,
    maxAbsoluteError: Math.max(...rows.map((row) => Math.abs(row.error))),
    fittedScale,
    fittedMeanAbsoluteError: rows.reduce((sum, row) => sum + Math.abs(row.fittedScore - row.publishedScore), 0) / rows.length,
    rows };
  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

const reports = [];
for (const [week, filename] of [[8, "week-eight-rankings.ts"], [9, "week-nine-rankings.ts"]]) reports.push(await check(week, filename));
await fs.mkdir(path.join(root, "output", "power-rankings"), { recursive: true });
await fs.writeFile(path.join(root, "output", "power-rankings", "historical-comparison.json"), JSON.stringify(reports, null, 2));
