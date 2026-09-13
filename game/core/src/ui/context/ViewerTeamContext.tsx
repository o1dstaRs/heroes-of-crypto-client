import { createContext, useContext } from "react";
import type { TeamType } from "@heroesofcrypto/common";

/**
 * The team the local viewer plays as in ranked games. `undefined` means there is no fixed
 * perspective (sandbox, where both teams are controlled, or a ranked observer) — in that
 * case the UI falls back to absolute team labels (Red/Green) instead of "Your/Enemy".
 */
export const ViewerTeamContext = createContext<TeamType | undefined>(undefined);

export const useViewerTeam = (): TeamType | undefined => useContext(ViewerTeamContext);

/**
 * True while watching a ranked game you hold no seat in. `useViewerTeam()` is undefined for BOTH the sandbox
 * and a spectator, so anything sandbox-only (START, the Green/Red AI switches) must check this too — a
 * spectator must never be able to hand a player's side to the local AI.
 */
export const SpectatorContext = createContext(false);

export const useIsSpectator = (): boolean => useContext(SpectatorContext);
