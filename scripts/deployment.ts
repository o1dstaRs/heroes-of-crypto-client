import { prepareBuildEnvironment } from "./build_environment";

export type DeploymentTarget = "test" | "prod" | "all";
export type DeploymentEnvironment = Record<string, string | undefined>;

export function deploymentCommand(argv: readonly string[]): {
    command: "plan" | "check" | "pin-common" | DeploymentTarget;
    target: DeploymentTarget;
    allowLiveGames: boolean;
} {
    const [command = "plan", ...flags] = argv.filter((arg) => arg !== "--");
    if (!["plan", "check", "pin-common", "test", "prod", "all"].includes(command))
        throw new Error(`Unknown deployment command: ${command}`);
    const targets = flags.filter((flag) => ["test", "prod", "all"].includes(flag));
    if (
        targets.length > 1 ||
        (targets.length && !["plan", "check"].includes(command)) ||
        (command === "pin-common" && flags.length) ||
        flags.some((flag) => !["test", "prod", "all", "--allow-live-games"].includes(flag))
    ) {
        throw new Error(
            "Usage: bun scripts/deploy.ts <plan|check|test|prod|all|pin-common> [test|prod|all for plan/check] [--allow-live-games]",
        );
    }
    return {
        command: command as "plan" | "check" | "pin-common" | DeploymentTarget,
        target: (["test", "prod", "all"].includes(command) ? command : (targets[0] ?? "all")) as DeploymentTarget,
        allowLiveGames: flags.includes("--allow-live-games"),
    };
}

export const RELEASE_ROUTES = {
    test: {
        mode: "test",
        client: "https://test.heroesofcrypto.io",
        site: "https://test.heroesofcrypto.io",
        auth: "https://test.heroesofcrypto.io",
        matchmaking: "https://test.heroesofcrypto.io",
        game: "https://test.heroesofcrypto.io",
        siteDirectory: "/var/www/heroesofcrypto-test",
    },
    prod: {
        mode: "production",
        client: "https://app.heroesofcrypto.io",
        site: "https://heroesofcrypto.io",
        auth: "https://auth.heroesofcrypto.io",
        matchmaking: "https://mm.heroesofcrypto.io",
        game: "https://game.heroesofcrypto.io",
        siteDirectory: "/var/www/heroesofcrypto",
    },
} as const;

export const KNOWLEDGE_URL = "https://test.heroesofcrypto.io/ai/knowledge";
export const KNOWLEDGE_ORIGINS = [
    RELEASE_ROUTES.test.client,
    RELEASE_ROUTES.prod.client,
    RELEASE_ROUTES.prod.site,
    "https://beta.heroesofcrypto.io",
];

interface CommonManifest {
    dependencies?: Record<string, unknown>;
}

interface CommonLockfile {
    workspaces?: Record<string, CommonManifest>;
    packages?: Record<string, unknown[]>;
}

export function serverCommonPins(manifestSource: string, lockSource: string): [unknown, unknown, unknown] {
    const manifest = JSON.parse(manifestSource) as CommonManifest;
    const lock = Bun.JSONC.parse(lockSource) as CommonLockfile;
    const resolved = lock.packages?.["@heroesofcrypto/common"]?.[0];
    return [
        manifest.dependencies?.["@heroesofcrypto/common"],
        lock.workspaces?.[""]?.dependencies?.["@heroesofcrypto/common"],
        typeof resolved === "string" ? resolved.replace(/^@heroesofcrypto\/common@/, "") : resolved,
    ];
}

type KnowledgeFetch = (url: string, init?: RequestInit) => Promise<Response>;

export async function verifyKnowledgeRouting(fetchImpl: KnowledgeFetch = globalThis.fetch): Promise<void> {
    const health = await fetchImpl(`${KNOWLEDGE_URL}/health`, { signal: AbortSignal.timeout(10_000) });
    if (!health.ok) throw new Error("Shared Knowledge AI is not reachable through its public nginx route.");
    const status = (await health.json()) as { serverType?: string; status?: string };
    if (status.serverType !== "knowledge" || status.status !== "ok")
        throw new Error("Public Knowledge AI health route returned the wrong service or a degraded service.");
    for (const origin of KNOWLEDGE_ORIGINS) {
        const response = await fetchImpl(`${KNOWLEDGE_URL}/ask`, {
            method: "OPTIONS",
            headers: {
                Origin: origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "authorization,content-type,x-hoc-device",
            },
            signal: AbortSignal.timeout(10_000),
        });
        const names = (header: string) =>
            (response.headers.get(header) ?? "")
                .toLowerCase()
                .split(",")
                .map((name) => name.trim());
        if (
            !response.ok ||
            response.headers.get("Access-Control-Allow-Origin") !== origin ||
            !names("Access-Control-Allow-Methods").includes("post") ||
            !["authorization", "content-type", "x-hoc-device"].every((header) =>
                names("Access-Control-Allow-Headers").includes(header),
            )
        )
            throw new Error(
                `Knowledge AI CORS does not allow ${origin}. Set HOC_KNOWLEDGE_CORS_ORIGINS in its private host env file; see DEPLOYMENT.md.`,
            );
    }
}

export interface DeploymentConfig {
    clientDirectory: string;
    serverDirectory: string;
    testHost: string;
    prodHost: string;
    user: string;
    allowLiveGames: boolean;
}

export interface DeploymentStep {
    name: string;
    environment: "test" | "prod";
    args: string[];
    knowledge?: boolean;
}

export function deploymentPlan(target: DeploymentTarget, config: DeploymentConfig): DeploymentStep[] {
    if (config.testHost === config.prodHost) throw new Error("Test and production must target different hosts.");
    const args = (environment: "test" | "prod", flags: string[], appDirectory = "/root/heroes-of-crypto-server") => [
        "bun",
        "run",
        "deploy",
        "--yes",
        ...flags,
        "--host",
        environment === "test" ? config.testHost : config.prodHost,
        "--user",
        config.user,
        "--app-dir",
        appDirectory,
        "--client-dir",
        config.clientDirectory,
        ...(config.allowLiveGames ? ["--allow-live-games"] : []),
    ];
    const steps: DeploymentStep[] = [
        {
            name: "Shared Knowledge AI",
            environment: "test",
            knowledge: true,
            args: args("test", ["--services", "knowledge"], "/root/hoc-knowledge-ai"),
        },
    ];
    if (target !== "prod") {
        steps.push(
            { name: "Test ranked APIs", environment: "test", args: args("test", ["--services", "test"]) },
            {
                name: "Test game and website",
                environment: "test",
                args: args("test", ["--client-only", "--client-test"]),
            },
        );
    }
    if (target !== "test") {
        steps.push({
            name: "Production ranked APIs, game and website",
            environment: "prod",
            args: args("prod", ["--services", "auth,mm,game,tx", "--with-client"]),
        });
    }
    return steps;
}

/** Generic DEPLOY_* values must never leak between the two invocations of the server deployer. */
export function deploymentEnvironment(
    parent: DeploymentEnvironment,
    step: DeploymentStep,
    config: DeploymentConfig,
): DeploymentEnvironment {
    const env = { ...parent };
    for (const key of Object.keys(env)) if (key.startsWith("DEPLOY_")) delete env[key];
    prepareBuildEnvironment(env);
    const route = RELEASE_ROUTES[step.environment];
    return {
        ...env,
        NODE_ENV: "production",
        DEPLOY_HOST: step.environment === "test" ? config.testHost : config.prodHost,
        DEPLOY_TEST_HOST: config.testHost,
        DEPLOY_USER: config.user,
        DEPLOY_APP_DIR: "/root/heroes-of-crypto-server",
        DEPLOY_KNOWLEDGE_APP_DIR: "/root/hoc-knowledge-ai",
        DEPLOY_CLIENT_DIR: config.clientDirectory,
        DEPLOY_CLIENT_SERVER_DIR: "/root/game/dist",
        DEPLOY_CLIENT_URL: route.client,
        DEPLOY_SITE_SERVER_DIR: route.siteDirectory,
        DEPLOY_SITE_URL: route.site,
        DEPLOY_ECOSYSTEM: "/root/ecosystem.config.cjs",
        DEPLOY_TEST_ECOSYSTEM: "/root/ecosystem.test.config.cjs",
    };
}

function commonRevision(specifier: unknown): string | undefined {
    if (typeof specifier !== "string") return undefined;
    return /^github:o1dstaRs\/heroes-of-crypto-common#([a-f0-9]{7,40})$/i.exec(specifier)?.[1].toLowerCase();
}

export function verifyCommonPins(
    recorded: string,
    checkedOut: string,
    manifestPin: unknown,
    lockPin: unknown,
    resolvedLockPin: unknown,
): void {
    if (!/^[a-f0-9]{40}$/i.test(recorded) || recorded !== checkedOut) {
        throw new Error(
            "The recorded client common pin differs from its checkout. Reconcile and commit the submodule pin before deploying.",
        );
    }
    const revisions = [manifestPin, lockPin, resolvedLockPin].map(commonRevision);
    if (revisions.some((pin) => !pin || !recorded.startsWith(pin))) {
        throw new Error(
            "Client common, server package.json and server bun.lock must pin the same published common commit. Run deploy:pin-common, install and commit the server pin and lockfile together.",
        );
    }
}

export function verifyBuildRoutes(
    environment: "test" | "prod",
    core: Record<string, string>,
    site: Record<string, string>,
): void {
    const route = RELEASE_ROUTES[environment];
    const expected = {
        VITE_HOST_AUTH_API: route.auth,
        VITE_HOST_MATCHMAKING_API: route.matchmaking,
        VITE_HOST_GAME_API: route.game,
        VITE_IS_PROD: "true",
    };
    for (const [name, env] of [
        ["game", core],
        ["site", site],
    ] as const) {
        for (const [key, value] of Object.entries(expected)) {
            if (env[key] !== value)
                throw new Error(
                    `${environment} ${name}: ${key} must be ${value}. Check the mode-specific .env and .env.local overrides.`,
                );
        }
    }
    if (core.VITE_PICK_EVENT_SOURCE !== `${route.game}/v1/pick-events`)
        throw new Error(`${environment}: pick events use the wrong API.`);
    if (site.VITE_HOST_GAME_CLIENT !== route.client)
        throw new Error(`${environment}: the website must link to ${route.client}.`);
    if (core.VITE_KNOWLEDGE_AI_URL !== KNOWLEDGE_URL || site.PUBLIC_KNOWLEDGE_AI_URL !== KNOWLEDGE_URL)
        throw new Error(`${environment}: both builds must use the shared Knowledge AI endpoint.`);
    if (
        !core.VITE_GOOGLE_CLIENT_ID?.endsWith(".apps.googleusercontent.com") ||
        core.VITE_GOOGLE_CLIENT_ID !== site.VITE_GOOGLE_CLIENT_ID
    )
        throw new Error(`${environment}: game and site must use the same complete Google OAuth client ID.`);
}

/** A rejected step ends the release, including promotion to production. */
export async function runDeploymentSteps(
    steps: DeploymentStep[],
    execute: (step: DeploymentStep) => Promise<void>,
): Promise<void> {
    for (const step of steps) await execute(step);
}
