const runtimeHost = globalThis.location?.hostname ?? "";
const isProduction =
    runtimeHost === "heroesofcrypto.io" ||
    runtimeHost.endsWith(".heroesofcrypto.io") ||
    (import.meta.env.VITE_IS_PROD !== "false" && import.meta.env.PROD === true) ||
    import.meta.env.VITE_IS_PROD === "true";

// Single-box rigs: VITE_ARENA_SAME_HOST_API_PORT pins every arena API call to the HOSTNAME the
// site was served from (protocol preserved, only the port swapped), and VITE_ARENA_SAME_HOST_GAME_PORT
// does the same for links into the game client. One build then works identically from the LAN IP, a
// public DNS name, or a tunnel — no per-hostname origin rebakes. Absolute VITE_HOST_* overrides and
// the production defaults still apply when these ports are unset.
const sameHostOrigin = (port: string | number | undefined): string | undefined => {
    if (!port || typeof globalThis.location === "undefined") {
        return undefined;
    }
    return `${globalThis.location.protocol}//${globalThis.location.hostname}:${port}`;
};
const sameHostApiOrigin = sameHostOrigin(import.meta.env.VITE_ARENA_SAME_HOST_API_PORT as string | undefined);
const sameHostGameOrigin = sameHostOrigin(import.meta.env.VITE_ARENA_SAME_HOST_GAME_PORT as string | undefined);

const matchmakingBaseUrl = String(
    sameHostApiOrigin ||
        import.meta.env.VITE_HOST_MATCHMAKING_API ||
        import.meta.env.VITE_MATCHMAKING_API ||
        (isProduction ? "https://mm.heroesofcrypto.io" : "http://localhost:3001"),
).replace(/\/+$/, "");

const gameApiBaseUrl = String(
    sameHostApiOrigin ||
        import.meta.env.VITE_HOST_GAME_API ||
        import.meta.env.VITE_GAME_API ||
        // game., NOT the client host. This fed /v1/games-live into the static client, which 404s and
        // surfaced as "Some arena data is unavailable" — only SOME, because the other two feeds sit on
        // matchmakingBaseUrl and were resolving correctly.
        (isProduction ? "https://game.heroesofcrypto.io" : "http://localhost:3001"),
).replace(/\/+$/, "");

const rawGameClientUrl = String(
    sameHostGameOrigin ||
        import.meta.env.VITE_GAME_CLIENT_RANKED ||
        import.meta.env.VITE_GAME_CLIENT ||
        import.meta.env.VITE_HOST_GAME_CLIENT ||
        (isProduction ? "https://app.heroesofcrypto.io" : "http://localhost:5174"),
).replace(/\/+$/, "");

export const gameClientRoot = rawGameClientUrl.replace(/\/play$/, "");

export const arenaEndpoints = {
    top: `${matchmakingBaseUrl}${isProduction ? "/v1/ranked-top?n=100" : "/v1/mm/ranked-top?n=100"}`,
    standings: `${matchmakingBaseUrl}${isProduction ? "/v1/ranked-standings" : "/v1/mm/ranked-standings"}`,
    games: `${gameApiBaseUrl}${isProduction ? "/v1/games-live" : "/v1/game/games-live"}`,
};

// Betting endpoints live on the matchmaking host alongside the rest of the authed player APIs.
export const predictionEndpoints = {
    bet: `${matchmakingBaseUrl}${isProduction ? "/v1/prediction-bet" : "/v1/mm/prediction-bet"}`,
    bets: `${matchmakingBaseUrl}${isProduction ? "/v1/prediction-bets" : "/v1/mm/prediction-bets"}`,
};
