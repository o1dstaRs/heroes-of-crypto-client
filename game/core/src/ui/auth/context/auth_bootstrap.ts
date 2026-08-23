import { ACCESS_TOKEN_STORAGE_KEY } from "../../../api/access_token";

export type AuthBootstrapGate = {
    activate: () => void;
    begin: () => number;
    isCurrent: (attempt: number) => boolean;
    deactivate: () => void;
};

/**
 * Auth bootstrap requests can finish after a cross-tab login/logout or after the provider unmounts.
 * This generation gate makes only the newest active attempt authoritative.
 */
export const createAuthBootstrapGate = (): AuthBootstrapGate => {
    let active = false;
    let generation = 0;

    return {
        activate: () => {
            active = true;
            generation += 1;
        },
        begin: () => {
            generation += 1;
            return generation;
        },
        isCurrent: (attempt) => active && attempt === generation,
        deactivate: () => {
            active = false;
            generation += 1;
        },
    };
};

/** localStorage.clear() reports key=null, so it must also trigger an auth refresh. */
export const shouldBootstrapFromStorageEvent = (key: string | null): boolean => {
    return key === null || key === ACCESS_TOKEN_STORAGE_KEY;
};
