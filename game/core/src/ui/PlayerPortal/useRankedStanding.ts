import { fetchRankedStanding, type RankedStanding } from "../../api/social_client";
import { buildMockRankedStanding, isMockPortalEnabled } from "./mockPortal";
import { createPlayerResource } from "./playerResource";
import { usePlayerResource } from "./usePlayerResource";

const standingResource = createPlayerResource(
    async () => (isMockPortalEnabled() ? buildMockRankedStanding() : fetchRankedStanding()),
    () => "",
);

/**
 * The signed-in player's ranked standing (calibration progress, or league once placed).
 *
 * Kept OUT of the portal payload on purpose: that payload is protobuf and rebuilt from full match
 * history, while this is a couple of counters that both the lobby and the portal want on their own
 * cadence. A failed load simply yields null — every caller renders nothing rather than an error, so
 * a hiccup here can never block matchmaking.
 */
export const useRankedStanding = (reloadKey: unknown = 0): RankedStanding | null =>
    usePlayerResource(standingResource, reloadKey).data;
