import { Box } from "@mui/joy";
import React, { useEffect, useState } from "react";

import type { RankedStanding } from "../../api/social_client";
import { standingEmblem } from "./CalibrationProgress";
import { LeagueEmblem, leagueEmblemSource } from "./LeagueEmblem";
import { PortalAvatarPlaceholder, portalRevealSx } from "./PlayerPortalLoading";

const decodedSources = new Set<string>();

/** Show the real portrait only once it is decoded, keeping the avatar slot the same size throughout. */
export const PortalAvatar: React.FC<{ standing: RankedStanding | null; size?: number | Record<string, number> }> = ({
    standing,
    size = { xs: 84, sm: 96 },
}) => {
    const emblem = standing ? standingEmblem(standing) : null;
    const source = emblem ? leagueEmblemSource(emblem.league, emblem.wealth) : null;
    const [readySource, setReadySource] = useState(() => (source && decodedSources.has(source) ? source : null));

    useEffect(() => {
        if (!source) return;
        if (decodedSources.has(source)) {
            setReadySource(source);
            return;
        }
        let cancelled = false;
        const image = new Image();
        image.fetchPriority = "high";
        image.src = source;
        void image
            .decode()
            .then(() => {
                decodedSources.add(source);
                if (!cancelled) setReadySource(source);
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [source]);

    return (
        <Box sx={{ width: size, height: size, flexShrink: 0 }}>
            {emblem && source === readySource ? (
                <Box key={source} sx={portalRevealSx}>
                    <LeagueEmblem {...emblem} size={size} />
                </Box>
            ) : (
                <PortalAvatarPlaceholder size={size} />
            )}
        </Box>
    );
};
