import { TeamVals } from "@heroesofcrypto/common";
import { useCallback, useEffect, useState } from "react";

import { usePixiManager } from "../../pixi/PixiGameManager";
import { premiumSandboxVersion, type PremiumSandboxState } from "./premiumBriefing";

/** Read only the local scene's public UI state; ranked advice continues to use the server's viewer context. */
export function usePremiumSandboxState(enabled: boolean) {
    const manager = usePixiManager();
    const read = useCallback((): PremiumSandboxState => {
        const visible = manager.GetCurrentVisibleState();
        return {
            left: manager.GetNumberOfPlacedUnits(TeamVals.LEFT),
            right: manager.GetNumberOfPlacedUnits(TeamVals.RIGHT),
            started: manager.hasStarted,
            finished: Boolean(visible.hasFinished),
            lap: visible.lapNumber ?? 0,
            map: manager.GetGridType(),
            visibleQueue: (visible.upNext ?? [])
                .filter((unit) => unit.name && unit.amount > 0)
                .map((unit) => ({
                    name: unit.name!.slice(0, 80),
                    team: unit.teamType === TeamVals.LEFT ? "green" : "red",
                    amount: unit.amount,
                })),
        };
    }, [manager]);
    const [state, setState] = useState<PremiumSandboxState>();
    const refresh = useCallback(() => {
        if (!enabled) return;
        const next = read();
        setState((previous) =>
            previous && premiumSandboxVersion(previous) === premiumSandboxVersion(next) ? previous : next,
        );
        return next;
    }, [enabled, read]);
    useEffect(() => {
        if (!enabled) {
            setState(undefined);
            return;
        }
        refresh();
        const connections = [
            manager.onVisibleStateUpdated.connect(refresh),
            manager.onHasStarted.connect(refresh),
            manager.onPossibleSynergiesUpdated.connect(refresh),
            manager.onLoadingChanged.connect(refresh),
            manager.onGridTypeChanged.connect(refresh),
        ];
        return () => connections.forEach((connection) => connection.disconnect());
    }, [enabled, manager, refresh]);
    return { state, refresh };
}
