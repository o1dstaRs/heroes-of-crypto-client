#!/usr/bin/env bun

import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";

type JsonRecord = Record<string, unknown>;

const KNOWN_COHORTS = [
    "ranked-draft",
    "uniform-mixed",
    "ranged-heavy",
    "ground-melee",
    "flyer-heavy",
    "caster-support",
    "cross-archetype",
] as const;
const LIVE_MAPS = [1, 3, 4] as const;
const LEGACY_WATER_MAPS = [1, 2, 3, 4] as const;
const LEGACY_CATEGORY_KEYS = ["units", "artifactsT1", "artifactsT2", "augmentPlans", "augmentLevels"] as const;
const CATEGORY_KEYS = [...LEGACY_CATEGORY_KEYS, "synergies"] as const;
const EXPECTED_SYNERGY_KEYS = [
    ["Life", 1],
    ["Life", 2],
    ["Chaos", 1],
    ["Chaos", 2],
    ["Might", 1],
    ["Might", 2],
    ["Nature", 1],
    ["Nature", 2],
].flatMap(([faction, synergy]) => [1, 2, 3].map((level) => `${faction}:${synergy}:${level}`));
// v09-draft-a19-work stays here for historical summaries only: the profile was removed on 2026-11-26.
const FIGHT_PROFILE_IDS = [
    "a13",
    "a19",
    "a19-work",
    "a19-bot-seat",
    "v09-draft-a19-work",
    "ranked-current-a19-work",
    "ranked-current-zig-work",
] as const;
type FightProfileId = (typeof FIGHT_PROFILE_IDS)[number];

interface CliOptions {
    operation: "source" | "validate" | "findings";
    summaryPath?: string;
    commonRoot?: string;
    expectedGames?: number;
    expectedSeed?: number;
    expectedCohorts?: string[];
    expectedFightProfile?: FightProfileId;
    reportPath?: string;
    top: number;
    allowLegacyWater: boolean;
    requireSynergies: boolean;
}

interface ValidationContext {
    summary: JsonRecord;
    provenance: JsonRecord;
    requestedCohorts: string[];
    gamesPerCohort: number;
    maps: number[];
    legacyWater: boolean;
    expectedUnits: string[];
}

class Audit {
    public readonly errors: string[] = [];
    public readonly warnings: string[] = [];

    public check(condition: unknown, message: string): condition is true {
        if (!condition) this.errors.push(message);
        return Boolean(condition);
    }

    public warn(condition: unknown, message: string): void {
        if (!condition) this.warnings.push(message);
    }

    public finish(label: string): void {
        for (const warning of this.warnings) console.warn(`warning: ${warning}`);
        if (this.errors.length) {
            const details = this.errors.map((error) => `  - ${error}`).join("\n");
            throw new Error(`${label} failed with ${this.errors.length} error(s):\n${details}`);
        }
    }
}

const usage = (): string => `Heroes of Crypto AI meta summary validator and findings extractor

Usage:
  bun validate_ai_meta_summary.ts source --common-root PATH
  bun validate_ai_meta_summary.ts validate SUMMARY [options]
  bun validate_ai_meta_summary.ts findings SUMMARY [options]

Options:
  --common-root PATH       heroes-of-crypto-common root (auto-detected when possible)
  --expect-games N         Expected fights per cohort
  --expect-seed N          Expected base seed
  --expect-cohorts CSV     Expected ordered cohort list
  --expect-fight-profile ID Expected a13, a19, or a19-work profile
  --report PATH            Also validate the generated standalone HTML
  --top N                  Findings per category (default: 3)
  --allow-legacy-water     Permit old map set 1/2/3/4 with a NON-LIVE warning
  --require-synergies      Require the current exact choice/level synergy dimension

Strict validation requires live maps 1 NORMAL, 3 LAVA_CENTER, and 4 BLOCK_CENTER.
`;

const isRecord = (value: unknown): value is JsonRecord =>
    value !== null && typeof value === "object" && !Array.isArray(value);

const record = (value: unknown): JsonRecord => (isRecord(value) ? value : {});

const finiteNumber = (value: unknown): number | undefined =>
    typeof value === "number" && Number.isFinite(value) ? value : undefined;

const integer = (value: unknown): number | undefined => {
    const number = finiteNumber(value);
    return number !== undefined && Number.isSafeInteger(number) ? number : undefined;
};

const stringValue = (value: unknown): string | undefined =>
    typeof value === "string" && value.trim() ? value.trim() : undefined;

const unique = <T>(values: readonly T[]): boolean => new Set(values).size === values.length;

const sameNumbers = (left: readonly number[], right: readonly number[]): boolean =>
    left.length === right.length && left.every((value, index) => value === right[index]);

const sortedNumbers = (values: readonly number[]): number[] => [...values].sort((left, right) => left - right);

const knownCohort = (value: string): boolean => (KNOWN_COHORTS as readonly string[]).includes(value);

function parsePositiveInteger(option: string, value: string, minimum = 1): number {
    if (!/^[0-9]+$/.test(value)) throw new Error(`${option} must be an integer; got ${value}`);
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < minimum) {
        throw new Error(`${option} must be a safe integer >= ${minimum}; got ${value}`);
    }
    return parsed;
}

function parseCohorts(csv: string): string[] {
    const cohorts = csv.split(",").map((value) => value.trim());
    if (!cohorts.length || cohorts.some((value) => !value)) throw new Error("cohort CSV contains an empty entry");
    const unknown = cohorts.filter((value) => !knownCohort(value));
    if (unknown.length) throw new Error(`unknown cohort(s): ${unknown.join(", ")}`);
    if (!unique(cohorts)) throw new Error(`duplicate cohort(s) in: ${csv}`);
    return cohorts;
}

function parseFightProfile(value: string): FightProfileId {
    if ((FIGHT_PROFILE_IDS as readonly string[]).includes(value)) {
        return value as FightProfileId;
    }
    throw new Error(`--expect-fight-profile must be one of ${FIGHT_PROFILE_IDS.join(", ")}; got ${value}`);
}

function parseArguments(argv: readonly string[]): CliOptions | undefined {
    if (!argv.length || argv[0] === "help" || argv[0] === "--help" || argv[0] === "-h") {
        console.log(usage());
        return undefined;
    }
    const operation = argv[0];
    if (operation !== "source" && operation !== "validate" && operation !== "findings") {
        throw new Error(`unknown operation '${operation}'`);
    }
    const options: CliOptions = {
        operation,
        top: 3,
        allowLegacyWater: false,
        requireSynergies: false,
    };
    let index = 1;
    if (operation !== "source") {
        const summary = argv[index];
        if (!summary || summary.startsWith("--")) throw new Error(`${operation} requires SUMMARY`);
        options.summaryPath = resolve(summary);
        index += 1;
    }
    while (index < argv.length) {
        const option = argv[index];
        if (option === "--allow-legacy-water") {
            options.allowLegacyWater = true;
            index += 1;
            continue;
        }
        if (option === "--require-synergies") {
            options.requireSynergies = true;
            index += 1;
            continue;
        }
        const value = argv[index + 1];
        if (!value) throw new Error(`${option} requires a value`);
        switch (option) {
            case "--common-root":
                options.commonRoot = resolve(value);
                break;
            case "--expect-games":
                options.expectedGames = parsePositiveInteger(option, value, 6);
                break;
            case "--expect-seed":
                options.expectedSeed = parsePositiveInteger(option, value, 0);
                break;
            case "--expect-cohorts":
                options.expectedCohorts = parseCohorts(value);
                break;
            case "--expect-fight-profile":
                options.expectedFightProfile = parseFightProfile(value);
                break;
            case "--report":
                options.reportPath = resolve(value);
                break;
            case "--top":
                options.top = parsePositiveInteger(option, value);
                if (options.top > 20) throw new Error("--top cannot exceed 20");
                break;
            default:
                throw new Error(`unknown option '${option}'`);
        }
        index += 2;
    }
    if (options.allowLegacyWater && operation === "source") {
        throw new Error("--allow-legacy-water is not valid for source checks");
    }
    return options;
}

function findCommonRoot(requested?: string): string {
    if (requested) {
        const candidate = realpathSync(requested);
        if (existsSync(resolve(candidate, "src/simulation/measure_ai_meta_cohorts.ts"))) return candidate;
        const nested = resolve(candidate, "game/heroes-of-crypto-common");
        if (existsSync(resolve(nested, "src/simulation/measure_ai_meta_cohorts.ts"))) return realpathSync(nested);
        throw new Error(`not a common-package or client root: ${requested}`);
    }
    let candidate = resolve(process.cwd());
    while (true) {
        if (existsSync(resolve(candidate, "src/simulation/measure_ai_meta_cohorts.ts"))) return realpathSync(candidate);
        const nested = resolve(candidate, "game/heroes-of-crypto-common");
        if (existsSync(resolve(nested, "src/simulation/measure_ai_meta_cohorts.ts"))) return realpathSync(nested);
        const parent = dirname(candidate);
        if (parent === candidate) break;
        candidate = parent;
    }
    throw new Error("cannot auto-detect heroes-of-crypto-common; pass --common-root PATH");
}

function readJson(path: string): unknown {
    if (!existsSync(path)) throw new Error(`file does not exist: ${path}`);
    try {
        return JSON.parse(readFileSync(path, "utf8")) as unknown;
    } catch (error) {
        throw new Error(`cannot parse JSON ${path}: ${error instanceof Error ? error.message : String(error)}`);
    }
}

function expectedDraftableUnits(commonRoot: string): string[] {
    const creaturesPath = resolve(commonRoot, "src/configuration/creatures.json");
    const enumPath = resolve(commonRoot, "src/generated/protobuf/v1/types.ts");
    const generatedCatalogPath = resolve(commonRoot, "src/generated/protobuf/v1/creature_gen.ts");
    const creatures = record(readJson(creaturesPath));
    const enumSource = readFileSync(enumPath, "utf8");
    const block = /export enum CreatureVals\s*\{([\s\S]*?)\n\s*\}/.exec(enumSource)?.[1];
    if (!block) throw new Error(`cannot locate CreatureVals in ${enumPath}`);
    const creatureIds = new Map<string, number>();
    for (const match of block.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*([0-9]+)\s*,?\s*$/gm)) {
        const id = Number(match[2]);
        if (id > 0) creatureIds.set(match[1], id);
    }

    const generatedCatalog = readFileSync(generatedCatalogPath, "utf8");
    const levelBlock = /export const CreatureLevels:[^=]+=\s*\{([\s\S]*?)\n\};/.exec(generatedCatalog)?.[1];
    if (!levelBlock) {
        throw new Error(`cannot locate CreatureLevels in ${generatedCatalogPath}`);
    }
    const draftableIds = new Set<number>();
    for (const match of levelBlock.matchAll(/^\s*["']?([0-9]+)["']?\s*:\s*([0-9]+)\s*,?\s*$/gm)) {
        const id = Number(match[1]);
        const level = Number(match[2]);
        if (level >= 1 && level <= 4) draftableIds.add(id);
    }

    const names: string[] = [];
    for (const value of Object.values(creatures)) {
        if (!isRecord(value)) continue;
        for (const [name, configuration] of Object.entries(value)) {
            const settings = record(configuration);
            const enumKey = name.toUpperCase().replace(/ /g, "_");
            const creatureId = creatureIds.get(enumKey);
            if (
                creatureId !== undefined &&
                draftableIds.has(creatureId) &&
                integer(settings.level) !== undefined &&
                integer(settings.size) !== undefined
            ) {
                names.push(name);
            }
        }
    }
    if (!names.length) throw new Error("draftable creature catalog is empty");
    if (!unique(names)) throw new Error("draftable creature catalog contains duplicate display names");
    return names.sort((left, right) => left.localeCompare(right));
}

function sourceCheck(commonRoot: string): void {
    const audit = new Audit();
    const required = [
        "src/simulation/ai_meta_cohorts_core.ts",
        "src/simulation/ai_meta_cohorts_worker.ts",
        "src/generated/protobuf/v1/creature_gen.ts",
        "src/simulation/measure_ai_meta_cohorts.ts",
        "src/simulation/render_ai_meta_report.ts",
        "test/simulation/ai_meta_cohorts.test.ts",
        "test/simulation/render_ai_meta_report.test.ts",
    ];
    for (const path of required) audit.check(existsSync(resolve(commonRoot, path)), `missing required source: ${path}`);

    const corePath = resolve(commonRoot, "src/simulation/ai_meta_cohorts_core.ts");
    if (existsSync(corePath)) {
        const source = readFileSync(corePath, "utf8");
        const mapBlock = /export const AI_META_MAPS\s*=\s*\[([\s\S]*?)\]\s*as const/.exec(source)?.[1] ?? "";
        const mapNames = [...mapBlock.matchAll(/PBTypes\.GridVals\.([A-Z0-9_]+)/g)].map((match) => match[1]);
        audit.check(
            JSON.stringify(mapNames) === JSON.stringify(["NORMAL", "LAVA_CENTER", "BLOCK_CENTER"]),
            `AI_META_MAPS must be exactly NORMAL,LAVA_CENTER,BLOCK_CENTER; found ${mapNames.join(",") || "none"}`,
        );
        const cohortBlock = /export const AI_META_COHORTS\s*=\s*\[([\s\S]*?)\]\s*as const/.exec(source)?.[1] ?? "";
        const cohortNames = [...cohortBlock.matchAll(/["']([^"']+)["']/g)].map((match) => match[1]);
        audit.check(
            JSON.stringify(cohortNames) === JSON.stringify(KNOWN_COHORTS),
            `AI_META_COHORTS differs from the seven preregistered cohorts: ${cohortNames.join(",") || "none"}`,
        );
        audit.check(/AI_META_FIGHT_VERSION\s*=\s*["']v0\.8["']/.test(source), "AI_META_FIGHT_VERSION must be v0.8");
        audit.check(
            /AI_META_FIGHT_PROFILE\s*=\s*["']v0\.8\+a13["']/.test(source),
            "AI_META_FIGHT_PROFILE must be v0.8+a13",
        );
        audit.check(
            /AI_META_SYNERGY_TRACKING\s*=\s*["']exact-active-choice-level-v1["']/.test(source),
            "AI_META_SYNERGY_TRACKING must use exact active choice/level rows",
        );
    }
    const measurePath = resolve(commonRoot, "src/simulation/measure_ai_meta_cohorts.ts");
    if (existsSync(measurePath)) {
        const source = readFileSync(measurePath, "utf8");
        audit.check(
            /V08_A13_SEARCH:\s*["']1["']/.test(source),
            "AI meta workers must explicitly force V08_A13_SEARCH=1",
        );
        audit.check(
            /buildV08A19SearchEnvironment/.test(source) && /V08_A19_SEARCH:\s*["']1["']/.test(source),
            "AI meta workers must register the explicit V08_A19_SEARCH=1 production profile",
        );
        audit.check(/synergies:\s*\[\]/.test(source), "AI meta rankings must initialize the synergy dimension");
        audit.check(
            /executionHost:\s*\{/.test(source),
            "AI meta provenance must record the execution host for deadline-bounded fight profiles",
        );
    }
    const units = expectedDraftableUnits(commonRoot);
    audit.check(units.length >= 4, `expected at least four draftable units; found ${units.length}`);
    audit.finish("source preflight");
    console.log(
        `Source preflight OK: live maps 1/3/4, ${KNOWN_COHORTS.length} cohorts, ${units.length} draftable units.`,
    );
}

function numberArray(value: unknown): number[] {
    if (!Array.isArray(value)) return [];
    return value.map(integer).filter((entry): entry is number => entry !== undefined);
}

function stringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.map(stringValue).filter((entry): entry is string => entry !== undefined);
}

function rowMap(value: JsonRecord): string {
    const map = value.map;
    if (map === undefined) return "all";
    if (typeof map === "number" && Number.isInteger(map)) return String(map);
    return stringValue(map)?.toLowerCase() ?? "";
}

function validateRateRow(
    audit: Audit,
    value: unknown,
    category: string,
    index: number,
    allowedCohorts: Set<string>,
    allowedMaps: Set<string>,
    mapDimensions: boolean,
): void {
    const row = record(value);
    const prefix = `${category}[${index}]`;
    const cohort = stringValue(row.cohort);
    const map = rowMap(row);
    const key = stringValue(row.key);
    const name = stringValue(row.name);
    audit.check(
        Boolean(cohort && allowedCohorts.has(cohort)),
        `${prefix}.cohort is missing or unexpected: ${cohort ?? "none"}`,
    );
    audit.check(allowedMaps.has(map), `${prefix}.map is missing or unexpected: ${map || "none"}`);
    if (mapDimensions) audit.check(Object.hasOwn(row, "map"), `${prefix}.map is required in a map-dimensional summary`);
    audit.check(Boolean(key), `${prefix}.key is required`);
    audit.check(Boolean(name), `${prefix}.name is required`);
    for (const field of ["pairs", "games", "wins", "losses", "draws", "selected"] as const) {
        const count = integer(row[field]);
        audit.check(count !== undefined && count >= 0, `${prefix}.${field} must be a non-negative integer`);
    }
    for (const field of ["scoreRate", "winRate", "ciLow", "ciHigh", "pickRate"] as const) {
        const rate = finiteNumber(row[field]);
        audit.check(rate !== undefined && rate >= 0 && rate <= 1, `${prefix}.${field} must be within [0,1]`);
    }
    const scoreRate = finiteNumber(row.scoreRate);
    const ciLow = finiteNumber(row.ciLow);
    const ciHigh = finiteNumber(row.ciHigh);
    if (scoreRate !== undefined && ciLow !== undefined && ciHigh !== undefined) {
        audit.check(ciLow <= ciHigh, `${prefix} confidence interval is reversed`);
        audit.check(scoreRate + 1e-12 >= ciLow && scoreRate - 1e-12 <= ciHigh, `${prefix} scoreRate is outside its CI`);
    }
}

async function gzipLineCount(path: string): Promise<{ bytes: number; lines: number; endsWithNewline: boolean }> {
    let bytes = 0;
    let lines = 0;
    let finalByte = -1;
    const sink = new Writable({
        write(chunk: Buffer, _encoding, callback) {
            bytes += chunk.length;
            for (const byte of chunk) if (byte === 10) lines += 1;
            if (chunk.length) finalByte = chunk[chunk.length - 1];
            callback();
        },
    });
    await pipeline(createReadStream(path), createGunzip(), sink);
    return { bytes, lines, endsWithNewline: finalByte === 10 };
}

function mapMode(
    audit: Audit,
    provenance: JsonRecord,
    allowLegacyWater: boolean,
    hasLiveDimension: boolean,
): { maps: number[]; legacy: boolean } {
    const maps = sortedNumbers(numberArray(provenance.maps));
    if (sameNumbers(maps, LIVE_MAPS)) return { maps, legacy: false };
    if (sameNumbers(maps, LEGACY_WATER_MAPS) && (allowLegacyWater || hasLiveDimension)) {
        audit.warnings.push(
            "NON-LIVE LEGACY RESULT: map 2 WATER_CENTER is disabled; do not use this summary as current balance evidence.",
        );
        return { maps, legacy: true };
    }
    audit.check(false, `provenance.maps must be exactly live IDs 1,3,4; found [${maps.join(",")}]`);
    return { maps, legacy: false };
}

function currentSourceFingerprint(commonRoot: string): string {
    const hash = createHash("sha256");
    const visit = (directory: string): string[] =>
        readdirSync(resolve(commonRoot, directory), { withFileTypes: true })
            .sort((left, right) => left.name.localeCompare(right.name))
            .flatMap((entry) => {
                const path = `${directory}/${entry.name}`;
                return entry.isDirectory() ? visit(path) : entry.isFile() ? [path] : [];
            });
    for (const path of [...visit("src"), "package.json"]) {
        hash.update(path);
        hash.update(readFileSync(resolve(commonRoot, path)));
    }
    return hash.digest("hex");
}

async function validateSummary(options: CliOptions, commonRoot: string): Promise<ValidationContext> {
    const summaryPath = options.summaryPath!;
    const parsed = readJson(summaryPath);
    const audit = new Audit();
    audit.check(isRecord(parsed), "summary root must be an object");
    const summary = record(parsed);
    const provenance = record(summary.provenance);
    const studyProfile = record(provenance.fightProfile).studyProfile;
    const study = await import(resolve(commonRoot, "src/simulation/ai_meta_study.ts"));
    const premiumStudy = study.isPremiumMetaStudy(studyProfile);
    audit.check(summary.complete === true, "summary.complete must be true; partial runs cannot be reported");
    audit.check(integer(summary.schemaVersion) !== undefined, "summary.schemaVersion must be an integer");
    audit.check(Boolean(stringValue(summary.generatedAt)), "summary.generatedAt is required");

    const requestedCohorts = stringArray(provenance.requestedCohorts);
    audit.check(requestedCohorts.length > 0, "provenance.requestedCohorts must be non-empty");
    audit.check(unique(requestedCohorts), "provenance.requestedCohorts contains duplicates");
    audit.check(requestedCohorts.every(knownCohort), "provenance.requestedCohorts contains an unknown cohort");
    if (options.expectedCohorts) {
        audit.check(
            JSON.stringify(requestedCohorts) === JSON.stringify(options.expectedCohorts),
            `requested cohorts differ: expected ${options.expectedCohorts.join(",")}, got ${requestedCohorts.join(",")}`,
        );
    }

    const gamesPerCohort = integer(provenance.gamesPerCohort) ?? 0;
    audit.check(gamesPerCohort >= 6 && gamesPerCohort % 2 === 0, "gamesPerCohort must be a positive even integer");
    if (options.expectedGames !== undefined) {
        audit.check(
            gamesPerCohort === options.expectedGames,
            `expected ${options.expectedGames} games/cohort; got ${gamesPerCohort}`,
        );
    }
    if (options.expectedSeed !== undefined) {
        audit.check(
            integer(provenance.baseSeed) === options.expectedSeed,
            `expected seed ${options.expectedSeed}; got ${String(provenance.baseSeed)}`,
        );
    }

    const rankings = record(summary.rankings);
    const synergyTracking = record(provenance.synergyTracking);
    const declaresSynergyTracking = stringValue(synergyTracking.schema) === "exact-active-choice-level-v1";
    const hasSynergyRows = Array.isArray(rankings.synergies);
    audit.check(
        !options.requireSynergies || (declaresSynergyTracking && hasSynergyRows),
        "current runs must declare synergyTracking and provide rankings.synergies",
    );
    const activeCategoryKeys: readonly string[] =
        declaresSynergyTracking || hasSynergyRows ? CATEGORY_KEYS : LEGACY_CATEGORY_KEYS;
    if (declaresSynergyTracking || options.requireSynergies) {
        const fightProfile = record(provenance.fightProfile);
        const executionHost = record(provenance.executionHost);
        audit.check(
            provenance.fightVersion === "v0.8",
            `current synergy-tracked runs require fightVersion v0.8; got ${String(provenance.fightVersion)}`,
        );
        const isA13 = fightProfile.name === "v0.8+a13" && fightProfile.candidateId === "a13";
        const isA19 = fightProfile.name === "v0.8+a19" && fightProfile.candidateId === "a19";
        const isA19Work =
            fightProfile.name === "v0.8+a19-work" &&
            fightProfile.candidateId === "a19" &&
            fightProfile.searchBudget === "offline-deterministic-work";
        const isBotSeat =
            fightProfile.name === "v0.8+a19-bot-seat" &&
            fightProfile.candidateId === "a19" &&
            fightProfile.searchBudget === "offline-deterministic-work" &&
            isRecord(fightProfile.searchDriver) &&
            fightProfile.searchDriver.id === "a19-bot-seat-deep-fit-v1";
        const isHybrid =
            fightProfile.name === "v0.9-draft+v0.8-a19-work" &&
            fightProfile.candidateId === "a19" &&
            fightProfile.searchBudget === "offline-deterministic-work" &&
            fightProfile.draftModelId === "doctrine-draft-v3-20261104" &&
            /^[a-f0-9]{64}$/.test(String(fightProfile.draftModelSha256));
        const isCurrent =
            fightProfile.name === "ranked-current+v0.8-a19-work" &&
            fightProfile.searchBudget === "offline-deterministic-work" &&
            isRecord(fightProfile.authoritativeSource) &&
            fightProfile.studyProfile === "premium-ranked-current-v1";
        const isCurrentZig =
            fightProfile.name === "ranked-current+v0.8-zig-work" &&
            fightProfile.searchBudget === "offline-deterministic-work" &&
            fightProfile.searchBackend === "verified-zig-deepening" &&
            isRecord(fightProfile.authoritativeSource) &&
            fightProfile.studyProfile === "premium-ranked-current-v1";
        const profileMatches: Record<FightProfileId, boolean> = {
            a13: isA13,
            a19: isA19,
            "a19-work": isA19Work,
            "a19-bot-seat": isBotSeat,
            "v09-draft-a19-work": isHybrid,
            "ranked-current-a19-work": isCurrent,
            "ranked-current-zig-work": isCurrentZig,
        };
        audit.check(
            Object.values(profileMatches).some(Boolean),
            "current runs require an explicit a13, a19, a19-work, a19-bot-seat, or v09-draft-a19-work fight profile",
        );
        if (options.expectedFightProfile) {
            audit.check(
                profileMatches[options.expectedFightProfile],
                `fight profile differs from expected ${options.expectedFightProfile}`,
            );
        }
        audit.check(
            /^[a-f0-9]{64}$/.test(stringValue(fightProfile.genomeSha256) ?? ""),
            "fightProfile.genomeSha256 must identify the exact search genome",
        );
        if (isA13) {
            audit.check(
                fightProfile.workerOverride === "V08_A13_SEARCH=1",
                "a13 fightProfile must record the explicit V08_A13_SEARCH=1 worker override",
            );
        }
        if (isA19) {
            const search = record(fightProfile.search);
            audit.check(
                fightProfile.researchOnly === false && fightProfile.productionVersion === "v0.8",
                "a19 fightProfile must be the promoted v0.8 production profile",
            );
            audit.check(integer(search.horizon) === 64, "a19 fightProfile must record SEARCH_HORIZON=64");
            audit.check(
                (isRecord(fightProfile.searchRules) || isRecord(fightProfile.searchPolicy)) &&
                    isRecord(fightProfile.placementPolicy),
                "a19 fightProfile must record its search rules (searchPolicy before 2026-09-20) and placement policy",
            );
            audit.check(
                fightProfile.workerOverride === "V08_A19_SEARCH=1",
                "a19 fightProfile must record the explicit V08_A19_SEARCH=1 worker override",
            );
        }
        audit.check(
            Boolean(stringValue(executionHost.platform)) &&
                Boolean(stringValue(executionHost.architecture)) &&
                Boolean(stringValue(executionHost.osRelease)) &&
                Boolean(stringValue(executionHost.cpuModel)),
            "current runs must record platform, architecture, OS release, and CPU model",
        );
        audit.check(
            (integer(executionHost.logicalCpus) ?? 0) >= 1 &&
                (integer(executionHost.availableParallelism) ?? 0) >= 1 &&
                (integer(executionHost.totalMemoryBytes) ?? 0) >= 1,
            "current runs must record positive CPU and memory execution-host facts",
        );
        audit.check(
            integer(synergyTracking.catalogRows) === EXPECTED_SYNERGY_KEYS.length,
            `synergyTracking.catalogRows must equal ${EXPECTED_SYNERGY_KEYS.length}`,
        );
        audit.check(
            stringArray(provenance.rankingDimensions).includes("synergies"),
            "provenance.rankingDimensions must include synergies",
        );
        audit.check(
            Boolean(stringValue(synergyTracking.policySpec)) &&
                /^[a-f0-9]{64}$/.test(stringValue(synergyTracking.policySha256) ?? ""),
            "synergyTracking must record its deployed policy spec and SHA-256",
        );
    }
    const everyRankingRow = activeCategoryKeys.flatMap((category) =>
        (Array.isArray(rankings[category]) ? rankings[category] : []).map(record),
    );
    const mapDimensions = everyRankingRow.some((row) => Object.hasOwn(row, "map"));
    const hasLiveDimension = everyRankingRow.some((row) => rowMap(row) === "live");
    const mode = mapMode(audit, provenance, options.allowLegacyWater, hasLiveDimension);
    const mapCount = mode.maps.length || LIVE_MAPS.length;
    audit.check(
        premiumStudy || gamesPerCohort % (2 * mapCount) === 0,
        `gamesPerCohort must be divisible by ${2 * mapCount} for seat/map balance`,
    );
    if (!mode.legacy && requestedCohorts.includes("cross-archetype") && gamesPerCohort % 72 !== 0) {
        audit.warnings.push(
            `${gamesPerCohort} games/cohort balances maps but not all 12 cross-archetype x 3-map cells exactly; prefer a multiple of 72.`,
        );
    }

    const cohortValues = Array.isArray(summary.cohorts) ? summary.cohorts : [];
    audit.check(
        cohortValues.length === requestedCohorts.length,
        "summary.cohorts length must equal requested cohort count",
    );
    const cohortRecords = cohortValues.map(record);
    const actualCohorts = cohortRecords.map((cohort) => stringValue(cohort.cohort) ?? "");
    audit.check(unique(actualCohorts), "summary.cohorts contains duplicate cohort IDs");
    audit.check(
        [...actualCohorts].sort().join(",") === [...requestedCohorts].sort().join(","),
        "summary.cohorts does not match provenance.requestedCohorts",
    );

    let totalGames = 0;
    let totalPairs = 0;
    const rawChecks: Promise<void>[] = [];
    const runDirectory = dirname(summaryPath);
    for (const cohort of cohortRecords) {
        const id = stringValue(cohort.cohort) ?? "unknown";
        const games = integer(cohort.games) ?? -1;
        const pairs = integer(cohort.pairs) ?? -1;
        const greenWins = integer(cohort.greenWins) ?? -1;
        const redWins = integer(cohort.redWins) ?? -1;
        const draws = integer(cohort.draws) ?? -1;
        audit.check(games === gamesPerCohort, `${id}.games must equal gamesPerCohort (${gamesPerCohort})`);
        audit.check(pairs >= 0 && pairs * 2 === games, `${id}.pairs must be exactly games/2`);
        audit.check(greenWins >= 0 && redWins >= 0 && draws >= 0, `${id} outcomes must be non-negative integers`);
        audit.check(greenWins + redWins + draws === games, `${id} greenWins + redWins + draws must equal games`);
        for (const field of ["rejectedActions", "distinctRosterViolations", "overlappingCreatureViolations"] as const) {
            audit.check(integer(cohort[field]) === 0, `${id}.${field} must be zero`);
        }

        const mapGames = record(cohort.mapGames);
        const mapKeys = Object.keys(mapGames)
            .filter((key) => /^[0-9]+$/.test(key))
            .map(Number)
            .sort((left, right) => left - right);
        audit.check(
            sameNumbers(mapKeys, mode.maps),
            `${id}.mapGames must contain exactly map IDs ${mode.maps.join(",")}`,
        );
        let mapTotal = 0;
        const mapCounts: number[] = [];
        for (const map of mode.maps) {
            const count = integer(mapGames[String(map)]) ?? -1;
            audit.check(
                count >= 0 && count % 2 === 0,
                `${id}.mapGames[${map}] must be a non-negative even count; got ${count}`,
            );
            mapCounts.push(count);
            mapTotal += Math.max(0, count);
        }
        audit.check(mapTotal === games, `${id}.mapGames must sum to games`);
        audit.check(
            mapCounts.length > 0 && Math.max(...mapCounts) - Math.min(...mapCounts) <= (premiumStudy ? 2 : 0),
            `${id}.mapGames must follow the registered map cycle across ${mapCount} maps`,
        );

        const endReasons = record(cohort.endReasons);
        const endTotal = Object.values(endReasons).reduce(
            (sum: number, value) => sum + Math.max(0, integer(value) ?? 0),
            0,
        );
        audit.check(endTotal === games, `${id}.endReasons must sum to games`);
        totalGames += Math.max(0, games);
        totalPairs += Math.max(0, pairs);

        const rawName = stringValue(cohort.rawPath) ?? "";
        audit.check(Boolean(rawName), `${id}.rawPath is required`);
        audit.check(rawName === basename(rawName), `${id}.rawPath must be a basename, not a path traversal`);
        audit.check(rawName.endsWith(".jsonl.gz"), `${id}.rawPath must end in .jsonl.gz`);
        const rawPath = resolve(runDirectory, rawName);
        const rawRelative = relative(runDirectory, rawPath);
        audit.check(
            !rawRelative.startsWith("..") && !isAbsolute(rawRelative),
            `${id}.rawPath escapes the run directory`,
        );
        if (existsSync(rawPath)) {
            const compressedSize = statSync(rawPath).size;
            audit.check(compressedSize > 0, `${id} raw gzip is empty`);
            rawChecks.push(
                gzipLineCount(rawPath)
                    .then((result) => {
                        audit.check(result.bytes > 0, `${id} raw gzip expands to zero bytes`);
                        audit.check(result.endsWithNewline, `${id} raw JSONL must end with a newline`);
                        audit.check(
                            result.lines === pairs,
                            `${id} raw JSONL has ${result.lines} lines; expected ${pairs}`,
                        );
                    })
                    .catch((error) => {
                        audit.check(
                            false,
                            `${id} raw gzip failed integrity validation: ${error instanceof Error ? error.message : String(error)}`,
                        );
                    }),
            );
        } else {
            audit.check(false, `${id} raw gzip does not exist: ${rawPath}`);
        }
    }
    await Promise.all(rawChecks);

    audit.check(integer(provenance.totalGames) === totalGames, `provenance.totalGames must equal ${totalGames}`);
    audit.check(integer(provenance.totalPairs) === totalPairs, `provenance.totalPairs must equal ${totalPairs}`);
    audit.check(
        totalGames === gamesPerCohort * requestedCohorts.length,
        "total games does not match cohort count x gamesPerCohort",
    );
    audit.check(totalPairs * 2 === totalGames, "totalPairs must be totalGames/2");
    audit.check(finiteNumber(provenance.explorationRate) === 0.2, "explorationRate must be the preregistered 0.2");
    audit.check(Boolean(stringValue(provenance.nonMirroredGuarantee)), "nonMirroredGuarantee provenance is required");
    audit.check(Boolean(stringValue(provenance.seatControl)), "seatControl provenance is required");
    const recordedSourceSha = stringValue(provenance.sourceSha256);
    audit.check(Boolean(recordedSourceSha), "sourceSha256 provenance is required");
    if (recordedSourceSha) {
        const currentSha = currentSourceFingerprint(commonRoot);
        if (currentSha !== recordedSourceSha) {
            audit.warnings.push(
                `current common source fingerprint ${currentSha} differs from run-start ${recordedSourceSha}; ` +
                    "the recorded result remains inspectable, but current source is not the exact run snapshot.",
            );
        }
    }
    audit.check(Boolean(stringValue(provenance.commonCommit)), "commonCommit provenance is required");

    const allowedCohorts = new Set(["all", ...requestedCohorts]);
    const numericMaps = mode.maps.map(String);
    const expectedDimensions = mapDimensions ? ["all", "live", ...numericMaps] : ["all"];
    const allowedMaps = new Set(expectedDimensions);
    for (const category of activeCategoryKeys) {
        const rows = Array.isArray(rankings[category]) ? rankings[category] : [];
        audit.check(rows.length > 0, `rankings.${category} must be non-empty`);
        rows.forEach((row, index) =>
            validateRateRow(audit, row, category, index, allowedCohorts, allowedMaps, mapDimensions),
        );
        const rowRecords = rows.map(record);
        for (const cohort of ["all", ...requestedCohorts]) {
            for (const map of expectedDimensions) {
                audit.check(
                    rowRecords.some((row) => row.cohort === cohort && rowMap(row) === map),
                    `rankings.${category} has no rows for cohort=${cohort}, map=${map}`,
                );
            }
        }
        const identities = rowRecords.map((row) => `${String(row.cohort)}\u0000${rowMap(row)}\u0000${String(row.key)}`);
        audit.check(unique(identities), `rankings.${category} contains duplicate cohort/map/key rows`);
    }

    const expectedUnits = expectedDraftableUnits(commonRoot);
    const aggregateMap = hasLiveDimension ? "live" : "all";
    const unitRows = (Array.isArray(rankings.units) ? rankings.units : []).map(record);
    const pooledUnits = unitRows.filter((row) => row.cohort === "all" && rowMap(row) === aggregateMap);
    const reportedUnits = pooledUnits
        .map((row) => stringValue(row.name))
        .filter((name): name is string => Boolean(name))
        .sort((left, right) => left.localeCompare(right));
    const missingUnits = expectedUnits.filter((name) => !reportedUnits.includes(name));
    const extraUnits = reportedUnits.filter((name) => !expectedUnits.includes(name));
    if (gamesPerCohort >= 10_000 && studyProfile !== "premium-ranked-current-v1") {
        audit.check(
            missingUnits.length === 0,
            `pooled live-map aggregate is missing draftable units: ${missingUnits.join(", ")}`,
        );
    } else if (missingUnits.length > 0) {
        audit.warnings.push(
            `smoke-sized run: pooled live-map aggregate did not sample ${missingUnits.length} draftable unit(s): ${missingUnits.join(", ")}.`,
        );
    }
    audit.check(extraUnits.length === 0, `pooled unit ranking contains non-draftable units: ${extraUnits.join(", ")}`);
    audit.check(unique(reportedUnits), "pooled unit ranking contains duplicate unit names");
    audit.check(
        gamesPerCohort < 10_000 || pooledUnits.every((row) => (integer(row.pairs) ?? 0) > 0),
        "every draftable unit needs pooled observations",
    );

    const artifactsT1 = (Array.isArray(rankings.artifactsT1) ? rankings.artifactsT1 : [])
        .map(record)
        .filter((row) => row.cohort === "all" && rowMap(row) === aggregateMap);
    const artifactsT2 = (Array.isArray(rankings.artifactsT2) ? rankings.artifactsT2 : [])
        .map(record)
        .filter((row) => row.cohort === "all" && rowMap(row) === aggregateMap);
    const augmentPlans = (Array.isArray(rankings.augmentPlans) ? rankings.augmentPlans : [])
        .map(record)
        .filter((row) => row.cohort === "all" && rowMap(row) === aggregateMap);
    audit.check(artifactsT1.length > 1, "pooled T1 artifact ranking must contain multiple choices");
    audit.check(artifactsT2.length > 1, "pooled T2 artifact ranking must contain multiple choices");
    const expectedPlanCount =
        (study.isFullAugmentStudy?.(studyProfile) ?? studyProfile === "premium-ranked-v3")
            ? 783
            : premiumStudy
              ? 273
              : 96;
    audit.check(
        augmentPlans.length === expectedPlanCount,
        `pooled augment-plan ranking must contain all ${expectedPlanCount} collected plans; got ${augmentPlans.length}`,
    );
    const explorationRows = [...artifactsT1, ...artifactsT2, ...augmentPlans];
    const explored = explorationRows.filter((row) => (integer(row.exploreSelections) ?? 0) > 0);
    audit.check(
        studyProfile === "premium-ranked-current-v1" || gamesPerCohort < 10_000 || explored.length > 0,
        "artifact/augment rankings contain no randomized exploration observations",
    );
    if (gamesPerCohort >= 10_000 && studyProfile !== "premium-ranked-current-v1") {
        const unsupported = explorationRows.filter((row) => (integer(row.exploreSelections) ?? 0) <= 0);
        audit.check(
            unsupported.length === 0,
            `${unsupported.length} pooled artifact/augment choices lack exploration support`,
        );
    } else if (explored.length !== explorationRows.length) {
        audit.warnings.push(
            `smoke-sized run: ${explorationRows.length - explored.length} pooled artifact/augment rows have no exploration support; do not interpret strength rankings.`,
        );
    }

    if (activeCategoryKeys.includes("synergies")) {
        const synergyRows = (Array.isArray(rankings.synergies) ? rankings.synergies : [])
            .map(record)
            .filter((row) => row.cohort === "all" && rowMap(row) === aggregateMap);
        const synergyKeys = synergyRows
            .map((row) => stringValue(row.key) ?? "")
            .sort((left, right) => left.localeCompare(right));
        const expectedKeys = [...EXPECTED_SYNERGY_KEYS].sort((left, right) => left.localeCompare(right));
        audit.check(
            JSON.stringify(synergyKeys) === JSON.stringify(expectedKeys),
            `pooled synergy catalog must contain all ${EXPECTED_SYNERGY_KEYS.length} legal choice/level rows`,
        );
        audit.check(
            synergyRows.every(
                (row) =>
                    row.kind === "synergy" &&
                    [1, 2, 3].includes(integer(row.level) ?? 0) &&
                    (integer(row.exploreSelections) ?? -1) === 0 &&
                    integer(row.exploitSelections) === integer(row.selected),
            ),
            "synergy rows must carry exact levels and deterministic (non-exploration) selection counts",
        );
        const selectedSynergies = synergyRows.filter((row) => (integer(row.selected) ?? 0) > 0);
        audit.check(
            selectedSynergies.some((row) => (integer(row.pairs) ?? 0) > 0),
            "synergy rankings contain no exact-key-exclusive observations",
        );
        if (gamesPerCohort >= 10_000 && studyProfile !== "premium-ranked-current-v1") {
            const supportedChoices = new Set(
                selectedSynergies.map((row) => (stringValue(row.key) ?? "").replace(/:[123]$/, "")),
            );
            audit.check(
                supportedChoices.size >= 4,
                `full synergy study must observe at least four deployed faction choices; got ${supportedChoices.size}`,
            );
        }
    }

    if (options.reportPath) {
        validateReport(
            audit,
            options.reportPath,
            summary,
            gamesPerCohort >= 10_000 ? expectedUnits : reportedUnits,
            mode.maps,
            mode.legacy,
            aggregateMap,
            activeCategoryKeys,
        );
    }
    audit.finish("AI meta validation");
    console.log(
        `Validation OK: ${requestedCohorts.length} cohort(s), ${totalGames.toLocaleString()} fights, ` +
            `${totalPairs.toLocaleString()} seat-swapped pairs, maps ${mode.maps.join("/")}, ${expectedUnits.length} draftable units.`,
    );
    return {
        summary,
        provenance,
        requestedCohorts,
        gamesPerCohort,
        maps: mode.maps,
        legacyWater: mode.legacy,
        expectedUnits,
    };
}

function validateReport(
    audit: Audit,
    path: string,
    summary: JsonRecord,
    expectedUnits: readonly string[],
    maps: readonly number[],
    legacyWater: boolean,
    aggregateMap: string,
    categoryKeys: readonly string[],
): void {
    if (!existsSync(path)) {
        audit.check(false, `report does not exist: ${path}`);
        return;
    }
    const html = readFileSync(path, "utf8");
    audit.check(html.length >= 10_000, `report is unexpectedly small (${html.length} bytes)`);
    audit.check(/^<!doctype html>/i.test(html.trimStart()), "report must be a complete HTML document");
    audit.check(/<meta name="viewport"/i.test(html), "report must include a responsive viewport");
    audit.check(/id="cohort-tabs"/.test(html), "report is missing cohort controls");
    audit.check(/id="forest-grid"/.test(html), "report is missing score-rate charts");
    audit.check(
        /class="ranking-table"/.test(html) && /id="ranking-body"/.test(html),
        "report is missing the searchable ranking table",
    );
    audit.check(!/(?:src|href)=["']https?:/i.test(html), "report must not depend on external src/href assets");

    const marker = '<script type="application/json" id="report-data">';
    const start = html.indexOf(marker);
    const end = start >= 0 ? html.indexOf("</script>", start + marker.length) : -1;
    audit.check(start >= 0 && end > start, "report is missing embedded report-data JSON");
    if (start < 0 || end <= start) return;
    let embedded: JsonRecord = {};
    try {
        embedded = record(JSON.parse(html.slice(start + marker.length, end)) as unknown);
    } catch (error) {
        audit.check(
            false,
            `embedded report-data JSON is invalid: ${error instanceof Error ? error.message : String(error)}`,
        );
        return;
    }
    const summaryRankings = record(summary.rankings);
    const expectedRowCount = categoryKeys.reduce(
        (sum, category) => sum + (Array.isArray(summaryRankings[category]) ? summaryRankings[category].length : 0),
        0,
    );
    const rows = Array.isArray(embedded.rows) ? embedded.rows.map(record) : [];
    audit.check(
        rows.length === expectedRowCount,
        `report embeds ${rows.length} ranking rows; summary has ${expectedRowCount}`,
    );
    const reportUnits = rows
        .filter((row) => row.category === "units" && row.cohort === "all" && rowMap(row) === aggregateMap)
        .map((row) => stringValue(row.name))
        .filter((name): name is string => Boolean(name))
        .sort((left, right) => left.localeCompare(right));
    audit.check(
        JSON.stringify(reportUnits) === JSON.stringify(expectedUnits),
        "report pooled live/default-map unit rows must exactly match the validated summary",
    );
    if (categoryKeys.includes("synergies")) {
        const reportCategories = Array.isArray(embedded.categories) ? embedded.categories.map(record) : [];
        audit.check(
            reportCategories.some((category) => category.key === "synergies" && category.label === "Synergies"),
            "report must expose the Synergies category",
        );
        const reportSynergies = rows.filter(
            (row) => row.category === "synergies" && row.cohort === "all" && rowMap(row) === aggregateMap,
        );
        audit.check(
            reportSynergies.length === EXPECTED_SYNERGY_KEYS.length,
            `report pooled synergy catalog must contain ${EXPECTED_SYNERGY_KEYS.length} rows`,
        );
        audit.check(
            reportSynergies.every((row) => stringValue(row.imageId)?.startsWith("synergy_")),
            "every report synergy row must use embedded synergy artwork",
        );
    }
    const mapDefinitions = Array.isArray(embedded.mapDefinitions) ? embedded.mapDefinitions.map(record) : [];
    if (aggregateMap === "live") {
        audit.check(
            mapDefinitions.some((definition) => definition.id === "live"),
            "report must expose a Live maps aggregate",
        );
        audit.check(/id="map-filter"/.test(html), "map-dimensional report is missing its map selector");
    }
    const provenanceRows = Array.isArray(embedded.provenance) ? embedded.provenance.map(record) : [];
    const mapEntry = provenanceRows.find((entry) => entry.key === "maps");
    const expectedMapText = `[${maps.join(",")}]`;
    audit.check(mapEntry?.value === expectedMapText, `report must identify aggregate map set ${expectedMapText}`);
    if (legacyWater) {
        audit.warnings.push("HTML report is a NON-LIVE legacy Water-map report.");
    }
    const assets = record(embedded.assets);
    audit.check(Object.keys(assets).length > 0, "report must embed image assets");
    audit.check(
        Object.values(assets).every((value) => typeof value === "string" && value.startsWith("data:image/")),
        "every report asset must be an embedded data:image URI",
    );
}

interface MetricRow extends JsonRecord {
    cohort?: string;
    map?: string | number;
    name?: string;
    key?: string;
    level?: number;
    scoreRate?: number;
    ciLow?: number;
    ciHigh?: number;
    pairs?: number;
    pickRate?: number;
}

const rate = (value: unknown): string => {
    const number = finiteNumber(value);
    return number === undefined ? "n/a" : `${(number * 100).toFixed(2)}%`;
};

const count = (value: unknown): string => {
    const number = integer(value);
    return number === undefined ? "n/a" : number.toLocaleString("en-US");
};

const rowSort = (left: MetricRow, right: MetricRow): number =>
    (finiteNumber(right.scoreRate) ?? -1) - (finiteNumber(left.scoreRate) ?? -1) ||
    (integer(right.pairs) ?? 0) - (integer(left.pairs) ?? 0) ||
    String(left.name).localeCompare(String(right.name));

const formatRow = (row: MetricRow): string => {
    const interval =
        finiteNumber(row.ciLow) !== undefined && finiteNumber(row.ciHigh) !== undefined
            ? `95% CI ${rate(row.ciLow)}–${rate(row.ciHigh)}`
            : "CI unavailable";
    const pick = finiteNumber(row.pickRate) !== undefined ? `, pick ${rate(row.pickRate)}` : "";
    return `${row.name ?? row.key ?? "unknown"}: ${rate(row.scoreRate)} (${interval}, ${count(row.pairs)} pairs${pick})`;
};

function printFindings(summary: JsonRecord, top: number, allowLegacyWater: boolean): void {
    if (summary.complete !== true) throw new Error("cannot extract findings from an incomplete summary");
    const provenance = record(summary.provenance);
    const maps = sortedNumbers(numberArray(provenance.maps));
    const legacy = sameNumbers(maps, LEGACY_WATER_MAPS);
    const rankings = record(summary.rankings);
    const hasLiveDimension = CATEGORY_KEYS.some((category) =>
        (Array.isArray(rankings[category]) ? rankings[category] : []).some((value) => rowMap(record(value)) === "live"),
    );
    if (!sameNumbers(maps, LIVE_MAPS) && !(legacy && (allowLegacyWater || hasLiveDimension))) {
        throw new Error(`findings require live maps 1/3/4; found [${maps.join(",")}]`);
    }
    if (legacy) console.warn("warning: NON-LIVE LEGACY RESULT includes disabled WATER_CENTER map 2.");
    const gamesPerCohort = integer(provenance.gamesPerCohort) ?? 0;
    if (gamesPerCohort < 10_000) {
        console.log(
            `\nSmoke-sized run: ${gamesPerCohort.toLocaleString("en-US")} fights per cohort. ` +
                "The pipeline is structurally valid, but randomized support is too sparse to report balance leaders.",
        );
        return;
    }
    const aggregateMap = hasLiveDimension ? "live" : "all";
    const pooled = (category: (typeof CATEGORY_KEYS)[number]): MetricRow[] =>
        (Array.isArray(rankings[category]) ? rankings[category] : [])
            .map((value) => record(value) as MetricRow)
            .filter((row) => row.cohort === "all" && rowMap(row) === aggregateMap)
            .sort(rowSort);

    console.log("\nAI meta findings");
    console.log(
        `Fights: ${count(provenance.totalGames)} | pairs: ${count(provenance.totalPairs)} | ` +
            `aggregate: ${aggregateMap} | simulated maps: ${maps.join("/")}${legacy ? " (Water NON-LIVE)" : " live"}`,
    );
    console.log(
        `Policy: ${String(provenance.selectionPolicy ?? "unknown")} | exploration: ${rate(provenance.explorationRate)}`,
    );

    console.log("\nBest observed units by level (associative roster performance)");
    const unitRows = pooled("units");
    for (const level of [1, 2, 3, 4]) {
        const rows = unitRows.filter((row) => integer(row.level) === level).slice(0, top);
        console.log(`  L${level}:`);
        rows.forEach((row, index) => console.log(`    ${index + 1}. ${formatRow(row)}`));
    }

    if (Array.isArray(rankings.synergies)) {
        console.log("\nSynergies (exact active choice/level; associative, not randomized)");
        pooled("synergies")
            .filter((row) => (integer(row.pairs) ?? 0) > 0)
            .slice(0, top)
            .forEach((row, index) => console.log(`  ${index + 1}. ${formatRow(row)}`));
    }

    for (const [category, title] of [
        ["artifactsT1", "Tier-1 artifacts"],
        ["artifactsT2", "Tier-2 artifacts"],
        ["augmentPlans", "Exact augment plans"],
    ] as const) {
        console.log(`\n${title} (randomized-exploration strength)`);
        pooled(category)
            .slice(0, top)
            .forEach((row, index) => console.log(`  ${index + 1}. ${formatRow(row)}`));
    }

    const nonzeroLevels = pooled("augmentLevels")
        .filter((row) => (integer(row.level) ?? 0) > 0)
        .slice(0, top);
    console.log("\nAugment-level diagnostics (compositional, not isolated causal effects)");
    nonzeroLevels.forEach((row, index) => console.log(`  ${index + 1}. ${formatRow(row)}`));

    const cohorts = Array.isArray(summary.cohorts) ? summary.cohorts.map(record) : [];
    const draws = cohorts.reduce((sum, cohort) => sum + Math.max(0, integer(cohort.draws) ?? 0), 0);
    console.log(
        `\nQuality: ${count(draws)} draws; zero rejected actions and roster violations required by validation.`,
    );
    console.log(
        "Interpret close leaders as tiers: confidence intervals overlap, and selecting the maximum across the plan catalog creates winner's-curse risk.",
    );
    console.log(
        "Unit and synergy rows are associative; synergy rows also inherit faction composition and activation level. Artifact and exact-plan strength comes from the 20% randomized exploration slice; policy pick rate answers a different question.",
    );
}

async function main(): Promise<void> {
    const options = parseArguments(process.argv.slice(2));
    if (!options) return;
    const commonRoot = findCommonRoot(options.commonRoot);
    if (options.operation === "source") {
        sourceCheck(commonRoot);
        return;
    }
    if (options.operation === "validate") {
        await validateSummary(options, commonRoot);
        return;
    }
    const parsed = readJson(options.summaryPath!);
    if (!isRecord(parsed)) throw new Error("summary root must be an object");
    printFindings(parsed, options.top, options.allowLegacyWater);
}

main().catch((error) => {
    console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
});
