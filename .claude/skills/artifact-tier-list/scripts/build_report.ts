/*
 * build_report.ts — turn an ai-meta.summary.json (from measure_ai_meta_cohorts.ts) into a
 * self-contained, filterable artifact tier-list HTML report. Part of the `artifact-tier-list` skill.
 *
 *   bun build_report.ts <summary.json> <out.html> [--policy=<str>] [--exploration=<0..1>] [--title=<str>]
 *
 * The report is fully data-driven: cohorts, maps, tiers, header and run metadata all come from the
 * summary. Maps are labeled by terrain (GridVals: 1=Open/Normal, 3=Lava, 4=Mountains).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

// AI_META constants (mirror of ai_meta_cohorts_core.ts — not always echoed into the summary provenance).
const DEFAULT_POLICY = "contextual-oracle-v2-cast-buffs-80x20";
const DEFAULT_EXPLORATION = 0.2;

interface RawRow {
    cohort: string; map: string | number; key: string | number; name: string;
    games: number; wins: number; losses: number; draws: number;
    winRate: number; ciLow: number; ciHigh: number; liftPp: number; scoreRate: number; pickRate: number;
}
interface OutRow {
    cohort: string; map: string; key: string; name: string;
    games: number; wins: number; losses: number; draws: number;
    winRate: number; ciLow: number; ciHigh: number; liftPp: number; scoreRate: number; pickRate: number;
}

function parseArgs(argv: string[]) {
    const positional: string[] = [];
    const flags: Record<string, string> = {};
    for (const a of argv) {
        const m = /^--([^=]+)=(.*)$/.exec(a);
        if (m) flags[m[1]] = m[2];
        else positional.push(a);
    }
    return { positional, flags };
}

function pick(r: RawRow): OutRow {
    return {
        cohort: r.cohort, map: String(r.map), key: String(r.key), name: r.name,
        games: r.games, wins: r.wins, losses: r.losses, draws: r.draws,
        winRate: r.winRate, ciLow: r.ciLow, ciHigh: r.ciHigh, liftPp: r.liftPp,
        scoreRate: r.scoreRate, pickRate: r.pickRate,
    };
}

// Cohorts: "all" first, then the summary's requested order; maps: "all","live" then numeric ascending.
function orderCohorts(present: string[], requested: string[] | undefined): string[] {
    const out: string[] = [];
    if (present.includes("all")) out.push("all");
    for (const c of requested ?? []) if (present.includes(c) && !out.includes(c)) out.push(c);
    for (const c of present) if (!out.includes(c)) out.push(c);
    return out;
}
function orderMaps(present: string[]): string[] {
    const head = ["all", "live"].filter((m) => present.includes(m));
    const nums = present.filter((m) => !head.includes(m)).sort((a, b) => Number(a) - Number(b));
    return [...head, ...nums];
}

function main() {
    const { positional, flags } = parseArgs(process.argv.slice(2));
    const [summaryPath, outPath] = positional;
    if (!summaryPath || !outPath) {
        console.error("usage: bun build_report.ts <summary.json> <out.html> [--policy=] [--exploration=] [--title=]");
        process.exit(2);
    }
    const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
    const rankings = summary.rankings ?? {};
    const t1 = (rankings.artifactsT1 ?? []).map(pick);
    const t2 = (rankings.artifactsT2 ?? []).map(pick);
    if (!t1.length && !t2.length) {
        console.error("no artifactsT1/artifactsT2 rows found in summary — nothing to report");
        process.exit(1);
    }
    const prov = summary.provenance ?? {};
    const anyRows: OutRow[] = t1.length ? t1 : t2;
    const cohorts = orderCohorts([...new Set(anyRows.map((r) => r.cohort))], prov.requestedCohorts);
    const maps = orderMaps([...new Set(anyRows.map((r) => r.map))]);

    const meta = {
        title: flags.title ?? prov.title ?? "Artifact Balance",
        cohorts, maps,
        totalFights: prov.totalGames ?? anyRows.filter((r) => r.cohort === "all" && r.map === "all").reduce((s, r) => s + r.games, 0),
        gamesPerCohort: prov.gamesPerCohort ?? null,
        seed: prov.baseSeed ?? null,
        profile: prov.fightProfile?.name ?? prov.fightProfile ?? "v0.8",
        policy: flags.policy ?? DEFAULT_POLICY,
        explorationRate: flags.exploration != null ? Number(flags.exploration) : DEFAULT_EXPLORATION,
        generatedAt: summary.generatedAt ?? null,
    };

    const templatePath = resolve(dirname(new URL(import.meta.url).pathname), "report_template.html");
    const template = readFileSync(templatePath, "utf8");
    const dataJson = JSON.stringify({ meta, t1, t2 });
    // Function replacement so `$` sequences in artifact names aren't treated as replacement patterns.
    const html = template.replace("/*__DATA__*/{}", () => dataJson);
    writeFileSync(outPath, html);

    console.log(`wrote ${outPath}`);
    console.log(`  ${meta.title}`);
    console.log(`  ${meta.totalFights.toLocaleString()} fights · ${cohorts.length} cohort slices · maps: ${maps.map((m) => m).join(", ")}`);
    console.log(`  T1 rows: ${t1.length}  T2 rows: ${t2.length}  ·  size: ${(html.length / 1024).toFixed(0)} KB`);
}

main();
