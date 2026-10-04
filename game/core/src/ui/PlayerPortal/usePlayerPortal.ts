import { type ResponsePlayerPortalObject } from "@heroesofcrypto/common";
import { useCallback, useState } from "react";

import { fetchPlayerPortal } from "../../api/player_portal_client";
import { t } from "../../i18n/i18n";
import { buildMockPortal, isMockPortalEnabled } from "./mockPortal";
import { createPlayerResource } from "./playerResource";
import { usePlayerResource } from "./usePlayerResource";

export interface PlayerPortalState {
    data: ResponsePlayerPortalObject | null;
    loading: boolean;
    error: string;
    reload: () => void;
    reloadKey: number;
}

const portalResource = createPlayerResource(
    async () => (isMockPortalEnabled() ? buildMockPortal() : fetchPlayerPortal()),
    () => t("Unable to load profile"),
);

/** Reuse the arena's profile immediately, then refresh its match history in the background. */
export const usePlayerPortal = (): PlayerPortalState => {
    const [reloadKey, setReloadKey] = useState(0);
    const reload = useCallback(() => setReloadKey((key) => key + 1), []);
    return { ...usePlayerResource(portalResource, reloadKey), reload, reloadKey };
};
