import React, { createContext, useContext, useMemo, useState } from "react";

/**
 * App-wide "where can I invite a friend to right now" state. LobbyView publishes the lobby id on mount
 * (and clears it on unmount); the offline sandbox publishes that a co-op sandbox invite is possible while a
 * signed-in player stands in it. The SocialDock reads both so the friends panel offers "Invite" only while
 * the player is actually in a lobby, and "Invite to sandbox" only from the sandbox. Deliberately tiny.
 */

interface ICurrentLobbyContext {
    lobbyId: string | null;
    setLobbyId: (id: string | null) => void;
    /** True while the signed-in player is in the offline sandbox, where a friend can be invited to co-op. */
    sandboxInviteAvailable: boolean;
    setSandboxInviteAvailable: (available: boolean) => void;
}

const CurrentLobbyContext = createContext<ICurrentLobbyContext>({
    lobbyId: null,
    setLobbyId: () => {},
    sandboxInviteAvailable: false,
    setSandboxInviteAvailable: () => {},
});

export const useCurrentLobby = (): ICurrentLobbyContext => useContext(CurrentLobbyContext);

export const CurrentLobbyProvider: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
    const [lobbyId, setLobbyId] = useState<string | null>(null);
    const [sandboxInviteAvailable, setSandboxInviteAvailable] = useState(false);
    const value = useMemo(
        () => ({ lobbyId, setLobbyId, sandboxInviteAvailable, setSandboxInviteAvailable }),
        [lobbyId, sandboxInviteAvailable],
    );
    return <CurrentLobbyContext.Provider value={value}>{children}</CurrentLobbyContext.Provider>;
};
