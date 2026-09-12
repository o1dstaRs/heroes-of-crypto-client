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

// Bun sets NODE_ENV=development for every package script, and Vite only FILLS NODE_ENV when it is unset
// — so `bun scripts/vite_build.js production` inherited "development" and built the app in dev mode:
// import.meta.env.DEV stayed true, React shipped the development JSX transform (+520 KB of jsxDEV calls
// carrying fileName/lineNumber), and every `{import.meta.env.DEV && ...}` block survived tree-shaking,
// leaving the /dev/* calibration editors registered as routes in the production entry bundle.
// The `build` script's `cross-env NODE_ENV=production` only covers build:images, never this step.
//
// Set it here, before Vite is imported, because NODE_ENV is read during config resolution. A build is a
// build whatever its mode: `test` differs from `production` only in which .env file and API hosts it
// targets, not in whether the output should be optimized. Override with HOC_BUILD_NODE_ENV if a
// development-mode bundle is ever genuinely wanted.
process.env.NODE_ENV = process.env.HOC_BUILD_NODE_ENV || "production";

const { build } = await import("vite");

await build({ mode });
