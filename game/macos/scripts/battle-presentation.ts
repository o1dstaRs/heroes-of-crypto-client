import { petrifyingGazeForecast, petrifyingGazePreviewText } from "../../core/src/scenes/petrifyingGazeForecast";
import type { PetrifyingGazeForecastInput } from "../../core/src/scenes/petrifyingGazeForecast";
import {
    ELIMINATION_MARKER_RADIUS,
    eliminationMarkerExtent,
    layoutEliminationMarkers,
    type EliminationPlotBounds,
} from "../../core/src/ui/FightStats/eliminationMarkers";

interface NativeGaze extends PetrifyingGazeForecastInput {
    flesh?: {
        percent: number;
        targetCap: number;
        ownerCap: number;
        targetArmor: number;
        ownerArmor: number;
    };
    burn?: { power: number; heavy: number; element: number; resist: number };
}

function damageTaken(impact: number, { flesh, burn }: NativeGaze): number {
    let remaining = impact;
    if (flesh && remaining > 0) {
        const { percent, targetCap, ownerCap, targetArmor, ownerArmor } = flesh;
        const cap = Math.min(targetCap, ownerCap);
        let low = 0;
        let high = Math.min(Math.floor(targetCap), Math.floor((impact * percent) / 100));
        while (low < high) {
            const middle = Math.ceil((low + high) / 2);
            const cost = ownerArmor > 0 ? Math.max(1, Math.ceil((middle * targetArmor) / ownerArmor)) : middle;
            if (cost <= cap) low = middle;
            else high = middle - 1;
        }
        remaining -= low;
    }
    if (!burn || remaining <= 0) return remaining;
    return (
        remaining +
        Math.floor(Math.floor(((remaining * burn.power) / 100) * burn.heavy * burn.element) * (1 - burn.resist / 100))
    );
}

function gaze(damage: NativeGaze, multipleHits: boolean): string | undefined {
    const preview = petrifyingGazeForecast(damage, (impact) => damageTaken(impact, damage));
    return preview ? petrifyingGazePreviewText(preview, multipleHits) : undefined;
}

function casualtyCenters(markers: [number, number][], bounds: EliminationPlotBounds): [number, number][] {
    const extent = eliminationMarkerExtent();
    const placed = layoutEliminationMarkers(
        markers.map(([pointX, pointY], eliminationIndex) => ({ pointX, pointY, eliminationIndex })),
        {
            left: bounds.left + extent,
            right: bounds.right - extent,
            top: bounds.top + extent,
            bottom: bounds.bottom - extent,
        },
    );
    return placed
        .sort((a, b) => a.eliminationIndex - b.eliminationIndex)
        .map(({ centerX, centerY }) => [centerX, centerY]);
}

Object.assign(globalThis, {
    hocGazeForecast: gaze,
    hocCasualtyCenters: casualtyCenters,
    hocCasualtyRadius: ELIMINATION_MARKER_RADIUS,
});
