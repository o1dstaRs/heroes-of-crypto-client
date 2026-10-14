import React, { useEffect, useState } from "react";

import type { PlayerMetricsSummary } from "../../api/player_metrics_contract";
import { fetchPlayerMetrics } from "../../api/social_client";
import { isMockPortalEnabled } from "../PlayerPortal/mockPortal";
import { buildMockPlayerMetrics } from "./mockPlayerMetrics";
import { renderPlayerPlaystyle, type PlaystyleState } from "./renderPlayerPlaystyle";
import "./playerPlaystyle.css";

export const PlayerPlaystyle: React.FC<{ playerId?: string; reloadKey: number; language: string }> = ({
    playerId,
    reloadKey,
    language,
}) => {
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
    return (
        <div aria-live="polite" dangerouslySetInnerHTML={{ __html: renderPlayerPlaystyle(metrics, language, state) }} />
    );
};
