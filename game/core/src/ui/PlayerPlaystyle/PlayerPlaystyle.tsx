import React, { type ReactNode } from "react";

import type { PlayerMetricsSummary } from "../../api/player_metrics_contract";
import { renderPlayerPlaystyle, type PlaystyleState } from "./renderPlayerPlaystyle";
import { usePlayerMetrics } from "./usePlayerMetrics";
import "./playerPlaystyle.css";

interface PlayerPlaystylePresentationProps {
    language: string;
    compact?: boolean;
    /** Wraps a rendered playstyle. Not called when nothing has been collected yet. */
    wrap?: (body: ReactNode) => ReactNode;
}

export const PlayerPlaystyleView: React.FC<
    PlayerPlaystylePresentationProps & { metrics: PlayerMetricsSummary | null; loading: boolean; error: string }
> = ({ metrics, loading, error, language, compact = false, wrap }) => {
    const state: PlaystyleState = metrics ? "ready" : loading ? "loading" : error ? "error" : "ready";
    const markup = React.useMemo(
        () => renderPlayerPlaystyle(metrics, language, state, compact),
        [metrics, language, state, compact],
    );
    // Stay blank while loading too, so a player with no battle data never sees the heading flash in.
    if (state === "loading" || !markup) return null;
    const body = <div aria-live="polite" dangerouslySetInnerHTML={{ __html: markup }} />;
    return wrap ? wrap(body) : body;
};

export const PlayerPlaystyle: React.FC<PlayerPlaystylePresentationProps & { playerId?: string; reloadKey: number }> = ({
    playerId,
    reloadKey,
    ...presentation
}) => {
    const { data: metrics, loading, error } = usePlayerMetrics(playerId, reloadKey);
    return <PlayerPlaystyleView {...presentation} metrics={metrics} loading={loading} error={error} />;
};
