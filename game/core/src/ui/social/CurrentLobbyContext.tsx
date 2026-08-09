import React, { createContext, useContext, useMemo, useState } from "react";

/**
 * App-wide "which lobby room am I currently inside" state. LobbyView publishes the lobby id on mount
 * (and clears it on unmount); the SocialDock reads it so the friends panel can offer an "Invite" button
 * only while the player is actually in a lobby. Kept deliberately tiny — just an id and its setter.
 */

interface ICurrentLobbyContext {
    lobbyId: string | null;
    setLobbyId: (id: string | null) => void;
}

const CurrentLobbyContext = createContext<ICurrentLobbyContext>({
    lobbyId: null,
    setLobbyId: () => {},
});

export const useCurrentLobby = (): ICurrentLobbyContext => useContext(CurrentLobbyContext);

export const CurrentLobbyProvider: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
    const [lobbyId, setLobbyId] = useState<string | null>(null);
    const value = useMemo(() => ({ lobbyId, setLobbyId }), [lobbyId]);
    return <CurrentLobbyContext.Provider value={value}>{children}</CurrentLobbyContext.Provider>;
};
