import { TeamType } from "@heroesofcrypto/common";

import { IFightCreatureElimination, IFightDeathEntry, IFightStatsSample } from "../../scenes/VisibleState";

/** Portrait disc on the casualty timeline. The old 10px radius read as a dot on the results chart. */
export const ELIMINATION_MARKER_RADIUS = 16;
/** Gap kept between portrait discs so two deaths at the same moment stay readable. */
export const ELIMINATION_MARKER_GAP = 6;

/** How far a disc plus its defeat badge extends past the disc center. */
export const eliminationMarkerExtent = (radius: number = ELIMINATION_MARKER_RADIUS): number => radius * 1.2;

export const eliminationCreatureKey = (team: TeamType, name: string): string => `${team}|${name.trim().toLowerCase()}`;

export interface EliminationMarkerDraft {
    elimination: IFightCreatureElimination;
    pointX: number;
    pointY: number;
    lap: number;
    sampleIndex: number;
    eliminationIndex: number;
}

export interface LaidOutEliminationMarker extends EliminationMarkerDraft {
    centerX: number;
    centerY: number;
}

export interface EliminationPlotBounds {
    left: number;
    right: number;
    top: number;
    bottom: number;
}

const killedOnSide = (sample: IFightStatsSample, left: boolean): number =>
    left ? sample.leftKilled : sample.rightKilled;

/**
 * Every fully wiped creature type gets a marker, including ones the live sampler never saw die.
 *
 * Ranked snapshots that arrive while an attack is still animating used to be dropped, so the
 * timeline only learned who was alive at the quiet gaps. Creatures that fell during the fighting
 * never entered that set and never received a portrait. A death the series already timed keeps
 * that moment. A wiped creature with no moment is placed where that side's losses first show up,
 * or just before the first death the timeline could name — those wipes are already inside that rise.
 * A stack that only lost part of its count is not a wipe and stays off the timeline.
 */
export const withUnmarkedEliminations = (
    series: readonly IFightStatsSample[],
    deaths: readonly IFightDeathEntry[],
    leftTeam: TeamType,
): IFightStatsSample[] => {
    if (series.length === 0) {
        return [];
    }
    const marked = new Set<string>();
    for (const sample of series) {
        for (const elimination of sample.eliminations ?? []) {
            marked.add(elimination.creatureKey);
        }
    }
    const missing = deaths.filter((death) => {
        if (death.start <= 0 || death.died < death.start) {
            return false;
        }
        return !marked.has(eliminationCreatureKey(death.team, death.name));
    });
    const copies = series.map((sample) => ({
        ...sample,
        eliminations: sample.eliminations ? [...sample.eliminations] : undefined,
    }));
    if (missing.length === 0) {
        return copies;
    }

    const byTeam = new Map<TeamType, IFightDeathEntry[]>();
    for (const death of missing) {
        const group = byTeam.get(death.team);
        if (group) {
            group.push(death);
        } else {
            byTeam.set(death.team, [death]);
        }
    }
    for (const [team, teamMissing] of byTeam) {
        const left = team === leftTeam;
        const firstTimed = copies.findIndex((sample) =>
            sample.eliminations?.some((elimination) => elimination.team === team),
        );
        let index = copies.findIndex((sample) => killedOnSide(sample, left) > 0);
        if (firstTimed > 0 && killedOnSide(copies[firstTimed - 1], left) > 0) {
            // Those wipes are already inside the losses plotted before the first named death.
            index = firstTimed - 1;
        }
        if (index < 0) {
            index = copies.length - 1;
        }
        const sample = copies[index];
        const eliminations = sample.eliminations ? [...sample.eliminations] : [];
        for (const death of teamMissing) {
            const creatureKey = eliminationCreatureKey(death.team, death.name);
            eliminations.push({
                creatureKey,
                name: death.name,
                smallTextureName: death.smallTextureName,
                team: death.team,
            });
        }
        sample.eliminations = eliminations;
    }
    return copies;
};

const overlaps = (x: number, y: number, placed: readonly LaidOutEliminationMarker[], minDist: number): boolean => {
    const minDistSq = minDist * minDist;
    return placed.some((marker) => {
        const dx = marker.centerX - x;
        const dy = marker.centerY - y;
        return dx * dx + dy * dy < minDistSq - 0.01;
    });
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/**
 * Put every wipe on the chart without stacking portraits on the same pixel.
 *
 * Ideal position is the moment on that side's line. Search prefers a horizontal nudge, so time
 * stays readable on the short results chart, and only then steps off the line.
 */
export const layoutEliminationMarkers = (
    drafts: readonly EliminationMarkerDraft[],
    bounds: EliminationPlotBounds,
    radius: number = ELIMINATION_MARKER_RADIUS,
): LaidOutEliminationMarker[] => {
    const left = Math.min(bounds.left, bounds.right);
    const right = Math.max(bounds.left, bounds.right);
    const top = Math.min(bounds.top, bounds.bottom);
    const bottom = Math.max(bounds.top, bounds.bottom);
    const minDist = radius * 2 + ELIMINATION_MARKER_GAP;
    const placed: LaidOutEliminationMarker[] = [];
    const ordered = [...drafts].sort(
        (a, b) => a.pointX - b.pointX || a.pointY - b.pointY || a.eliminationIndex - b.eliminationIndex,
    );

    const candidates: Array<[number, number]> = [[0, 0]];
    for (let ring = 1; ring <= 16; ring++) {
        const ringCandidates: Array<[number, number]> = [];
        for (let hy = -ring; hy <= ring; hy++) {
            for (let hx = -ring; hx <= ring; hx++) {
                if (Math.max(Math.abs(hx), Math.abs(hy)) !== ring) {
                    continue;
                }
                ringCandidates.push([hx, hy]);
            }
        }
        ringCandidates.sort((a, b) => Math.abs(a[1]) - Math.abs(b[1]) || Math.abs(a[0]) - Math.abs(b[0]));
        candidates.push(...ringCandidates);
    }

    for (const draft of ordered) {
        let centerX = clamp(draft.pointX, left, right);
        let centerY = clamp(draft.pointY, top, bottom);
        for (const [hx, hy] of candidates) {
            const x = clamp(draft.pointX + hx * minDist, left, right);
            const y = clamp(draft.pointY + hy * minDist, top, bottom);
            if (!overlaps(x, y, placed, minDist)) {
                centerX = x;
                centerY = y;
                break;
            }
        }
        placed.push({ ...draft, centerX, centerY });
    }
    return placed;
};
