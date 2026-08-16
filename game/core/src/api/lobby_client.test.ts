import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";

import {
    CreateLobbyRequest,
    JoinLobbyRequest,
    Lobby,
    LobbyList,
    LobbyStatus,
    ReadyRequest,
} from "@heroesofcrypto/common";

import { axiosMMInstance, endpoints } from "./axios";
import {
    createLobby,
    fetchLobby,
    fetchLobbyPriceBreakdown,
    fetchPublicLobbies,
    joinLobby,
    leaveLobby,
    openLobbyEventStream,
    setLobbyReady,
    startLobby,
} from "./lobby_client";

const host = {
    player_id: "host-1",
    username: "Host",
    ready: true,
};

const lobbyBytes = (id: string, name = "Battle Room"): Uint8Array =>
    Lobby.fromObject({
        id,
        name,
        is_private: false,
        status: LobbyStatus.LOBBY_OPEN,
        host,
        created_time: 1_000,
    }).serializeBinary();

const asArrayBuffer = (bytes: Uint8Array): ArrayBuffer =>
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

const storage = {
    getItem: (key: string) => (key === "accessToken" ? "Bearer lobby-token" : null),
} as Storage;

let previousStorage: Storage | undefined;
let previousFetch: typeof fetch;

beforeEach(() => {
    previousStorage = globalThis.localStorage;
    previousFetch = globalThis.fetch;
    (globalThis as { localStorage?: Storage }).localStorage = storage;
});

afterEach(() => {
    mock.restore();
    (globalThis as { localStorage?: Storage }).localStorage = previousStorage;
    globalThis.fetch = previousFetch;
});

describe("lobby client", () => {
    test("decodes lobby lists and individual lobbies from binary responses", async () => {
        const list = LobbyList.fromObject({
            lobbies: [
                Lobby.deserializeBinary(lobbyBytes("lobby-1")).toObject(),
                Lobby.deserializeBinary(lobbyBytes("lobby-2", "Second Room")).toObject(),
            ],
        }).serializeBinary();
        const get = spyOn(axiosMMInstance, "get")
            .mockResolvedValueOnce({ data: asArrayBuffer(list) } as never)
            .mockResolvedValueOnce({ data: lobbyBytes("lobby/special") } as never);

        const publicLobbies = await fetchPublicLobbies();
        const lobby = await fetchLobby("lobby/special");

        expect(publicLobbies.map(({ id, name }) => ({ id, name }))).toEqual([
            { id: "lobby-1", name: "Battle Room" },
            { id: "lobby-2", name: "Second Room" },
        ]);
        expect(lobby.id).toBe("lobby/special");
        expect(get).toHaveBeenNthCalledWith(
            1,
            endpoints.mm.lobbies,
            expect.objectContaining({
                responseType: "arraybuffer",
                headers: expect.objectContaining({ Authorization: "Bearer lobby-token" }),
            }),
        );
        expect(get.mock.calls[1]?.[0]).toBe(`${endpoints.mm.lobby}/lobby%2Fspecial`);
    });

    test("serializes each lobby mutation and safely encodes lobby ids in command paths", async () => {
        const post = spyOn(axiosMMInstance, "post").mockResolvedValue({
            data: lobbyBytes("room/with spaces"),
        } as never);

        await createLobby({ name: "Friends only", isPrivate: true, pin: "1234" });
        await joinLobby("room/with spaces", "9876");
        await setLobbyReady("room/with spaces", true);
        await startLobby("room/with spaces");
        await leaveLobby("room/with spaces");

        const createBody = CreateLobbyRequest.deserializeBinary(post.mock.calls[0]?.[1] as Uint8Array).toObject();
        const joinBody = JoinLobbyRequest.deserializeBinary(post.mock.calls[1]?.[1] as Uint8Array).toObject();
        const readyBody = ReadyRequest.deserializeBinary(post.mock.calls[2]?.[1] as Uint8Array).toObject();

        expect(createBody).toEqual({ name: "Friends only", is_private: true, pin: "1234" });
        expect(joinBody).toEqual({ pin: "9876" });
        expect(readyBody).toEqual({ ready: true });
        expect(post.mock.calls.map((call) => call[0])).toEqual([
            endpoints.mm.lobbyCreate,
            `${endpoints.mm.lobbyJoin}/room%2Fwith%20spaces`,
            `${endpoints.mm.lobbyReady}/room%2Fwith%20spaces`,
            `${endpoints.mm.lobbyStart}/room%2Fwith%20spaces`,
            `${endpoints.mm.lobbyLeave}/room%2Fwith%20spaces`,
        ]);
        expect(post.mock.calls[3]?.[1]).toEqual(new Uint8Array());
        expect(post.mock.calls[4]?.[1]).toEqual(new Uint8Array());
        for (const call of post.mock.calls) {
            expect(call[2]?.headers).toEqual(
                expect.objectContaining({
                    Authorization: "Bearer lobby-token",
                    "Content-Type": "application/octet-stream",
                    "x-request-id": expect.any(String),
                }),
            );
        }
    });

    test("reassembles fragmented SSE frames and emits every protobuf lobby update", async () => {
        const first = Buffer.from(lobbyBytes("stream-1")).toString("base64");
        const second = Buffer.from(lobbyBytes("stream-2", "Started")).toString("base64");
        const payload = `${first}\n\n${second}\n\n`;
        const chunks = [payload.slice(0, 9), payload.slice(9, first.length + 3), payload.slice(first.length + 3)];
        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                for (const chunk of chunks) {
                    controller.enqueue(encoder.encode(chunk));
                }
                controller.close();
            },
        });
        let requestUrl = "";
        let requestInit: RequestInit | undefined;
        globalThis.fetch = (async (input, init) => {
            requestUrl = String(input);
            requestInit = init;
            return new Response(stream, { status: 200 });
        }) as typeof fetch;
        const abort = new AbortController();
        const updates: string[] = [];

        await openLobbyEventStream("room/special", (lobby) => updates.push(lobby.id ?? ""), abort.signal);

        expect(updates).toEqual(["stream-1", "stream-2"]);
        expect(requestUrl).toEndWith(`${endpoints.mm.lobbyEvents}/room%2Fspecial`);
        expect(requestInit).toMatchObject({
            cache: "no-cache",
            mode: "cors",
            signal: abort.signal,
            headers: {
                Accept: "text/event-stream",
                Authorization: "Bearer lobby-token",
            },
        });
    });

    test("rejects an unsuccessful or bodyless event stream before reading frames", async () => {
        globalThis.fetch = (async () => new Response(null, { status: 503 })) as unknown as typeof fetch;

        await expect(
            openLobbyEventStream("unavailable", () => undefined, new AbortController().signal),
        ).rejects.toThrow("Lobby event stream failed: 503");
    });
});

describe("lobby creation price", () => {
    test("reads the price and the figures behind it from the JSON endpoint", async () => {
        const get = spyOn(axiosMMInstance, "get").mockResolvedValue({
            data: { price: 42, seasonGold: 84_000, calibratedPlayers: 200, perCalibratedPlayer: 10 },
        } as never);
        expect(await fetchLobbyPriceBreakdown()).toEqual({
            price: 42,
            seasonGold: 84_000,
            calibratedPlayers: 200,
            perCalibratedPlayer: 10,
        });
        expect(String(get.mock.calls[0]?.[0])).toContain(endpoints.mm.lobbyPrice);
    });

    test("0 means the season has no economy yet and lobbies are still free", async () => {
        spyOn(axiosMMInstance, "get").mockResolvedValue({
            data: { price: 0, seasonGold: 0, calibratedPlayers: 0, perCalibratedPlayer: 10 },
        } as never);
        expect((await fetchLobbyPriceBreakdown()).price).toBe(0);
    });

    test("a malformed answer reads as free rather than as a bogus charge", async () => {
        // The quote is only DISPLAYED — the server charges what it charges — so a garbled body must
        // not render as "costs NaN G" or, worse, as a negative price the UI reads as a credit.
        for (const body of [{}, { price: "12" }, { price: -5 }, { price: Number.NaN }, null]) {
            spyOn(axiosMMInstance, "get").mockResolvedValue({ data: body } as never);
            expect((await fetchLobbyPriceBreakdown()).price).toBe(0);
        }
    });

    test("keeps a sane per-player divisor even if the server omits it", async () => {
        // The explanation reads "spread over N slots each"; a 0 there would be nonsense on screen.
        spyOn(axiosMMInstance, "get").mockResolvedValue({ data: { price: 5 } } as never);
        expect((await fetchLobbyPriceBreakdown()).perCalibratedPlayer).toBe(10);
    });

    test("floors fractional figures so the UI never shows a part-coin price", async () => {
        spyOn(axiosMMInstance, "get").mockResolvedValue({
            data: { price: 7.9, seasonGold: 100.5, calibratedPlayers: 3.2, perCalibratedPlayer: 10 },
        } as never);
        expect(await fetchLobbyPriceBreakdown()).toMatchObject({ price: 7, seasonGold: 100, calibratedPlayers: 3 });
    });
});
