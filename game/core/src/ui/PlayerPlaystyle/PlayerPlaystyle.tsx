import React, { useEffect, useState, type ReactNode } from "react";

import type { PlayerMetricsSummary } from "../../api/player_metrics_contract";
import { fetchPlayerMetrics } from "../../api/social_client";
import { isMockPortalEnabled } from "../PlayerPortal/mockPortal";
import { buildMockPlayerMetrics } from "./mockPlayerMetrics";
import { renderPlayerPlaystyle, type PlaystyleState } from "./renderPlayerPlaystyle";
import "./playerPlaystyle.css";

export const PlayerPlaystyle: React.FC<{
    playerId?: string;
    reloadKey: number;
    language: string;
    compact?: boolean;
    /** Wraps a rendered playstyle. Not called when nothing has been collected yet. */
    wrap?: (body: ReactNode) => ReactNode;
}> = ({ playerId, reloadKey, language, compact = false, wrap }) => {
    const [metrics, setMetrics] = useState<PlayerMetricsSummary | null>(null);
    const [state, setState] = useState<PlaystyleState>("loading");
    useEffect(() => {
        let cancelled = false;
        setMetrics(null);
        if (isMockPortalEnabled()) {
            setMetrics(buildMockPlayerMetrics());
            setState("ready");
            return;
        }
        if (!playerId) {
            setState("ready");
            return;
        }
        setState("loading");
        void fetchPlayerMetrics(playerId)
            .then((data) => {
                if (!cancelled) {
                    setMetrics(data);
                    setState("ready");
                }
            })
            .catch(() => {
                if (!cancelled) setState("error");
            });
        return () => {
            cancelled = true;
        };
    }, [playerId, reloadKey]);
    const markup = renderPlayerPlaystyle(metrics, language, state, compact);
    // Stay blank while loading too, so a player with no battle data never sees the heading flash in.
    if (state === "loading" || !markup) return null;
    const body = <div aria-live="polite" dangerouslySetInnerHTML={{ __html: markup }} />;
    return wrap ? wrap(body) : body;
};
