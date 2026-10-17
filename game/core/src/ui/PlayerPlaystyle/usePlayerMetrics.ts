import { fetchPlayerMetrics } from "../../api/social_client";
import { isMockPortalEnabled } from "../PlayerPortal/mockPortal";
import { createPlayerResource } from "../PlayerPortal/playerResource";
import { usePlayerResourceForKey } from "../PlayerPortal/usePlayerResource";
import { buildMockPlayerMetrics } from "./mockPlayerMetrics";

const previewKey = "preview:playstyle";
const metricsResource = createPlayerResource(
    async (playerId) => (playerId === previewKey ? buildMockPlayerMetrics() : fetchPlayerMetrics(playerId)),
    () => "Playstyle is temporarily unavailable.",
);

/** Reuse the player's chart on remount and keep it visible during refreshes or temporary failures. */
export const usePlayerMetrics = (playerId: string | undefined, reloadKey: number) =>
    usePlayerResourceForKey(metricsResource, isMockPortalEnabled() ? previewKey : (playerId ?? ""), reloadKey);
