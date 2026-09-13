import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";

import { axiosMMInstance, buildApiUrl, endpoints, HOST_MATCHMAKING_API } from "./axios";
import {
    canSpectateFriend,
    eligiblePredictionMarkets,
    fetchFriendMessages,
    friendActivityLabel,
    friendGameLabel,
    inviteStateLabel,
    joinableFriendLobbyId,
    inviteTarget,
    isFriendInviteNotification,
    chatSegments,
    searchHitPresenceLabel,
    searchPlayers,
    markFriendMessagesRead,
    sendFriendMessage,
    setFriendMuted,
    settledPredictionBetsForSeason,
    type PlayerSearchHit,
    type PredictionBet,
    type PredictionMarket,
} from "./social_client";

const FRIEND_ID = "bbbbbbbb-0000-4000-8000-000000000002";
const storage = {
    getItem: (key: string) => (key === "accessToken" ? "social-token" : null),
} as Storage;

let previousStorage: Storage | undefined;

beforeEach(() => {
    previousStorage = globalThis.localStorage;
    (globalThis as { localStorage?: Storage }).localStorage = storage;
});

afterEach(() => {
    mock.restore();
    (globalThis as { localStorage?: Storage }).localStorage = previousStorage;
});

describe("social messaging client", () => {
    test("loads a paginated friend conversation with authenticated headers", async () => {
        const get = spyOn(axiosMMInstance, "get").mockResolvedValue({
            data: { friend: null, messages: [], hasMore: false },
        } as never);

        await fetchFriendMessages(FRIEND_ID, 1_750_000_000_000);

        expect(get).toHaveBeenCalledWith(
            buildApiUrl(
                HOST_MATCHMAKING_API,
                `${endpoints.social.friendMessages}?playerId=${FRIEND_ID}&before=1750000000000`,
            ),
            {
                headers: expect.objectContaining({
                    Authorization: "social-token",
                    "x-request-id": expect.any(String),
                }),
            },
        );
    });

    test("sends messages, read acknowledgements, and mute preferences through distinct commands", async () => {
        const post = spyOn(axiosMMInstance, "post").mockResolvedValue({ data: { ok: true } } as never);

        await sendFriendMessage(FRIEND_ID, "hello");
        await markFriendMessagesRead(FRIEND_ID);
        await setFriendMuted(FRIEND_ID, true);

        expect(post.mock.calls.map((call) => [call[0], call[1]])).toEqual([
            [
                buildApiUrl(HOST_MATCHMAKING_API, endpoints.social.friendMessage),
                { playerId: FRIEND_ID, message: "hello" },
            ],
            [buildApiUrl(HOST_MATCHMAKING_API, endpoints.social.friendMessagesRead), { playerId: FRIEND_ID }],
            [buildApiUrl(HOST_MATCHMAKING_API, endpoints.social.friendMute), { playerId: FRIEND_ID, muted: true }],
        ]);
        for (const call of post.mock.calls) {
            expect(call[2]?.headers).toEqual(
                expect.objectContaining({ Authorization: "social-token", "x-request-id": expect.any(String) }),
            );
        }
    });
});

describe("prediction history", () => {
    test("keeps only markets that do not involve the viewer", () => {
        const market = (gameId: string, left: string, right: string): PredictionMarket => ({
            gameId,
            pickEndTime: 1_800_000_000_000,
            totalPool: 0,
            totalBets: 0,
            seats: [
                { playerId: `${gameId}-lower`, username: left, pool: 0, bets: 0 },
                { playerId: `${gameId}-upper`, username: right, pool: 0, bets: 0 },
            ],
        });
        const markets = [
            market("viewer-current-game", "SomeoneElse", "AnotherPlayer"),
            market("viewer-by-name", "previewplayer", "ThirdPlayer"),
            market("eligible-game", "IronWarden", "FrostQueen"),
        ];

        expect(
            eligiblePredictionMarkets(markets, {
                gameId: "viewer-current-game",
                username: "PreviewPlayer",
            }).map((candidate) => candidate.gameId),
        ).toEqual(["eligible-game"]);
    });

    test("keeps only settled bets from the active season", () => {
        const base: PredictionBet = {
            gameId: "current-settled",
            playerId: FRIEND_ID,
            predictedPlayerId: "bbbbbbbb-0000-4000-8000-000000000003",
            amount: 10,
            placedAt: 100,
            seasonSequence: 4,
            status: "won",
            payout: 20,
            settledAt: 200,
        };
        const bets: PredictionBet[] = [
            base,
            { ...base, gameId: "current-open", status: "open" },
            { ...base, gameId: "previous-settled", seasonSequence: 3 },
            { ...base, gameId: "legacy-settled", seasonSequence: undefined },
        ];

        expect(settledPredictionBetsForSeason(bets, 4).map((bet) => bet.gameId)).toEqual(["current-settled"]);
        expect(settledPredictionBetsForSeason(bets, undefined)).toEqual([]);
    });
});

describe("add-friend search", () => {
    const NOW = 1_700_000_000_000;

    test("carries the server's presence through to the row caption", async () => {
        const get = spyOn(axiosMMInstance, "get").mockResolvedValue({
            data: {
                players: [
                    { id: "1", username: "live", online: true, lastOnlineAt: NOW },
                    { id: "2", username: "dormant", online: false, lastOnlineAt: NOW - 3 * 86_400_000 },
                ],
            },
        } as never);

        const hits = await searchPlayers("  liv  ");
        // The query is trimmed and URL-encoded onto the search endpoint.
        expect(get.mock.calls[0]?.[0]).toBe(
            buildApiUrl(HOST_MATCHMAKING_API, `${endpoints.social.playerSearch}?q=liv`),
        );
        expect(hits.map((hit) => searchHitPresenceLabel(hit, NOW))).toEqual(["Online", "3d ago"]);
    });

    test("a query under two characters never reaches the network", async () => {
        const get = spyOn(axiosMMInstance, "get").mockResolvedValue({ data: { players: [] } } as never);
        expect(await searchPlayers(" a ")).toEqual([]);
        expect(get).not.toHaveBeenCalled();
    });

    test("a server that sends no presence reads as UNKNOWN, never as 'never'", () => {
        // An older matchmaking build answers {id, username} only. Claiming such a player has never been
        // online would be a confident lie; the row must simply omit the caption.
        const legacy = { id: "1", username: "someone" } as PlayerSearchHit;
        expect(searchHitPresenceLabel(legacy, NOW)).toBeUndefined();

        // A server that DID answer and genuinely has no record still says "never" — that is not a guess.
        const noRecord: PlayerSearchHit = { id: "2", username: "fresh", online: false, lastOnlineAt: 0 };
        expect(searchHitPresenceLabel(noRecord, NOW)).toBe("never");
    });
});

describe("arena chat rendering", () => {
    test("highlights tags and marks the viewer's own", () => {
        const segments = chatSegments("hey @alice and @bob", "BOB");
        expect(segments.filter((s) => s.kind === "mention").map((s) => s.text)).toEqual(["@alice", "@bob"]);
        // Case-insensitive: the tag reads @bob, the account is BOB, and it is still "me".
        expect(segments.find((s) => s.kind === "mention" && s.text === "@bob")).toMatchObject({ isSelf: true });
        expect(segments.find((s) => s.kind === "mention" && s.text === "@alice")).toMatchObject({ isSelf: false });
    });

    test("renders a link as a link and gives a scheme-less host one", () => {
        const withScheme = chatSegments("see https://heroesofcrypto.io/play");
        expect(withScheme.find((s) => s.kind === "link")).toMatchObject({ href: "https://heroesofcrypto.io/play" });
        const bare = chatSegments("see www.heroesofcrypto.io/play");
        expect(bare.find((s) => s.kind === "link")).toMatchObject({ href: "https://www.heroesofcrypto.io/play" });
    });

    test("keeps ordinary text intact and loses nothing", () => {
        const body = "gg wp @alice nice game";
        expect(
            chatSegments(body)
                .map((s) => s.text)
                .join(""),
        ).toBe(body);
    });

    test("an email is not a tag", () => {
        expect(chatSegments("write to me@example.com").some((s) => s.kind === "mention")).toBe(false);
    });
});

describe("notification sound classes", () => {
    test("only invitations from a friend get the friend-invite fanfare", () => {
        expect(isFriendInviteNotification("friend_request")).toBe(true);
        expect(isFriendInviteNotification("lobby_invite")).toBe(true);
        expect(isFriendInviteNotification("sandbox_invite")).toBe(true);
        expect(isFriendInviteNotification("friend_message")).toBe(false);
        expect(isFriendInviteNotification("chat_reply")).toBe(false);
        expect(isFriendInviteNotification("system")).toBe(false);
    });
});

describe("friends in game", () => {
    test("labels the friend's stage and offers spectating only for a live draft or fight", () => {
        expect(friendGameLabel({})).toBeUndefined();
        expect(friendGameLabel({ inGameId: "g", gameStage: "confirming" })).toBe("In game · Starting");
        expect(friendGameLabel({ inGameId: "g", gameStage: "pick" })).toBe("In game · Drafting");
        expect(friendGameLabel({ inGameId: "g", gameStage: "play" })).toBe("In game · Fighting");

        expect(canSpectateFriend({ inGameId: "g", gameStage: "play" }, undefined)).toBe(true);
        expect(canSpectateFriend({ inGameId: "g", gameStage: "pick" }, undefined)).toBe(true);
        expect(canSpectateFriend({ inGameId: "g", gameStage: "confirming" }, undefined)).toBe(false);
        expect(canSpectateFriend({}, undefined)).toBe(false);
    });

    test("never offers spectating while the viewer is in a game", () => {
        expect(canSpectateFriend({ inGameId: "g", gameStage: "play" }, "mine")).toBe(false);
    });
});

describe("invite lifecycle", () => {
    test("an open invite links to its room, a closed one links nowhere and reads closed", () => {
        expect(inviteTarget({ type: "sandbox_invite", sandboxId: "s1" })).toBe("/sandbox/s1");
        expect(inviteTarget({ type: "lobby_invite", lobbyId: "l1", roomOpen: true })).toBe("/lobby/l1");
        expect(inviteTarget({ type: "sandbox_invite", sandboxId: "s1", roomOpen: false })).toBeUndefined();
        expect(inviteTarget({ type: "chat_reply" })).toBeUndefined();
        expect(inviteStateLabel({ type: "sandbox_invite", roomOpen: false, acceptedAt: 5 })).toBe("closed");
        expect(inviteStateLabel({ type: "lobby_invite", roomOpen: true, acceptedAt: 5 })).toBe("accepted");
        expect(inviteStateLabel({ type: "lobby_invite", roomOpen: true })).toBeUndefined();
        expect(inviteStateLabel({ type: "friend_request", roomOpen: false })).toBeUndefined();
    });
});

describe("friend activity labels", () => {
    const LOBBY = "11111111-0000-4000-8000-000000000001";
    test("a live game outranks the queue, which outranks the reported activity", () => {
        expect(friendActivityLabel({ online: true, inGameId: "g", gameStage: "play", inQueue: true })).toBe(
            "In game · Fighting",
        );
        expect(friendActivityLabel({ online: true, inQueue: true, activity: { kind: "lobby" } })).toBe("In the queue");
        expect(friendActivityLabel({ online: true, activity: { kind: "lobby", lobbyId: LOBBY } })).toBe("In a lobby");
        expect(friendActivityLabel({ online: true, activity: { kind: "coop" } })).toBe("In a co-op sandbox");
        expect(friendActivityLabel({ online: true, activity: { kind: "game" } })).toBe("Spectating");
        expect(friendActivityLabel({ online: true, activity: { kind: "portal" } })).toBeUndefined();
        expect(friendActivityLabel({ online: false, activity: { kind: "arena" } })).toBeUndefined();
    });

    test("a joinable lobby is offered only while the room is open and the viewer is free", () => {
        const inOpenLobby = { online: true, activity: { kind: "lobby" as const, lobbyId: LOBBY, lobbyOpen: true } };
        expect(joinableFriendLobbyId(inOpenLobby, undefined)).toBe(LOBBY);
        expect(joinableFriendLobbyId(inOpenLobby, "my-game")).toBeUndefined();
        expect(
            joinableFriendLobbyId(
                { ...inOpenLobby, activity: { ...inOpenLobby.activity, lobbyOpen: false } },
                undefined,
            ),
        ).toBeUndefined();
        expect(joinableFriendLobbyId({ ...inOpenLobby, inGameId: "g" }, undefined)).toBeUndefined();
        expect(joinableFriendLobbyId({ ...inOpenLobby, online: false }, undefined)).toBeUndefined();
    });
});
