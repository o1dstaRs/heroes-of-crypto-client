// Bun eagerly loads game/core/.env before it runs package scripts. Those values then look like
// explicit shell environment variables to Vite and override the mode-specific .env.production or
// .env.test file. Clear only the public build variables that belong to Vite before importing it so
// `build({ mode })` can resolve the requested environment normally.
const MODE_ENV_KEYS = [
    "PROD",
    "HOST_AUTH_API",
    "HOST_MATCHMAKING_API",
    "HOST_GAME_API",
    "PICK_EVENT_SOURCE",
    "VITE_HOST_AUTH_API",
    "VITE_HOST_MATCHMAKING_API",
    "VITE_HOST_GAME_API",
    "VITE_PICK_EVENT_SOURCE",
    "VITE_GOOGLE_CLIENT_ID",
    "VITE_IS_PROD",
    "VITE_SITE_ORIGIN",
];

for (const key of MODE_ENV_KEYS) {
    delete process.env[key];
}

const mode = process.argv[2] || "production";
const { build } = await import("vite");

await build({ mode });
