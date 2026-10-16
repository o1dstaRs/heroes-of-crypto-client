import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { prepareBuildEnvironment } from "./build_environment";
import {
    deploymentCommand,
    deploymentEnvironment,
    deploymentPlan,
    KNOWLEDGE_URL,
    RELEASE_ROUTES,
    runDeploymentSteps,
    serverCommonPins,
    verifyBuildRoutes,
    verifyCommonPins,
    verifyKnowledgeRouting,
    type DeploymentConfig,
} from "./deployment";

const root = resolve(import.meta.dir, "..");
const common = resolve(root, "game/heroes-of-crypto-common");
const server = resolve(process.env.HOC_SERVER_LOC || resolve(root, "../heroes-of-crypto-server"));
const repositories = [root, common, server];

function git(directory: string, ...args: string[]): string {
    const result = Bun.spawnSync(["git", ...args], { cwd: directory, stdout: "pipe", stderr: "pipe" });
    if (result.exitCode !== 0)
        throw new Error(`git ${args.join(" ")} failed in ${directory}: ${result.stderr.toString().trim()}`);
    return result.stdout.toString().trim();
}

async function run(args: string[], cwd: string, env = process.env): Promise<void> {
    console.log(`$ ${args.map((arg) => JSON.stringify(arg)).join(" ")}`);
    const proc = Bun.spawn(args, { cwd, env, stdin: "inherit", stdout: "inherit", stderr: "inherit" });
    if ((await proc.exited) !== 0) throw new Error(`Command failed: ${args.join(" ")}`);
}

function requireClean(directory: string): void {
    if (git(directory, "status", "--porcelain", "--untracked-files=normal", "--ignore-submodules=none")) {
        throw new Error(
            `Uncommitted changes in ${directory}. Publish the intended release first; deployment never stashes or commits shared work.`,
        );
    }
}

function upstream(directory: string): { remote: string; branch: string; ref: string } {
    const branch = git(directory, "branch", "--show-current");
    if (branch && branch !== "main") throw new Error(`Deploy from main in ${directory}; found ${branch}.`);
    if (!branch) {
        if (directory !== common) throw new Error(`Detached HEAD in ${directory}; deploy from main.`);
        const remotes = git(directory, "remote").split("\n");
        if (!remotes.includes("origin")) throw new Error("Detached common checkout requires its origin remote.");
        return { remote: "origin", branch: "main", ref: "origin/main" };
    }
    const remote = git(directory, "config", `branch.${branch}.remote`);
    const ref = git(directory, "config", `branch.${branch}.merge`);
    if (!remote || remote === "." || ref !== "refs/heads/main")
        throw new Error(`Configure a remote main upstream in ${directory}.`);
    return { remote, branch, ref: `${remote}/${branch}` };
}

function verifyPublished(directory: string): void {
    const { ref } = upstream(directory);
    const head = git(directory, "rev-parse", "HEAD");
    const remoteHead = git(directory, "rev-parse", ref);
    if (directory === common) git(directory, "merge-base", "--is-ancestor", head, remoteHead);
    else if (head !== remoteHead) throw new Error(`${directory} has unpublished commits. Push main before deployment.`);
}

async function syncRepositories(): Promise<void> {
    for (const directory of repositories) requireClean(directory);
    for (const directory of repositories) {
        const { remote, branch } = upstream(directory);
        await run(["git", "fetch", remote], directory);
        if (git(directory, "branch", "--show-current"))
            await run(["git", "pull", "--rebase", remote, branch], directory);
        requireClean(directory);
        verifyPublished(directory);
    }
    verifyPins();
}

function verifyPins(): void {
    const recorded = git(root, "ls-tree", "HEAD", "game/heroes-of-crypto-common").split(/\s+/)[2] ?? "";
    verifyCommonPins(
        recorded,
        git(common, "rev-parse", "HEAD"),
        ...serverCommonPins(
            readFileSync(resolve(server, "package.json"), "utf8"),
            readFileSync(resolve(server, "bun.lock"), "utf8"),
        ),
    );
}

async function verifyRoutes(): Promise<void> {
    prepareBuildEnvironment(process.env);
    const { loadEnv } = await import("vite");
    for (const environment of ["test", "prod"] as const) {
        const mode = RELEASE_ROUTES[environment].mode;
        verifyBuildRoutes(
            environment,
            loadEnv(mode, resolve(root, "game/core"), ["VITE_", "PUBLIC_"]),
            loadEnv(mode, resolve(root, "site"), ["VITE_", "PUBLIC_"]),
        );
    }
}

function verifyReleaseAssets(): void {
    if (process.env.CI === "true")
        throw new Error("Deploy locally with canonical art; CI stub builds are never release artifacts.");
    if (process.env.HOC_BUILD_NODE_ENV && process.env.HOC_BUILD_NODE_ENV !== "production")
        throw new Error("A release must use NODE_ENV=production.");
    for (const [key, suffix] of [
        ["HOC_IMAGES_LOC", ""],
        ["HOC_ANIMATIONS_LOC", "output"],
    ] as const) {
        const location = process.env[key];
        if (!location || !statSync(resolve(location, suffix)).isDirectory())
            throw new Error(`${key} must point to the canonical local release assets.`);
    }
}

async function localReadiness(checkCachedRefs = true): Promise<void> {
    if (!existsSync(resolve(server, "deploy/deploy.ts")))
        throw new Error("Server deployer not found. Set HOC_SERVER_LOC to the server checkout.");
    verifyPins();
    await verifyRoutes();
    verifyReleaseAssets();
    for (const directory of repositories) {
        requireClean(directory);
        if (checkCachedRefs) verifyPublished(directory);
    }
}

async function pinCommon(): Promise<void> {
    upstream(root);
    requireClean(common);
    requireClean(server);
    for (const directory of [common, server]) {
        const { remote, branch } = upstream(directory);
        await run(["git", "fetch", remote], directory);
        if (git(directory, "branch", "--show-current"))
            await run(["git", "pull", "--rebase", remote, branch], directory);
        requireClean(directory);
        if (directory === common) verifyPublished(directory);
    }
    const revision = git(common, "rev-parse", "HEAD");
    const manifestPath = resolve(server, "package.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.dependencies["@heroesofcrypto/common"] = `github:o1dstaRs/heroes-of-crypto-common#${revision}`;
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 4)}\n`);
    await run(["bun", "install", "--ignore-scripts"], server);
    verifyCommonPins(
        revision,
        revision,
        ...serverCommonPins(readFileSync(manifestPath, "utf8"), readFileSync(resolve(server, "bun.lock"), "utf8")),
    );
    console.log(
        "Server dependency and lockfile updated. Verify the server; commit and push package.json + bun.lock together, and record the same client submodule pin. Deployment requires published commits.",
    );
}

async function main(): Promise<void> {
    const { command, target, allowLiveGames } = deploymentCommand(Bun.argv.slice(2));
    if (command === "pin-common") {
        await pinCommon();
        return;
    }
    const config: DeploymentConfig = {
        clientDirectory: root,
        serverDirectory: server,
        testHost: process.env.HOC_DEPLOY_TEST_HOST || "5.161.212.53",
        prodHost: process.env.HOC_DEPLOY_PROD_HOST || "46.62.203.149",
        user: process.env.HOC_DEPLOY_USER || "root",
        allowLiveGames,
    };
    const plan = deploymentPlan(target, config);
    console.log(`Release order: ${plan.map((step) => step.name).join(" → ")}`);
    for (const environment of (target === "all" ? ["test", "prod"] : [target]) as ("test" | "prod")[]) {
        const route = RELEASE_ROUTES[environment];
        console.log(
            `${environment}: client ${route.client}; site ${route.site}; auth ${route.auth}; matchmaking ${route.matchmaking}; ranked ${route.game}`,
        );
    }
    console.log(`Shared AI: ${KNOWLEDGE_URL}`);
    if (command === "plan") {
        for (const step of plan) console.log(`${step.name}: ${step.args.map((arg) => JSON.stringify(arg)).join(" ")}`);
        try {
            await localReadiness();
            console.log("Local preflight passed. Plan only: no fetch, build, SSH, push or restart.");
        } catch (error) {
            console.log(`Not ready: ${(error as Error).message}\nPlan only: no fetch, build, SSH, push or restart.`);
        }
        return;
    }
    if (command === "check") {
        await localReadiness();
        console.log("Local preflight passed (cached remote refs; deployment fetches again).");
        return;
    }
    await localReadiness(false);
    await syncRepositories();
    const revisions = repositories.map((directory) => git(directory, "rev-parse", "HEAD"));
    await run(["bun", "install", "--frozen-lockfile", "--ignore-scripts"], root);
    await run(["bun", "install", "--frozen-lockfile", "--ignore-scripts"], server);
    await run(["bun", "run", "build:common"], root);
    await run(["bun", "run", "check"], root);
    await runDeploymentSteps(plan, async (step) => {
        await syncRepositories();
        if (repositories.some((directory, index) => git(directory, "rev-parse", "HEAD") !== revisions[index]))
            throw new Error(
                "A repository changed after release validation. Restart deployment so test and production receive the same validated revisions.",
            );
        await localReadiness();
        console.log(`Deploying ${step.name}`);
        await run(step.args, config.serverDirectory, deploymentEnvironment(process.env, step, config));
        if (step.knowledge) await verifyKnowledgeRouting();
    });
    console.log("Release complete. All selected deployer health checks passed.");
}

if (import.meta.main)
    main().catch((error) => {
        console.error(`Deployment stopped: ${(error as Error).message}`);
        process.exitCode = 1;
    });
