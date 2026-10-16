type BuildEnvironment = Record<string, string | undefined>;

/** Bun eagerly loads .env; release builds must let Vite load the requested mode instead. */
export function prepareBuildEnvironment(env: BuildEnvironment): void {
    for (const key of Object.keys(env)) {
        if (
            key.startsWith("VITE_") ||
            key.startsWith("PUBLIC_") ||
            ["PROD", "HOST_AUTH_API", "HOST_MATCHMAKING_API", "HOST_GAME_API", "PICK_EVENT_SOURCE"].includes(key)
        ) {
            delete env[key];
        }
    }
    env.NODE_ENV = env.HOC_BUILD_NODE_ENV || "production";
}
