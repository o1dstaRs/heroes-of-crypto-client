#!/usr/bin/env bun
import { parseActor, parseArgs, parseScenario, parseStyle, stringArg, numberArg, boolArg } from "./harness/cli";
import { runHarnessMatch } from "./harness/runner";

const usage = (): void => {
    console.log(`Usage: bun scripts/run_match.ts [options]

Options:
  --scenario=draft|quickstart|approach|priority_targets|spell_duel|summon_duel
  --lower=builtin|model[:name]
  --upper=builtin|model[:name]
  --style=balanced|aggressive|defensive
  --model-api-base=http://127.0.0.1:9091/
  --model=auto
  --timeout-ms=20000
  --max-actions=500
  --mechanics=true|false
  --out=/path/replay.json

Environment defaults:
  HOC_MODEL_API_BASE, HOC_MODEL_NAME, HOC_AI_STYLE, HOC_MODEL_TIMEOUT_MS, HOC_MODEL_STREAM, HOC_MODEL_TEMPERATURE
`);
};

const args = parseArgs();
if (args.has("help") || args.has("h")) {
    usage();
    process.exit(0);
}

const modelApiBase = stringArg(args, "model-api-base", process.env.HOC_MODEL_API_BASE ?? "http://127.0.0.1:9091/");
const modelName = stringArg(args, "model", process.env.HOC_MODEL_NAME ?? "auto");
const style = parseStyle(stringArg(args, "style", process.env.HOC_AI_STYLE ?? "balanced"));
const timeoutMs = numberArg(args, "timeout-ms", Number(process.env.HOC_MODEL_TIMEOUT_MS ?? 20000));
const defaults = { modelApiBase, modelName, style, timeoutMs };

const replay = await runHarnessMatch({
    matchId: stringArg(args, "match-id", `mcp-harness-${Date.now()}`),
    scenario: parseScenario(stringArg(args, "scenario", "draft")),
    lower: parseActor(stringArg(args, "lower", "builtin"), "LOWER", defaults),
    upper: parseActor(stringArg(args, "upper", "model"), "UPPER", defaults),
    maxActions: numberArg(args, "max-actions", 500),
    includeMechanicsContext: boolArg(args, "mechanics", true),
});

const output = JSON.stringify(replay, null, 2);
const outPath = stringArg(args, "out", "");
if (outPath) {
    await Bun.write(outPath, output);
    console.log(outPath);
} else {
    console.log(output);
}
