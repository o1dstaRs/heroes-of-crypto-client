import type { GameAction, TeamType } from "@heroesofcrypto/common";
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
    PlayPhase,
} from "./play_protocol";
import type { PlayAction, PlayActionResponse, PlayEvent, PlaySnapshot } from "./play_protocol";

const STORAGE_KEY = "accessToken";

const authHeaders = (): Record<string, string> => {
    const token = localStorage.getItem(STORAGE_KEY);
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

const playSnapshotUrl = (gameId: string): string => appendEncodedPath(endpoints.game.playSnapshot, gameId);
const playReplayUrl = (gameId: string): string => appendEncodedPath(endpoints.game.playReplay, gameId);
const playActionUrl = (gameId: string): string => appendEncodedPath(endpoints.game.playAction, gameId);

export const playEventsUrl = (gameId: string, afterSequence: number): string => {
    const base = appendEncodedPath(buildApiUrl(HOST_GAME_API, endpoints.game.playEvents), gameId);
    return `${base}?after=${encodeURIComponent(String(afterSequence))}`;
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

export const fetchRankedPlaySnapshot = async (gameId: string): Promise<PlaySnapshot> => {
    const response = await axiosGameInstance.get(playSnapshotUrl(gameId), {
        responseType: "arraybuffer",
        headers: authHeaders(),
    });
    return decodePlaySnapshot(toBytes(response.data));
};

export const fetchRankedPlayReplay = async (gameId: string): Promise<RankedReplay> => {
    const response = await axiosGameInstance.get<RankedReplayPayload>(playReplayUrl(gameId), {
        headers: authHeaders(),
    });
    return createRankedReplayFromPayload(response.data);
};

export const sendRankedPlayAction = async (gameId: string, payload: PlayAction): Promise<PlayActionResponse> => {
    const response = await axiosGameInstance.post(playActionUrl(gameId), encodePlayAction(payload), {
        responseType: "arraybuffer",
        headers: authHeaders(),
    });
    return decodePlayActionResponse(toBytes(response.data));
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

export const toAuthoritativeGameSnapshot = (snapshot: PlaySnapshot): AuthoritativeGameSnapshot => ({
    gameId: snapshot.gameId,
    phase: snapshot.phase,
    gridType: snapshot.gridType,
    currentLap: snapshot.currentLap,
    fightStarted: snapshot.fightStarted || snapshot.phase === PlayPhase.PLAY || snapshot.phase === PlayPhase.FINISHED,
    fightFinished: snapshot.fightFinished || snapshot.phase === PlayPhase.FINISHED,
    currentUnitId: snapshot.currentUnitId,
    currentTurnTeam: snapshot.currentTurnTeam,
    latestSequence: snapshot.latestSequence,
    units: snapshot.units,
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

        return { handled: true, completed: true, message: "Submitted to ranked server" };
    };
};
