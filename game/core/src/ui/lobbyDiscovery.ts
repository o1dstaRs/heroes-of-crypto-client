import type { LobbyObject } from "@heroesofcrypto/common";

export interface PrioritizedLobby {
    isFriendLobby: boolean;
    lobby: LobbyObject;
}

export const prioritizeLobbies = (
    lobbies: readonly LobbyObject[],
    friendPlayerIds: ReadonlySet<string>,
): PrioritizedLobby[] =>
    lobbies
        .map((lobby) => ({
            lobby,
            isFriendLobby: !!lobby.host?.player_id && friendPlayerIds.has(lobby.host.player_id),
        }))
        .sort((left, right) => {
            if (left.isFriendLobby !== right.isFriendLobby) {
                return left.isFriendLobby ? -1 : 1;
            }
            return Number(right.lobby.created_time || 0) - Number(left.lobby.created_time || 0);
        });

export const lobbyAgeLabel = (createdTime: number | undefined, now: number = Date.now()): string => {
    const ageMs = Math.max(0, now - Number(createdTime || 0));
    const minutes = Math.max(1, Math.floor(ageMs / 60_000));
    if (minutes < 60) {
        return `${minutes}m`;
    }
    const hours = Math.floor(minutes / 60);
    return `${hours}h`;
};
