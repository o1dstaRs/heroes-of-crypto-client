import { PlayActionType, PlayPhase, type PlayAction, type PlaySnapshot } from "../api/play_protocol";

const boardActions = new Set<number>([
    PlayActionType.PLACE_UNIT,
    PlayActionType.SPLIT_UNIT,
    PlayActionType.DELETE_UNIT,
    PlayActionType.UNPLACE_UNIT,
    PlayActionType.PLACE_BARREL,
    PlayActionType.UNPLACE_BARREL,
]);

export const canSubmitRankedBoardAction = (
    snapshot: Pick<
        PlaySnapshot,
        | "gameId"
        | "phase"
        | "fightStarted"
        | "fightFinished"
        | "placementSplit"
        | "placementStage"
        | "players"
        | "readyPlayerIds"
    > | null,
    action: Pick<PlayAction, "type" | "gameId" | "playerId" | "team">,
): boolean => {
    if (!boardActions.has(action.type)) return true;
    if (
        !snapshot ||
        snapshot.gameId !== action.gameId ||
        snapshot.phase !== PlayPhase.PLACEMENT ||
        snapshot.fightStarted ||
        snapshot.fightFinished ||
        (snapshot.placementSplit && snapshot.placementStage !== 1)
    )
        return false;
    return (
        snapshot.players.some((player) => player.playerId === action.playerId && player.team === action.team) &&
        !snapshot.readyPlayerIds.includes(action.playerId)
    );
};
