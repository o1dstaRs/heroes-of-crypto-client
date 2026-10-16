/**
 * The army the host had placed in the offline sandbox travels to the co-op sandbox through
 * sessionStorage: written when the invite is sent, replayed as placements the first time the co-op board
 * shows the host an empty army, then dropped. Per tab on purpose — it is this tab's sandbox.
 */
export interface CoopCarryOverUnit {
    unitName: string;
    cells: { x: number; y: number }[];
}

const KEY_PREFIX = "hoc:coop-carry:";

export const storeCoopCarryOver = (gameId: string, army: CoopCarryOverUnit[]): void => {
    try {
        if (army.length) {
            window.sessionStorage.setItem(`${KEY_PREFIX}${gameId}`, JSON.stringify(army));
        }
    } catch {
        /* storage may be unavailable; the board simply starts empty */
    }
};

/** Read and clear the carry-over for a sandbox, so it is replayed at most once. */
export const takeCoopCarryOver = (gameId: string): CoopCarryOverUnit[] => {
    try {
        const raw = window.sessionStorage.getItem(`${KEY_PREFIX}${gameId}`);
        if (!raw) {
            return [];
        }
        window.sessionStorage.removeItem(`${KEY_PREFIX}${gameId}`);
        const parsed = JSON.parse(raw) as unknown;
        return Array.isArray(parsed) ? parsed.filter(isCarryOverUnit) : [];
    } catch {
        return [];
    }
};

export const isCarryOverUnit = (value: unknown): value is CoopCarryOverUnit =>
    !!value &&
    typeof value === "object" &&
    typeof (value as { unitName?: unknown }).unitName === "string" &&
    Array.isArray((value as { cells?: unknown }).cells) &&
    (value as { cells: unknown[] }).cells.every(
        (cell) =>
            !!cell &&
            typeof cell === "object" &&
            Number.isInteger((cell as { x?: unknown }).x) &&
            Number.isInteger((cell as { y?: unknown }).y),
    );
