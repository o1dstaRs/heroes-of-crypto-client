import { Artifact } from "@heroesofcrypto/common";

import type { MatchHistoryScope } from "../../api/player_portal_client";
import { UNIT_ID_TO_NAME } from "../unit_ui_constants";
import type { PortalMatchData } from "./matchHistoryModel";

export interface MatchHistorySuggestion {
    label: string;
    kind: "artifact" | "creature";
    creatureId?: number;
    imageKey?: string;
    tier?: number;
}

export const normalizeHistorySearch = (value: string): string =>
    value
        .normalize("NFKC")
        .toLowerCase()
        .replace(/['’]/g, "")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim();

const artifacts = ([1, 2] as const).flatMap((tier) =>
    Object.entries(tier === 1 ? Artifact.TIER1_ARTIFACTS : Artifact.TIER2_ARTIFACTS)
        .filter(([id]) => Number(id) > 0)
        .map(([id, artifact]) => ({ ...artifact, id: Number(id), tier })),
);

export const matchHistorySuggestions: MatchHistorySuggestion[] = [
    ...[...new Map(artifacts.map((artifact) => [artifact.name, artifact])).values()]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((artifact): MatchHistorySuggestion => ({
            label: artifact.name,
            kind: "artifact",
            imageKey: artifact.imageKey,
            tier: artifact.tier,
        })),
    ...Object.entries(UNIT_ID_TO_NAME)
        .filter(([id]) => Number(id) > 0)
        .sort(([, a], [, b]) => a.localeCompare(b))
        .map(([id, label]): MatchHistorySuggestion => ({ label, kind: "creature", creatureId: Number(id) })),
];

export const searchPortalMatches = (
    matches: readonly PortalMatchData[],
    query: string,
    scope: MatchHistoryScope = "either",
): PortalMatchData[] => {
    const words = normalizeHistorySearch(query).split(/\s+/).filter(Boolean);
    if (words.length === 0) return [...matches];
    return matches.filter((match) => {
        const names: string[] = [match.opponent_username ?? ""];
        for (const side of ["player", "opponent"] as const) {
            if (scope !== "either" && scope !== side) continue;
            const creatureIds = side === "player" ? match.creature_ids : match.opponent_creature_ids;
            for (const id of creatureIds ?? []) {
                if (id > 0 && UNIT_ID_TO_NAME[id]) names.push(UNIT_ID_TO_NAME[id]);
            }
            const setup = side === "player" ? match.player_setup : match.opponent_setup;
            for (const artifact of artifacts) {
                const id = artifact.tier === 1 ? setup?.artifact_tier_1 : setup?.artifact_tier_2;
                if (id === artifact.id) names.push(artifact.name);
            }
        }
        const haystack = names.map(normalizeHistorySearch);
        return words.every((word) => haystack.some((name) => name.includes(word)));
    });
};

export const matchHistoryPageCursor = (match: PortalMatchData | undefined): string | null => {
    if (!match?.game_id || !Number.isSafeInteger(match.finished_time) || (match.finished_time ?? 0) < 0) return null;
    return btoa(JSON.stringify([match.finished_time, match.game_id]))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
};
