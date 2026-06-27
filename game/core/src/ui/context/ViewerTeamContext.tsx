import { createContext, useContext } from "react";
import type { TeamType } from "@heroesofcrypto/common";

/**
 * The team the local viewer plays as in ranked games. `undefined` means there is no fixed
 * perspective (sandbox, where both teams are controlled, or a ranked observer) — in that
 * case the UI falls back to absolute team labels (Red/Green) instead of "Your/Enemy".
 */
export const ViewerTeamContext = createContext<TeamType | undefined>(undefined);

export const useViewerTeam = (): TeamType | undefined => useContext(ViewerTeamContext);
