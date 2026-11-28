import { petrifyingGazeForecast, petrifyingGazePreviewText } from "../../core/src/scenes/petrifyingGazeForecast";
import type { PetrifyingGazeForecastInput } from "../../core/src/scenes/petrifyingGazeForecast";
import {
    ELIMINATION_MARKER_RADIUS,
    eliminationMarkerExtent,
    layoutEliminationMarkers,
    type EliminationPlotBounds,
} from "../../core/src/ui/FightStats/eliminationMarkers";

function gaze(damage: PetrifyingGazeForecastInput, multipleHits: boolean): string | undefined {
    const preview = petrifyingGazeForecast(damage);
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
