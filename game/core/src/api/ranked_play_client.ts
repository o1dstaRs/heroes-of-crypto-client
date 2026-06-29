import { TeamVals, type GameAction, type IDamageStatistic, type TeamType } from "@heroesofcrypto/common";
import { v4 as uuidv4 } from "uuid";

import type { AuthoritativeGameSnapshot, SceneGameActionTransport } from "../game_action_transport";
import { createRankedReplayFromPayload, type RankedReplay, type RankedReplayPayload } from "../replay/ranked_replay";
import { buildApiUrl, endpoints, HOST_GAME_API, axiosGameInstance } from "./axios";
import { createPlayActionFromGameAction } from "./game_action_play_codec";
import {
    decodePlayActionResponse,
    decodePlaySnapshot,
    decodeSsePlayEvent,
    encodePlayAction,
    PlayActionType,
    PlayPhase,
} from "./play_protocol";
import type { PlayAction, PlayActionResponse, PlayCell, PlayEvent, PlaySnapshot } from "./play_protocol";

const STORAGE_KEY = "accessToken";

const authHeaders = (authorization?: string): Record<string, string> => {
    const token = authorization ?? localStorage.getItem(STORAGE_KEY);
    return {
        "Content-Type": "application/octet-stream",
        "x-request-id": uuidv4(),
        ...(token ? { Authorization: token } : {}),
    };
};

export const rankedEventHeaders = (): Record<string, string> => {
    const token = localStorage.getItem(STORAGE_KEY);
    return {
        Accept: "text/event-stream",
        ...(token ? { Authorization: token } : {}),
    };
};

const appendEncodedPath = (baseUrl: string, value: string): string =>
    `${baseUrl.replace(/\/+$/, "")}/${encodeURIComponent(value)}`;

// Dev/e2e observer-play links (?e2ePlayerId=) aren't authenticated, so the server can't
// resolve the viewer from a token. Forward the id as ?playerId= on snapshot/events reads so
// the player sees their OWN units (otherwise the snapshot is sanitized -> "Unknown" -> empty board).
const readE2ePlayerId = (): string | null => {
    if (typeof window === "undefined") {
        return null;
    }
    return new URL(window.location.href).searchParams.get("e2ePlayerId");
};

const withViewerPlayerId = (url: string): string => {
    const playerId = readE2ePlayerId();
    if (!playerId) {
        return url;
    }
    return `${url}${url.includes("?") ? "&" : "?"}playerId=${encodeURIComponent(playerId)}`;
};

const playSnapshotUrl = (gameId: string): string =>
    withViewerPlayerId(appendEncodedPath(endpoints.game.playSnapshot, gameId));
const playReplayUrl = (gameId: string): string => appendEncodedPath(endpoints.game.playReplay, gameId);
const playActionUrl = (gameId: string): string => appendEncodedPath(endpoints.game.playAction, gameId);

export const playEventsUrl = (gameId: string, afterSequence: number): string => {
    const base = appendEncodedPath(buildApiUrl(HOST_GAME_API, endpoints.game.playEvents), gameId);
    return withViewerPlayerId(`${base}?after=${encodeURIComponent(String(afterSequence))}`);
};

export const toBytes = (data: unknown): Uint8Array => {
    if (data instanceof ArrayBuffer) {
        return new Uint8Array(data);
    }
    if (data instanceof Uint8Array) {
        return data;
    }
    return new Uint8Array(data as ArrayBuffer);
};

export const fetchRankedPlaySnapshot = async (
    gameId: string,
    options?: { authorization?: string },
): Promise<PlaySnapshot> => {
    const response = await axiosGameInstance.get(playSnapshotUrl(gameId), {
        responseType: "arraybuffer",
        headers: authHeaders(options?.authorization),
    });
    return decodePlaySnapshot(toBytes(response.data));
};

export const fetchRankedPlayReplay = async (gameId: string): Promise<RankedReplay> => {
    const response = await axiosGameInstance.get<RankedReplayPayload>(playReplayUrl(gameId), {
        headers: authHeaders(),
    });
    return createRankedReplayFromPayload(response.data);
};

// One clean, copy-pasteable client-side action log. Every action the client sends (this is the
// single POST choke point used by both the scene transport and the UI) is recorded with its
// sequence and the server's verdict (accepted/rejected + reason), so it can be diffed directly
// against the server's [play-action] traces. Printed to console + kept in window.__hocActionLog
// (dump with: copy(window.__hocActionLog.join('\n')) in devtools).
const xy = (cell?: PlayCell | null): string => (cell ? `(${cell.x},${cell.y})` : "-");

const PLAY_ACTION_TYPE_NAME: Record<number, string> = Object.fromEntries(
    Object.entries(PlayActionType).map(([name, value]) => [value, name]),
);

const summarizeAction = (payload: PlayAction): string => {
    const type = PLAY_ACTION_TYPE_NAME[payload.type] ?? `#${payload.type}`;
    const parts = [`unit=${(payload.unitId || "-").slice(0, 8)}`];
    if (payload.targetUnitId) parts.push(`target=${payload.targetUnitId.slice(0, 8)}`);
    if (payload.attackFrom) parts.push(`attackFrom=${xy(payload.attackFrom)}`);
    if (payload.path?.length) parts.push(`path=${payload.path.length}:${payload.path.map(xy).join("")}`);
    if (payload.targetCells?.length) parts.push(`targetCells=${payload.targetCells.map(xy).join("")}`);
    if (payload.attackType) parts.push(`atkType=${payload.attackType}`);
    return `${type} ${parts.join(" ")}`;
};

const recordActionLog = (line: string): void => {
    const stamped = `${new Date().toISOString().slice(11, 23)} ${line}`;

    console.log(`[CLIENT-ACTION] ${stamped}`);
    const w = window as unknown as { __hocActionLog?: string[] };
    (w.__hocActionLog ??= []).push(stamped);
};

export const sendRankedPlayAction = async (
    gameId: string,
    payload: PlayAction,
    options?: { authorization?: string },
): Promise<PlayActionResponse> => {
    const actionSummary = summarizeAction(payload);
    const seqTag = `#${payload.expectedSequence}`;
    if (payload.type !== PlayActionType.PING) {
        recordActionLog(`${seqTag} SEND  ${actionSummary} id=${payload.actionId.slice(0, 8)}`);
    }
    try {
        const response = await axiosGameInstance.post(playActionUrl(gameId), encodePlayAction(payload), {
            responseType: "arraybuffer",
            headers: authHeaders(options?.authorization),
        });
        const decoded = decodePlayActionResponse(toBytes(response.data));
        if (payload.type !== PlayActionType.PING) {
            if (decoded.accepted) {
                recordActionLog(`${seqTag} ✅ ACCEPTED seq->${decoded.sequence} (${actionSummary})`);
            } else {
                recordActionLog(
                    `${seqTag} ❌ REJECTED ${decoded.rejectionReason || "?"} "${decoded.message || ""}" (${actionSummary})`,
                );
            }
        }
        return decoded;
    } catch (err: unknown) {
        if (payload.type !== PlayActionType.PING) {
            recordActionLog(
                `${seqTag} ⚠️ ERROR ${err instanceof Error ? err.message : String(err)} (${actionSummary})`,
            );
        }
        throw err;
    }
};

/**
 * Broadcast the local player's in-progress move aim so the opponent can preview a
 * silhouette of the active unit. Fire-and-forget: intents are ephemeral hints, so we
 * never advance the sequence or surface transport errors to the player. Omit
 * `targetCell` to clear a previously-sent aim.
 */
export const sendRankedPlayMoveIntent = (
    gameId: string,
    args: { playerId: string; team: TeamType; unitId: string; targetCell?: PlayCell },
): void => {
    const payload: PlayAction = {
        actionId: uuidv4(),
        gameId,
        playerId: args.playerId,
        expectedSequence: 0,
        type: PlayActionType.MOVE_INTENT,
        unitId: args.unitId,
        team: args.team,
        targetCell: args.targetCell,
    };
    void axiosGameInstance
        .post(playActionUrl(gameId), encodePlayAction(payload), {
            responseType: "arraybuffer",
            headers: authHeaders(),
        })
        .catch(() => undefined);
};

export const parseRankedPlaySseFrame = (frame: string): PlayEvent | null => {
    let eventName = "message";
    const data: string[] = [];

    for (const rawLine of frame.split("\n")) {
        const line = rawLine.trimEnd();
        if (!line || line.startsWith(":")) {
            continue;
        }
        if (line.startsWith("event:")) {
            eventName = line.slice("event:".length).trim();
        } else if (line.startsWith("data:")) {
            data.push(line.slice("data:".length).trim());
        }
    }

    if (eventName !== "play-pb" || !data.length) {
        return null;
    }
    return decodeSsePlayEvent(data.join("\n"));
};

const isTeam = (team: unknown): team is TeamType => team === TeamVals.LOWER || team === TeamVals.UPPER;

const winnerTeamFromJournal = (snapshot: PlaySnapshot): TeamType | undefined => {
    for (const entry of [...snapshot.journalTail].sort((a, b) => b.sequence - a.sequence)) {
        try {
            const events = JSON.parse(entry.eventsJson) as unknown;
            if (!Array.isArray(events)) {
                continue;
            }
            const finishEvent = events.find(
                (event): event is { type: string; winningTeam: unknown } =>
                    typeof event === "object" &&
                    event !== null &&
                    (event as { type?: unknown }).type === "fight_finished",
            );
            if (finishEvent && isTeam(finishEvent.winningTeam)) {
                return finishEvent.winningTeam;
            }
        } catch {
            // Older journal rows may not have parseable event payloads.
        }
    }
    return undefined;
};

const winnerTeamFromUnits = (snapshot: PlaySnapshot): TeamType | undefined => {
    if (!snapshot.fightFinished && snapshot.phase !== PlayPhase.FINISHED) {
        return undefined;
    }

    const lowerAlive = snapshot.units
        .filter((unit) => unit.team === TeamVals.LOWER)
        .reduce((sum, unit) => sum + Math.max(0, Math.floor(unit.amountAlive)), 0);
    const upperAlive = snapshot.units
        .filter((unit) => unit.team === TeamVals.UPPER)
        .reduce((sum, unit) => sum + Math.max(0, Math.floor(unit.amountAlive)), 0);

    if (lowerAlive > 0 && upperAlive <= 0) {
        return TeamVals.LOWER as TeamType;
    }
    if (upperAlive > 0 && lowerAlive <= 0) {
        return TeamVals.UPPER as TeamType;
    }
    return undefined;
};

const winnerTeamFromSnapshot = (snapshot: PlaySnapshot): TeamType | undefined =>
    winnerTeamFromJournal(snapshot) ?? winnerTeamFromUnits(snapshot);

export const toAuthoritativeGameSnapshot = (
    snapshot: PlaySnapshot,
    viewerTeam?: TeamType,
    localModelTeam?: TeamType,
): AuthoritativeGameSnapshot => ({
    gameId: snapshot.gameId,
    viewerTeam,
    localModelTeam,
    winnerTeam: winnerTeamFromSnapshot(snapshot),
    phase: snapshot.phase,
    gridType: snapshot.gridType,
    currentLap: snapshot.currentLap,
    fightStarted: snapshot.fightStarted || snapshot.phase === PlayPhase.PLAY || snapshot.phase === PlayPhase.FINISHED,
    fightFinished: snapshot.fightFinished || snapshot.phase === PlayPhase.FINISHED,
    currentUnitId: snapshot.currentUnitId,
    currentTurnTeam: snapshot.currentTurnTeam,
    latestSequence: snapshot.latestSequence,
    serverTimeMs: snapshot.serverTimeMs,
    placementDeadlineMs: snapshot.placementDeadlineMs,
    currentTurnStartMs: snapshot.currentTurnStartMs,
    currentTurnEndMs: snapshot.currentTurnEndMs,
    narrowingLayers: snapshot.narrowingLayers,
    centerDried: snapshot.centerDried,
    units: snapshot.units,
    upNext: snapshot.upNext,
    lowerStartUnits: snapshot.lowerStartUnits,
    upperStartUnits: snapshot.upperStartUnits,
    lowerStartHealth: snapshot.lowerStartHealth,
    upperStartHealth: snapshot.upperStartHealth,
    journalTail: snapshot.journalTail,
    damageStats: snapshot.damageStats.map((stat): IDamageStatistic => ({
        unitName: stat.unitName,
        damage: stat.damage,
        team: stat.team as TeamType,
        lap: stat.lap,
    })),
});

interface RankedGameActionTransportOptions {
    gameId: string;
    team: TeamType;
    getPlayerId: () => string | undefined;
    getExpectedSequence: () => number | undefined;
    onAccepted?: (response: PlayActionResponse) => void;
    onRejected?: (response: PlayActionResponse) => void;
    onError?: (error: Error) => void;
}

export const createRankedGameActionTransport = ({
    gameId,
    team,
    getPlayerId,
    getExpectedSequence,
    onAccepted,
    onRejected,
    onError,
}: RankedGameActionTransportOptions): SceneGameActionTransport => {
    return (action: GameAction) => {
        const playerId = getPlayerId();
        const expectedSequence = getExpectedSequence();
        if (!playerId || expectedSequence === undefined) {
            return { handled: true, completed: false, message: "Waiting for ranked game state" };
        }

        const payload = createPlayActionFromGameAction(action, {
            actionId: uuidv4(),
            gameId,
            playerId,
            expectedSequence,
            team,
        });

        void sendRankedPlayAction(gameId, payload)
            .then((response) => {
                if (response.accepted) {
                    onAccepted?.(response);
                } else {
                    onRejected?.(response);
                }
            })
            .catch((err: unknown) => {
                onError?.(err instanceof Error ? err : new Error(String(err)));
            });

        return { handled: true, completed: true };
    };
};
