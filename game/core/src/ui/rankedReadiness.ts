import {
    PlayActionType,
    PlayInputSource,
    PlayPhase,
    type PlayAction,
    type PlayActionTypeValue,
    type PlaySnapshot,
} from "../api/play_protocol";
import { rankedPlacementLockActionType } from "./rankedPlacementStage";

type ReadinessSnapshot = Pick<
    PlaySnapshot,
    | "gameId"
    | "phase"
    | "fightStarted"
    | "fightFinished"
    | "placementSplit"
    | "placementStage"
    | "players"
    | "readyPlayerIds"
>;

export interface RankedReadinessIntent {
    gameId: string;
    playerId: string;
    team: number;
    type: PlayActionTypeValue;
    placementSplit: boolean;
    placementStage: number;
}

export const isRankedReadinessAction = (type: number | undefined): boolean =>
    type === PlayActionType.START_FIGHT || type === PlayActionType.READY_PLACEMENT;

/** Capture intent before queueing: a Setup click must never become Board readiness. */
export const captureRankedReadinessIntent = (
    snapshot: ReadinessSnapshot | null,
    team: number,
    type: number | undefined,
): RankedReadinessIntent | undefined => {
    if (
        !snapshot ||
        snapshot.phase !== PlayPhase.PLACEMENT ||
        snapshot.fightStarted ||
        snapshot.fightFinished ||
        (snapshot.placementStage !== 0 && snapshot.placementStage !== 1) ||
        type !== rankedPlacementLockActionType(snapshot)
    )
        return undefined;
    const player = snapshot.players.find((seat) => seat.team === team);
    if (!player || snapshot.readyPlayerIds.includes(player.playerId)) return undefined;
    return {
        gameId: snapshot.gameId,
        playerId: player.playerId,
        team,
        type,
        placementSplit: snapshot.placementSplit,
        placementStage: snapshot.placementStage,
    };
};

export const canSubmitRankedReadinessIntent = (
    intent: RankedReadinessIntent,
    snapshot: ReadinessSnapshot | null,
): boolean => {
    const current = captureRankedReadinessIntent(snapshot, intent.team, intent.type);
    return (
        !!current &&
        current.gameId === intent.gameId &&
        current.playerId === intent.playerId &&
        current.placementSplit === intent.placementSplit &&
        current.placementStage === intent.placementStage
    );
};

/** Only stage/readiness conflicts can be recovered; auth, ownership and validation errors stay visible. */
export const isRecoveredRankedReadinessRejection = (
    intent: RankedReadinessIntent | undefined,
    reason: string,
    snapshot: ReadinessSnapshot | null,
): boolean => {
    if (
        !intent ||
        !snapshot ||
        snapshot.gameId !== intent.gameId ||
        ![
            "sequence_mismatch",
            "setup_not_available",
            "setup_locked",
            "placement_not_available",
            "placement_locked",
        ].includes(reason) ||
        !snapshot.players.some((seat) => seat.playerId === intent.playerId && seat.team === intent.team)
    )
        return false;
    if (snapshot.phase === PlayPhase.PLAY || snapshot.phase === PlayPhase.FINISHED) return true;
    if (snapshot.phase !== PlayPhase.PLACEMENT || snapshot.placementSplit !== intent.placementSplit) return false;
    if (intent.placementSplit && intent.placementStage === 0 && snapshot.placementStage === 1) return true;
    return snapshot.placementStage === intent.placementStage && snapshot.readyPlayerIds.includes(intent.playerId);
};

/** Coalesce clicks across buttons/shortcuts while retaining the original stage and seat. */
export class RankedReadinessSubmissions {
    private readonly pending = new Set<string>();
    public async submit<T>(
        intent: RankedReadinessIntent,
        getSnapshot: () => ReadinessSnapshot | null,
        enqueue: (run: () => Promise<void>) => Promise<void>,
        send: () => Promise<T>,
    ): Promise<T | undefined> {
        const key = JSON.stringify(intent);
        if (this.pending.has(key)) return;
        this.pending.add(key);
        try {
            let result: T | undefined;
            await enqueue(async () => {
                if (canSubmitRankedReadinessIntent(intent, getSnapshot())) result = await send();
            });
            return result;
        } finally {
            this.pending.delete(key);
        }
    }
}

export const sendRankedReadinessWithRetry = async <T extends { accepted: boolean; rejectionReason: string }>(
    action: PlayAction,
    intent: RankedReadinessIntent | undefined,
    transport: {
        send: (action: PlayAction) => Promise<T>;
        refresh: () => Promise<void>;
        getSnapshot: () => (ReadinessSnapshot & { latestSequence: number }) | null;
        newActionId: () => string;
    },
): Promise<T> => {
    const response = await transport.send(action);
    if (!intent || response.accepted || response.rejectionReason !== "sequence_mismatch") return response;
    await transport.refresh();
    const current = transport.getSnapshot();
    if (!current || !canSubmitRankedReadinessIntent(intent, current)) return response;
    return transport.send({
        ...action,
        actionId: transport.newActionId(),
        expectedSequence: current.latestSequence,
        inputSource: PlayInputSource.CLIENT_RETRY,
    });
};
