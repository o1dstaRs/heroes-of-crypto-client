import { PlayPhase, type PlaySnapshot } from "../../api/play_protocol";

export interface PremiumSearchMatchVersion {
    gameId: string;
    source: "draft" | "play";
    key: string;
    stage?: "draft" | "setup" | "board" | "fight" | "finished";
}

export const premiumSearchPlayStage = (snapshot: PlaySnapshot): PremiumSearchMatchVersion["stage"] => {
    if (snapshot.fightFinished || snapshot.phase === PlayPhase.FINISHED || snapshot.phase === PlayPhase.ABANDONED)
        return "finished";
    if (snapshot.fightStarted || snapshot.phase === PlayPhase.PLAY) return "fight";
    if (snapshot.phase === PlayPhase.PLACEMENT)
        return snapshot.placementSplit && snapshot.placementStage === 0 ? "setup" : "board";
    return undefined;
};

export const premiumSearchPlayVersion = (snapshot: PlaySnapshot): string =>
    JSON.stringify([
        snapshot.phase,
        snapshot.placementStage,
        snapshot.placementSplit,
        snapshot.fightStarted,
        snapshot.latestSequence,
        snapshot.currentLap,
        snapshot.currentUnitId,
        snapshot.fightFinished,
    ]);

export const currentPremiumSearchMatch = (
    versions: Iterable<PremiumSearchMatchVersion>,
    gameId?: string,
): PremiumSearchMatchVersion | undefined => {
    const matching = [...versions].filter((version) => version.gameId === gameId);
    return matching.find((version) => version.source === "play") ?? matching[0];
};

export const premiumSearchMatchChanged = (
    captured?: PremiumSearchMatchVersion,
    current?: PremiumSearchMatchVersion,
): boolean =>
    Boolean(
        captured &&
        current &&
        captured.gameId === current.gameId &&
        (captured.source !== current.source || captured.key !== current.key),
    );
