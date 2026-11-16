import { TeamVals } from "@heroesofcrypto/common";
import { useCallback, useSyncExternalStore } from "react";

import { getBattleUnitFacing, subscribeBattleUnitFacing } from "../pixi/battleUnitFacing";
import { isBoardMirrored, isBoardMirroredOnServer, subscribeBoardMirror } from "../pixi/boardMirror";

const noFacingOnServer = () => undefined;
export function useBattleUnitFacing(unitId?: string, team?: number): -1 | 1 | undefined {
    const subscribe = useCallback((listener: () => void) => subscribeBattleUnitFacing(unitId, listener), [unitId]);
    const snapshot = useCallback(() => getBattleUnitFacing(unitId), [unitId]);
    const facing = useSyncExternalStore(subscribe, snapshot, noFacingOnServer);
    const mirrored = useSyncExternalStore(subscribeBoardMirror, isBoardMirrored, isBoardMirroredOnServer);
    const worldFacing = facing ?? (team === TeamVals.RIGHT ? -1 : 1);
    return unitId ? (mirrored ? (worldFacing === 1 ? -1 : 1) : worldFacing) : undefined;
}
