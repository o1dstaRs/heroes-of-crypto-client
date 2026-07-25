/*
 * build_units_report.ts — turn an ai-meta.summary.json (from measure_ai_meta_cohorts.ts) into a
 * self-contained, filterable CREATURE tier-list HTML report. Sibling of build_report.ts, which does
 * the same for artifacts; both read the same summary, just a different `rankings` dimension.
 *
 *   bun build_units_report.ts <summary.json> <out.html> [--title=] [--policy=] [--exploration=]
 *                             [--images=<dir>] [--cache=<dir>]
 *
 * Creature art is INLINED as base64 data URIs (the Artifact CSP blocks external hosts). Icons are
 * 128px webp: taken from <images>/<key>_128.webp when it exists, otherwise downscaled once from the
 * _256/_512 art with cwebp into <cache>. Units whose art is missing entirely fall back to a monogram.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";

const DEFAULT_POLICY = "contextual-oracle-v2-cast-buffs-80x20";
const DEFAULT_EXPLORATION = 0.2;
const ICON_PX = 128;

interface RawRow {
    cohort: string; map: string | number; key: string | number; name: string; level?: number;
    games: number; wins: number; losses: number; draws: number;
    winRate: number; ciLow: number; ciHigh: number; liftPp: number; scoreRate: number; pickRate: number;
    avgHpMargin?: number; avgSurvivorMargin?: number; imageKey?: string;
}
interface OutRow {
    cohort: string; map: string; key: string; name: string; level: number;
    games: number; wins: number; losses: number; draws: number;
    winRate: number; ciLow: number; ciHigh: number; liftPp: number; scoreRate: number; pickRate: number;
    hpMargin: number; survivorMargin: number;
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
        cohort: r.cohort, map: String(r.map), key: String(r.key), name: r.name, level: Number(r.level ?? 0),
        games: r.games, wins: r.wins, losses: r.losses, draws: r.draws,
        winRate: r.winRate, ciLow: r.ciLow, ciHigh: r.ciHigh, liftPp: r.liftPp,
        scoreRate: r.scoreRate, pickRate: r.pickRate,
        hpMargin: r.avgHpMargin ?? 0, survivorMargin: r.avgSurvivorMargin ?? 0,
    };
}

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

// name -> data URI. Prefers a real _128, else downscales the largest available art once into cache.
function buildIcons(rows: RawRow[], imagesDir: string, cacheDir: string): Record<string, string> {
    const icons: Record<string, string> = {};
    const missing: string[] = [];
    const seen = new Set<string>();
    if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });

    for (const r of rows) {
        if (!r.imageKey || seen.has(r.name)) continue;
        seen.add(r.name);
        const base = String(r.imageKey).replace(/_(128|256|512)$/, "");
        const direct = resolve(imagesDir, `${base}_128.webp`);
        let file = existsSync(direct) ? direct : "";
        if (!file) {
            const source = [`${base}_256.webp`, `${base}_512.webp`]
                .map((f) => resolve(imagesDir, f))
                .find((f) => existsSync(f));
            if (source) {
                const out = resolve(cacheDir, `${base}_${ICON_PX}.webp`);
                if (!existsSync(out)) {
                    execFileSync("cwebp", ["-quiet", "-q", "82", "-resize", String(ICON_PX), "0", source, "-o", out]);
                }
                file = out;
            }
        }
        if (!file) { missing.push(r.name); continue; }
        icons[r.name] = `data:image/webp;base64,${readFileSync(file).toString("base64")}`;
    }
    if (missing.length) console.warn(`  no art for ${missing.length} unit(s): ${missing.join(", ")}`);
    return icons;
}

function main() {
    const { positional, flags } = parseArgs(process.argv.slice(2));
    const [summaryPath, outPath] = positional;
    if (!summaryPath || !outPath) {
        console.error("usage: bun build_units_report.ts <summary.json> <out.html> [--title=] [--images=] [--cache=]");
        process.exit(2);
    }
    const scriptDir = dirname(new URL(import.meta.url).pathname);
    const repoRoot = resolve(scriptDir, "../../../..");
    const imagesDir = flags.images ?? resolve(repoRoot, "game/core/images");
    const cacheDir = flags.cache ?? "/private/tmp/hoc-unit-icons";

    const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
    const raw: RawRow[] = summary.rankings?.units ?? [];
    if (!raw.length) {
        console.error("no rankings.units rows found in summary — nothing to report");
        process.exit(1);
    }
    const units = raw.map(pick);
    const prov = summary.provenance ?? {};
    const cohorts = orderCohorts([...new Set(units.map((r) => r.cohort))], prov.requestedCohorts);
    const maps = orderMaps([...new Set(units.map((r) => r.map))]);
    const levels = [...new Set(units.map((r) => r.level))].filter((l) => l > 0).sort((a, b) => a - b);

    const icons = buildIcons(raw, imagesDir, cacheDir);
    const meta = {
        title: flags.title ?? "Creature Balance",
        cohorts, maps, levels,
        totalFights: prov.totalGames ?? 0,
        gamesPerCohort: prov.gamesPerCohort ?? null,
        seed: prov.baseSeed ?? null,
        profile: prov.fightProfile?.name ?? prov.fightProfile ?? prov.fightVersion ?? "v0.8",
        policy: flags.policy ?? prov.selectionPolicy ?? DEFAULT_POLICY,
        explorationRate: flags.exploration != null ? Number(flags.exploration) : (prov.explorationRate ?? DEFAULT_EXPLORATION),
        generatedAt: summary.generatedAt ?? null,
        commonCommit: prov.commonCommit ? String(prov.commonCommit).slice(0, 7) : null,
        unitCount: new Set(units.map((r) => r.name)).size,
    };

    const template = readFileSync(resolve(scriptDir, "units_template.html"), "utf8");
    const dataJson = JSON.stringify({ meta, units, icons });
    const html = template.replace("/*__DATA__*/{}", () => dataJson);
    writeFileSync(outPath, html);

    console.log(`wrote ${outPath}`);
    console.log(`  ${meta.title}`);
    console.log(`  ${meta.totalFights.toLocaleString()} fights · ${meta.unitCount} creatures · levels ${levels.join("/")}`);
    console.log(`  rows: ${units.length}  ·  icons: ${Object.keys(icons).length}  ·  size: ${(html.length / 1024).toFixed(0)} KB`);
}

main();
