import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";

import { axiosMMInstance, buildApiUrl, endpoints, HOST_MATCHMAKING_API } from "./axios";
import { fetchFriendMessages, markFriendMessagesRead, sendFriendMessage, setFriendMuted } from "./social_client";

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
