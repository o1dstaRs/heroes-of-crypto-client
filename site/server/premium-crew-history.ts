import { Database } from "bun:sqlite";
import { PremiumEvidenceSnapshot } from "@heroesofcrypto/common/src/simulation/premium_evidence_snapshot";
import { PREMIUM_COHORTS, type PremiumCatalog, type PremiumRow } from "../src/lib/premium-library";
import { premiumCatalog } from "../src/lib/premium-catalog";
import { premiumCrewArtifactBenefit } from "../src/lib/premium-crew";
import {
    CREW_HISTORY_MINIMUM,
    compareCrewHistory,
    type CrewHistoryGroup,
    type PremiumCrewHistory,
} from "../src/lib/premium-crew-history";

type Army = {
    id: number;
    family: string;
    score: number;
    artifact_t1: number;
    artifact_t2: number;
    units: number[];
    synergies: number[][];
};
type Category = "units" | "tier1" | "tier2" | "synergies";
const levels = [1, 1, 2, 2, 3, 4];

/** Read-only observed battle results. Mirrored seats are averaged within each independent family. */
export class PremiumCrewHistoryStore {
    private readonly snapshot: PremiumEvidenceSnapshot;
    private readonly db: Database;
    readonly catalog: PremiumCatalog = premiumCatalog("en");
    private readonly scopes = new Map<string, Army[]>();
    private readonly cache = new Map<string, PremiumCrewHistory>();
    get manifest() {
        return this.snapshot.manifest;
    }

    constructor(path: string, sourceSha256: string, allowDevelopment = false) {
        this.snapshot = new PremiumEvidenceSnapshot(path, sourceSha256, { allowDevelopment });
        this.db = new Database(path, { readonly: true, strict: true });
        this.db.exec("PRAGMA query_only=ON");
    }

    close() {
        this.db.close();
        this.snapshot.close();
    }

    private armies(cohort: string, map: string): Army[] {
        const key = `${cohort}/${map}`;
        const cached = this.scopes.get(key);
        if (cached) return cached;
        const rows = this.db
            .query<Omit<Army, "units" | "synergies"> & { units: string; synergies: string }, [string, string, number]>(
                `SELECT a.id, a.family_id family, a.score, a.artifact_t1, a.artifact_t2,
                (SELECT json_group_array(u.creature_id) FROM unit u WHERE u.army_id=a.id) units,
                (SELECT json_group_array(json_array(s.faction,s.synergy,s.level)) FROM synergy s WHERE s.army_id=a.id AND s.level>0) synergies
             FROM army a JOIN family f ON f.id=a.family_id
             WHERE f.partition='train' AND f.cohort=? AND f.map IN (1,3,4) AND (?='all' OR f.map=?) ORDER BY a.id`,
            )
            .all(cohort, map, Number(map) || 0)
            .map((row) => ({ ...row, units: JSON.parse(row.units), synergies: JSON.parse(row.synergies) }));
        if (this.scopes.size >= 16) this.scopes.delete(this.scopes.keys().next().value!);
        this.scopes.set(key, rows);
        return rows;
    }

    private aggregate(armies: Army[], category: Category): PremiumRow[] {
        const values = new Map<
            string,
            { ids: number[]; observations: number; families: Map<string, { sum: number; n: number }> }
        >();
        for (const army of armies) {
            const entries =
                category === "units"
                    ? army.units.map((id) => [id])
                    : category === "synergies"
                      ? army.synergies
                      : [[category === "tier1" ? army.artifact_t1 : army.artifact_t2]];
            for (const ids of entries) {
                if (ids[0] <= 0) continue;
                const key = ids.join(":");
                const item = values.get(key) ?? { ids, observations: 0, families: new Map() };
                const family = item.families.get(army.family) ?? { sum: 0, n: 0 };
                family.sum += army.score;
                family.n++;
                item.observations++;
                item.families.set(army.family, family);
                values.set(key, item);
            }
        }
        return [...values]
            .map(([key, item]) => {
                const families = item.families.size;
                const score =
                    [...item.families.values()].reduce((sum, family) => sum + family.sum / family.n, 0) / families;
                const radius = Math.sqrt(Math.log(40) / (2 * families));
                return {
                    key,
                    ids: item.ids,
                    families,
                    observations: item.observations,
                    score,
                    interval: [Math.max(0, score - radius), Math.min(1, score + radius)] as [number, number],
                    frequency: item.observations / armies.length,
                };
            })
            .sort(compareCrewHistory);
    }

    /** Pick a shared co-play population by coverage alone, before looking at outcomes. */
    private context(
        armies: Army[],
        allies: number[],
        category: Category,
        eligible: Set<number> | undefined,
        choices: number,
    ): CrewHistoryGroup {
        const unique = [...new Set(allies)].sort((a, b) => a - b);
        const subsets = Array.from({ length: 1 << unique.length }, (_, mask) =>
            unique.filter((_, i) => mask & (1 << i)),
        );
        const scored = subsets.map((contextUnits) => {
            const matched = armies.filter((army) => contextUnits.every((id) => army.units.includes(id)));
            const rows = this.aggregate(matched, category).filter((row) => !eligible || eligible.has(row.ids[0]));
            const supported = rows.filter((row) => row.families >= CREW_HISTORY_MINIMUM);
            return {
                contextUnits,
                rows,
                coverage: supported.length,
                support: supported.reduce((sum, row) => sum + row.families, 0),
            };
        });
        const chosen = scored
            .filter((group) => group.coverage >= choices || group.contextUnits.length === 0)
            .sort(
                (a, b) =>
                    b.contextUnits.length - a.contextUnits.length ||
                    b.coverage - a.coverage ||
                    b.support - a.support ||
                    a.contextUnits.join(":").localeCompare(b.contextUnits.join(":")),
            )[0];
        return { contextUnits: chosen.contextUnits, rows: chosen.rows };
    }

    history(ownUnits: number[], cohort: string, map: string): PremiumCrewHistory {
        const key = JSON.stringify([ownUnits, cohort, map]);
        const cached = this.cache.get(key);
        if (cached) return cached;
        const armies = this.armies(cohort, map);
        const remaining = [...ownUnits];
        const slots = levels.map((level) => {
            const index = remaining.findIndex((id) => this.catalog.units[id]?.level === level);
            return index < 0 ? undefined : remaining.splice(index, 1)[0];
        });
        const groups = slots.map((_, slot) => {
            const allies = slots.filter((id, index): id is number => id !== undefined && index !== slot);
            const candidates = new Set(
                Object.entries(this.catalog.units)
                    .filter(([, unit]) => unit.level === levels[slot] && unit.kit?.amount)
                    .map(([id]) => Number(id)),
            );
            const available = new Set([...candidates].filter((id) => !ownUnits.includes(id)));
            const context = this.context(armies, allies, "units", available, Math.min(3, available.size));
            // Include the currently selected unit's outcome in exactly the same population.
            const rows = this.aggregate(
                armies.filter((army) => context.contextUnits.every((id) => army.units.includes(id))),
                "units",
            ).filter((row) => candidates.has(row.ids[0]));
            return { slot, contextUnits: context.contextUnits, rows };
        });
        const value: PremiumCrewHistory = {
            schema: "hoc-premium-crew-history-v1",
            snapshotId: this.manifest.snapshotId,
            sourceSha256: this.manifest.sourceSha256,
            partition: "train",
            cohort,
            map,
            ownUnits: [...ownUnits],
            minimumFamilies: CREW_HISTORY_MINIMUM,
            slots: groups,
            artifacts: [1, 2].map((tier) => ({
                tier,
                ...this.context(
                    armies,
                    ownUnits,
                    tier === 1 ? "tier1" : "tier2",
                    new Set(
                        Object.keys(this.catalog.artifacts)
                            .filter((key) => key.startsWith(`${tier}:`))
                            .filter(
                                (key) =>
                                    premiumCrewArtifactBenefit(this.catalog.artifacts[key].slug, ownUnits, "en").names
                                        .length > 0,
                            )
                            .map((key) => Number(key.split(":")[1])),
                    ),
                    2,
                ),
            })),
            synergies: this.context(armies, ownUnits, "synergies", undefined, 2),
        };
        if (this.cache.size >= 32) this.cache.delete(this.cache.keys().next().value!);
        this.cache.set(key, value);
        return value;
    }
}

export function premiumCrewHistoryResponse(
    request: Request,
    entitlement: { active: boolean },
    store?: PremiumCrewHistoryStore,
): Response {
    const reply = (body: unknown, status = 200) =>
        Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
    if (!entitlement.active) return reply({ error: "Premium is not active" }, 403);
    if (!store) return reply({ error: "Crew history unavailable" }, 503);
    const params = new URL(request.url).searchParams;
    const raw = params.get("units") ?? "";
    const units = raw === "" ? [] : raw.split(",").map(Number);
    const cohort = params.get("cohort") ?? "ranked-draft",
        map = params.get("map") ?? "all";
    if (
        units.length > 6 ||
        new Set(units).size !== units.length ||
        units.some((id) => !Number.isSafeInteger(id) || !store.catalog.units[id]?.kit?.amount) ||
        [1, 2, 3, 4].some(
            (level) =>
                units.filter((id) => store.catalog.units[id].level === level).length >
                levels.filter((value) => value === level).length,
        ) ||
        !PREMIUM_COHORTS.includes(cohort as (typeof PREMIUM_COHORTS)[number]) ||
        !["all", "1", "3", "4"].includes(map)
    )
        return reply({ error: "Invalid ranked crew or battle scope" }, 400);
    if (params.get("snapshot") !== store.manifest.snapshotId) return reply({ error: "Unknown snapshot" }, 400);
    return reply(store.history(units, cohort, map));
}
