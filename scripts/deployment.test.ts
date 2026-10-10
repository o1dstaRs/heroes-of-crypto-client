import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { loadEnv } from "vite";
import { prepareBuildEnvironment } from "./build_environment";
import {
    deploymentCommand,
    deploymentEnvironment,
    deploymentPlan,
    KNOWLEDGE_ORIGINS,
    KNOWLEDGE_URL,
    RELEASE_ROUTES,
    runDeploymentSteps,
    serverCommonPins,
    verifyBuildRoutes,
    verifyCommonPins,
    verifyKnowledgeRouting,
    type DeploymentConfig,
} from "./deployment";

const config: DeploymentConfig = {
    clientDirectory: "/workspace/client",
    serverDirectory: "/workspace/server",
    testHost: "test-host",
    prodHost: "prod-host",
    user: "root",
    allowLiveGames: false,
};
const common = "1234567".padEnd(40, "a");
const pin = (revision: string) => `github:o1dstaRs/heroes-of-crypto-common#${revision}`;

describe("deployment command selection", () => {
    it("defaults to a local plan rather than starting a release", () => {
        expect(deploymentCommand([])).toEqual({ command: "plan", target: "all", allowLiveGames: false });
    });
    it("accepts a plan target and Bun's argument separator", () => {
        expect(deploymentCommand(["plan", "--", "test"])).toEqual({
            command: "plan",
            target: "test",
            allowLiveGames: false,
        });
        expect(deploymentCommand(["all", "--", "--allow-live-games"])).toEqual({
            command: "all",
            target: "all",
            allowLiveGames: true,
        });
    });
    it.each([
        { argv: ["prod", "test"] },
        { argv: ["plan", "prod", "test"] },
        { argv: ["pin-common", "prod"] },
        { argv: ["test", "--skip-tests"] },
    ])("rejects ambiguous or unsupported arguments before deployment", ({ argv }) => {
        expect(() => deploymentCommand(argv)).toThrow("Usage");
    });
});

describe("coordinated release", () => {
    it("deploys the shared assistant once, then test server, test client/site, and production", () => {
        const steps = deploymentPlan("all", config);
        expect(steps.map((step) => [step.environment, step.knowledge === true])).toEqual([
            ["test", true],
            ["test", false],
            ["test", false],
            ["prod", false],
        ]);
        expect(steps[0].args).toContain("knowledge");
        expect(steps[0].args[steps[0].args.indexOf("--app-dir") + 1]).toBe("/root/hoc-knowledge-ai");
        expect(steps[1].args).toContain("test");
        expect(steps[1].args).not.toContain("--with-client");
        expect(steps[2].args).toContain("--client-only");
        expect(steps[2].args).toContain("--client-test");
        expect(steps[3].args).toContain("auth,mm,game,tx");
        expect(steps[3].args).toContain("--with-client");
        for (const step of steps) {
            expect(step.args).not.toContain("--no-site");
            expect(step.args).not.toContain("--skip-tests");
            expect(step.args).not.toContain("--no-rollback");
            expect(step.args).not.toContain("--allow-live-games");
            expect(step.args[step.args.indexOf("--host") + 1]).toBe(
                step.environment === "test" ? config.testHost : config.prodHost,
            );
        }
    });

    it("keeps single-environment game releases separate", () => {
        expect(deploymentPlan("test", config).some((step) => step.environment === "prod")).toBe(false);
        expect(deploymentPlan("prod", config).map((step) => step.name)).toEqual([
            "Shared Knowledge AI",
            "Production ranked APIs, game and website",
        ]);
    });

    it("refuses a shared test/production destination", () => {
        expect(() => deploymentPlan("all", { ...config, testHost: config.prodHost })).toThrow("different hosts");
    });

    it("preserves the live-games guard unless explicitly selected", () => {
        expect(
            deploymentPlan("all", { ...config, allowLiveGames: true }).every((step) =>
                step.args.includes("--allow-live-games"),
            ),
        ).toBe(true);
    });

    it.each([0, 1, 2])("never promotes to production after step %s fails", async (failed) => {
        const visited: string[] = [];
        const steps = deploymentPlan("all", config);
        await expect(
            runDeploymentSteps(steps, async (step) => {
                visited.push(step.name);
                if (step === steps[failed]) throw new Error("health check failed");
            }),
        ).rejects.toThrow("health check failed");
        expect(visited).toEqual(steps.slice(0, failed + 1).map((step) => step.name));
        expect(visited).not.toContain(steps[3].name);
    });

    it("prevents inherited production paths and public build values contaminating test", () => {
        const parent = {
            DEPLOY_HOST: "wrong-box",
            DEPLOY_SITE_SERVER_DIR: "/var/www/heroesofcrypto",
            DEPLOY_TEST_ECOSYSTEM: "/root/ecosystem.config.cjs",
            DEPLOY_KNOWLEDGE_APP_DIR: "/wrong",
            VITE_HOST_GAME_API: RELEASE_ROUTES.prod.game,
            PUBLIC_KNOWLEDGE_AI_URL: "http://localhost:3020",
            HOC_IMAGES_LOC: "/local/art",
            PRIVATE_SECRET: "kept-private",
        };
        const steps = deploymentPlan("all", config);
        const test = deploymentEnvironment(parent, steps[2], config);
        const prod = deploymentEnvironment(parent, steps[3], config);
        expect(test.DEPLOY_HOST).toBe(config.testHost);
        expect(test.DEPLOY_SITE_SERVER_DIR).toBe("/var/www/heroesofcrypto-test");
        expect(test.DEPLOY_CLIENT_URL).toBe(RELEASE_ROUTES.test.client);
        expect(test.DEPLOY_TEST_ECOSYSTEM).toBe("/root/ecosystem.test.config.cjs");
        expect(test.DEPLOY_KNOWLEDGE_APP_DIR).toBe("/root/hoc-knowledge-ai");
        expect(test.VITE_HOST_GAME_API).toBeUndefined();
        expect(test.PUBLIC_KNOWLEDGE_AI_URL).toBeUndefined();
        expect(test.HOC_IMAGES_LOC).toBe(parent.HOC_IMAGES_LOC);
        expect(test.PRIVATE_SECRET).toBe(parent.PRIVATE_SECRET);
        expect(prod.DEPLOY_HOST).toBe(config.prodHost);
        expect(prod.DEPLOY_SITE_SERVER_DIR).toBe("/var/www/heroesofcrypto");
        expect(prod.DEPLOY_SITE_URL).toBe(RELEASE_ROUTES.prod.site);
        expect(parent.DEPLOY_HOST).toBe("wrong-box");
    });
});

describe("common release pin", () => {
    it("reads both Bun JSONC lock entries and the package manifest", () => {
        const specifier = pin(common);
        const manifest = JSON.stringify({ dependencies: { "@heroesofcrypto/common": specifier } });
        const lock = `{
            "workspaces": { "": { "dependencies": { "@heroesofcrypto/common": "${specifier}", }, }, },
            "packages": { "@heroesofcrypto/common": ["@heroesofcrypto/common@${specifier}", {}, "archive", "checksum"], },
        }`;
        const pins = serverCommonPins(manifest, lock);
        expect(pins).toEqual([specifier, specifier, specifier]);
        expect(() => verifyCommonPins(common, common, ...pins)).not.toThrow();
    });

    it("refuses a lockfile without a resolved common package", () => {
        const specifier = pin(common);
        const manifest = JSON.stringify({ dependencies: { "@heroesofcrypto/common": specifier } });
        const lock = JSON.stringify({
            workspaces: { "": { dependencies: { "@heroesofcrypto/common": specifier } } },
            packages: {},
        });
        expect(() => verifyCommonPins(common, common, ...serverCommonPins(manifest, lock))).toThrow("same published");
    });
    it("accepts a published full SHA and its existing seven-character server pins", () => {
        expect(() =>
            verifyCommonPins(common, common, pin(common.slice(0, 7)), pin(common.slice(0, 7)), pin(common.slice(0, 7))),
        ).not.toThrow();
        expect(() => verifyCommonPins(common, common, pin(common), pin(common), pin(common))).not.toThrow();
    });

    it("catches submodule drift even when git is configured to ignore it", () => {
        expect(() => verifyCommonPins(common, "f".repeat(40), pin(common), pin(common), pin(common))).toThrow(
            "checkout",
        );
    });

    it.each([0, 1, 2])("catches a stale package or lock entry %s", (stale) => {
        const pins = [pin(common), pin(common), pin(common)];
        pins[stale] = pin("f".repeat(40));
        expect(() => verifyCommonPins(common, common, ...(pins as [string, string, string]))).toThrow("same published");
    });

    it.each(["main", "abc", "", undefined])("rejects mutable or incomplete pin %s", (revision) => {
        expect(() =>
            verifyCommonPins(common, common, revision ? pin(revision) : revision, pin(common), pin(common)),
        ).toThrow("same published");
    });
});

describe("public assistant release checks", () => {
    const allowed = (origin: string, overrides: Record<string, string> = {}) =>
        new Response(null, {
            status: 204,
            headers: {
                "Access-Control-Allow-Origin": origin,
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization, X-HoC-Device",
                ...overrides,
            },
        });
    const health = () => Response.json({ serverType: "knowledge", status: "ok" });

    it("checks health and all authenticated browser origins without model calls", async () => {
        const visits: { url: string; method: string; origin: string | null }[] = [];
        await verifyKnowledgeRouting(async (url, init) => {
            const origin = new Headers(init?.headers).get("Origin");
            visits.push({ url, method: init?.method ?? "GET", origin });
            return url.endsWith("/health") ? health() : allowed(origin ?? "");
        });
        expect(visits).toEqual([
            { url: `${KNOWLEDGE_URL}/health`, method: "GET", origin: null },
            ...KNOWLEDGE_ORIGINS.map((origin) => ({ url: `${KNOWLEDGE_URL}/ask`, method: "OPTIONS", origin })),
        ]);
    });

    it("fails when nginx routes health to the game instead of the assistant", async () => {
        await expect(
            verifyKnowledgeRouting(async () => Response.json({ serverType: "game", status: "ok" })),
        ).rejects.toThrow("wrong service");
    });

    it("fails on degraded health before checking browser routes", async () => {
        let requests = 0;
        await expect(
            verifyKnowledgeRouting(async () => {
                requests++;
                return Response.json({ serverType: "knowledge", status: "degraded" });
            }),
        ).rejects.toThrow("degraded service");
        expect(requests).toBe(1);
    });

    const rejectedHeaders: Record<string, string>[] = [
        { "Access-Control-Allow-Origin": "https://unrelated.example" },
        { "Access-Control-Allow-Methods": "GET, OPTIONS" },
        { "Access-Control-Allow-Headers": "Content-Type, Accept" },
    ];
    it.each(rejectedHeaders)(
        "rejects a preflight that a real authenticated browser would reject",
        async (overrides) => {
            await expect(
                verifyKnowledgeRouting(async (url, init) =>
                    url.endsWith("/health")
                        ? health()
                        : allowed(new Headers(init?.headers).get("Origin") ?? "", overrides),
                ),
            ).rejects.toThrow("HOC_KNOWLEDGE_CORS_ORIGINS");
        },
    );
});

describe("release build environment", () => {
    it("clears public values before mode loading while preserving art and private variables", () => {
        const env: Record<string, string | undefined> = {
            VITE_HOST_GAME_API: "http://localhost:3001",
            VITE_ARENA_SAME_HOST_API_PORT: "3001",
            PUBLIC_KNOWLEDGE_AI_URL: "http://localhost:3020",
            HOST_GAME_API: "http://localhost:3001",
            NODE_ENV: "development",
            HOC_IMAGES_LOC: "/local/art",
            HOC_ANIMATIONS_LOC: "/local/animations",
            PRIVATE_SECRET: "private",
        };
        prepareBuildEnvironment(env);
        expect(Object.keys(env).some((key) => key.startsWith("VITE_") || key.startsWith("PUBLIC_"))).toBe(false);
        expect(env.NODE_ENV).toBe("production");
        expect(env.HOST_GAME_API).toBeUndefined();
        expect(env.HOC_IMAGES_LOC).toBe("/local/art");
        expect(env.HOC_ANIMATIONS_LOC).toBe("/local/animations");
        expect(env.PRIVATE_SECRET).toBe("private");
    });

    const root = resolve(import.meta.dir, "..");
    const configuredRoutes = (environment: "test" | "prod") => {
        const route = RELEASE_ROUTES[environment];
        const api = {
            VITE_IS_PROD: "true",
            VITE_HOST_AUTH_API: route.auth,
            VITE_HOST_MATCHMAKING_API: route.matchmaking,
            VITE_HOST_GAME_API: route.game,
            VITE_GOOGLE_CLIENT_ID: "example.apps.googleusercontent.com",
        };
        return {
            core: {
                ...api,
                VITE_PICK_EVENT_SOURCE: `${route.game}/v1/pick-events`,
                VITE_KNOWLEDGE_AI_URL: KNOWLEDGE_URL,
            },
            site: { ...api, VITE_HOST_GAME_CLIENT: route.client, PUBLIC_KNOWLEDGE_AI_URL: KNOWLEDGE_URL },
        };
    };

    it.each(["test", "prod"] as const)("loads the real %s mode files with consistent routes", (environment) => {
        const saved = { ...process.env };
        try {
            process.env.VITE_HOST_GAME_API = "http://localhost:3001";
            prepareBuildEnvironment(process.env);
            const mode = RELEASE_ROUTES[environment].mode;
            expect(() =>
                verifyBuildRoutes(
                    environment,
                    loadEnv(mode, resolve(root, "game/core"), ["VITE_", "PUBLIC_"]),
                    loadEnv(mode, resolve(root, "site"), ["VITE_", "PUBLIC_"]),
                ),
            ).not.toThrow();
        } finally {
            for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
            Object.assign(process.env, saved);
        }
    });

    it("rejects test bundles calling production APIs or linking to the production game", () => {
        const { core, site } = configuredRoutes("test");
        expect(() =>
            verifyBuildRoutes("test", { ...core, VITE_HOST_AUTH_API: RELEASE_ROUTES.prod.auth }, site),
        ).toThrow("VITE_HOST_AUTH_API");
        expect(() =>
            verifyBuildRoutes("test", core, { ...site, VITE_HOST_GAME_API: RELEASE_ROUTES.prod.game }),
        ).toThrow("VITE_HOST_GAME_API");
        expect(() =>
            verifyBuildRoutes("test", core, { ...site, VITE_HOST_GAME_CLIENT: RELEASE_ROUTES.prod.client }),
        ).toThrow("website must link");
    });

    it("rejects wrong pick streams, AI endpoints and Google client IDs", () => {
        const { core, site } = configuredRoutes("test");
        expect(() =>
            verifyBuildRoutes(
                "test",
                { ...core, VITE_PICK_EVENT_SOURCE: `${RELEASE_ROUTES.prod.game}/v1/pick-events` },
                site,
            ),
        ).toThrow("pick events");
        expect(() =>
            verifyBuildRoutes("test", { ...core, VITE_KNOWLEDGE_AI_URL: RELEASE_ROUTES.prod.client }, site),
        ).toThrow("Knowledge AI");
        expect(() => verifyBuildRoutes("test", core, { ...site, VITE_GOOGLE_CLIENT_ID: "truncated" })).toThrow("OAuth");
    });
});
