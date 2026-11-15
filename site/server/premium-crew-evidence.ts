import { creatureInfo } from "@heroesofcrypto/common/src/ai/setup/creature_score";
import { AI_META_COHORTS, type AiMetaCohort } from "@heroesofcrypto/common/src/simulation/ai_meta_cohorts_core";
import type { PremiumEvidenceSnapshot } from "@heroesofcrypto/common/src/simulation/premium_evidence_snapshot";

/** Mount beside the authenticated Premium library route. Never publish the source SQLite file. */
export function premiumCrewEvidenceResponse(
    request: Request,
    entitlement: { active: boolean },
    snapshot:
        | { manifest: Pick<PremiumEvidenceSnapshot["manifest"], "snapshotId">; query: PremiumEvidenceSnapshot["query"] }
        | undefined,
): Response {
    const reply = (body: unknown, status = 200) =>
        Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
    if (!entitlement.active) return reply({ error: "Premium is not active" }, 403);
    if (!snapshot) return reply({ error: "Crew history unavailable" }, 503);
    const params = new URL(request.url).searchParams;
    const units = (params.get("units") ?? "")
        .split(",")
        .map(Number)
        .sort((a, b) => a - b);
    const cohort = params.get("cohort") ?? "ranked-draft",
        mapValue = params.get("map") ?? "all";
    if (
        units.length !== 6 ||
        new Set(units).size !== 6 ||
        units.some((id) => !Number.isSafeInteger(id) || id < 1 || !creatureInfo(id)) ||
        units
            .map((id) => creatureInfo(id)!.level)
            .sort()
            .join(",") !== "1,1,2,2,3,4" ||
        !AI_META_COHORTS.includes(cohort as AiMetaCohort) ||
        !["all", "1", "3", "4"].includes(mapValue)
    )
        return reply({ error: "Invalid ranked crew or battle scope" }, 400);
    if (params.get("snapshot") !== snapshot.manifest.snapshotId) return reply({ error: "Unknown snapshot" }, 400);
    const packet = snapshot.query({
        cohort: cohort as AiMetaCohort,
        map: mapValue === "all" ? undefined : Number(mapValue),
        partition: "train",
        ownUnits: units,
    });
    return reply({
        snapshotId: packet.snapshotId,
        ownUnits: units,
        cohort,
        map: mapValue,
        families: packet.independentFamilies,
        score: packet.scoreRate,
        interval: packet.interval95,
        evidenceId: packet.evidenceId,
    });
}
