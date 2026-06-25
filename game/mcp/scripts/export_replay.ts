#!/usr/bin/env bun
import { parseArgs, stringArg } from "./harness/cli";
import type { HarnessReplay } from "./harness/types";

const usage = (): void => {
    console.log(`Usage: bun scripts/export_replay.ts --input=/path/replay.json [--out=/path/replay.md]

Reads a harness replay JSON and emits a concise Markdown report.
`);
};

const args = parseArgs();
if (args.has("help") || args.has("h")) {
    usage();
    process.exit(0);
}

const inputPath = stringArg(args, "input", "");
if (!inputPath) {
    usage();
    process.exit(2);
}

const replay = (await Bun.file(inputPath).json()) as HarnessReplay;

const actorLabel = (team: "lower" | "upper"): string => {
    const actor = replay.actors[team];
    const controller = actor.controller === "model" ? `model:${actor.modelName ?? "local-model"}` : "builtin";
    return `${team.toUpperCase()} ${controller} ${actor.style}`;
};

const decisionRows = replay.decisions
    .map(
        (decision) =>
            `| ${decision.index} | ${decision.phase} | ${decision.team} | ${decision.source} | ${decision.actionKind} | ${decision.summary.replaceAll("|", "\\|")} | ${decision.eventTypes.join(", ")} |`,
    )
    .join("\n");

const finalUnits = replay.finalState.units
    .map(
        (unit) =>
            `- ${unit.team} ${unit.name}: hp ${unit.hp}/${unit.maxHp}, alive ${unit.amountAlive}, cells ${unit.cells
                .map((cell) => `${cell.x}:${cell.y}`)
                .join(", ")}`,
    )
    .join("\n");

const markdown = `# Heroes MCP Harness Replay

- Match: \`${replay.matchId}\`
- Scenario: \`${replay.scenario}\`
- Actors: ${actorLabel("lower")} vs ${actorLabel("upper")}
- Started: ${replay.startedAt}
- Duration: ${replay.durationMs} ms
- Winner: ${replay.metrics.winner ?? "none"}
- Final lap: ${replay.metrics.finalLap ?? "unknown"}

## Metrics

- Total actions: ${replay.metrics.totalActions}
- Draft actions: ${replay.metrics.draftActions}
- Fight actions: ${replay.metrics.fightActions}
- Model decisions: ${replay.metrics.modelDecisions}
- Built-in decisions: ${replay.metrics.builtinDecisions}
- Fallback decisions: ${replay.metrics.fallbackDecisions}
- Rejected actions: ${replay.metrics.rejectedActions}
- Spell casts: ${replay.metrics.spellCasts}
- Summons: ${replay.metrics.summons}
- Units killed/destroyed: ${replay.metrics.unitsKilled}

## Final Units

${finalUnits || "No surviving units."}

## Decisions

| # | Phase | Team | Source | Kind | Summary | Events |
|---|---|---|---|---|---|---|
${decisionRows}
`;

const outPath = stringArg(args, "out", "");
if (outPath) {
    await Bun.write(outPath, markdown);
    console.log(outPath);
} else {
    console.log(markdown);
}
