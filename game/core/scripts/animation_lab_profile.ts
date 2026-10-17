import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import approvedProfile from "../src/settings/approvedAnimationProfile.json";
import type { Plugin } from "vite";

const ENDPOINT = "/__hoc-dev/animation-profile";
export function resolveAnimationProfileDirectory(env: Record<string, string | undefined>): string {
    if (env.HOC_ANIMATION_PROFILE_DIR) return path.resolve(env.HOC_ANIMATION_PROFILE_DIR);
    if (env.HOC_IMAGES_LOC) return path.resolve(env.HOC_IMAGES_LOC, "../config/creature-animation-lab");
    return fileURLToPath(new URL("../../../../heroesofcrypto-assets/config/creature-animation-lab", import.meta.url));
}
export const ANIMATION_PROFILE_DIRECTORY = resolveAnimationProfileDirectory(process.env);
const initialValues = approvedProfile.values;
const ranges: Record<string, [number, number]> = {
    "stone.playbackRate": [0.25, 4],
    "stone.settledHoldMs": [0, 1000],
    "cyclops.clothPeriodMs": [300, 10000],
};
for (const unit of ["mantis", "griffin"])
    for (const phase of ["takeoffSpeed", "travelSpeed", "landingSpeed"]) ranges[`${unit}.${phase}`] = [0.25, 3];
const choices: Record<string, string[]> = {
    "cyclops.impactMode": ["sprites", "engine"],
    "fire.renderMode": ["sprites", "particles"],
};
export function validAnimationSetting(key: string, value: unknown): boolean {
    if (Object.hasOwn(choices, key)) return typeof value === "string" && choices[key]!.includes(value);
    if (!Object.hasOwn(ranges, key) || typeof value !== "number" || !Number.isFinite(value)) return false;
    const [min, max] = ranges[key]!;
    return value >= min && value <= max;
}

export function animationLabProfilePlugin(directory = ANIMATION_PROFILE_DIRECTORY): Plugin {
    const file = path.join(directory, "settings.json");
    let writes = Promise.resolve();
    const read = async () => {
        await fs.mkdir(directory, { recursive: true });
        try {
            await fs.writeFile(file, `${JSON.stringify({ version: 1, values: initialValues }, null, 2)}\n`, {
                flag: "wx",
            });
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        }
        const profile = JSON.parse(await fs.readFile(file, "utf8"));
        if (profile.version !== 1 || !profile.values || Array.isArray(profile.values))
            throw new Error("Invalid animation profile; preserving the file for recovery");
        for (const [key, value] of Object.entries(profile.values))
            if (!validAnimationSetting(key, value)) throw new Error(`Invalid animation setting: ${key}`);
        return profile;
    };
    return {
        name: "hoc-local-animation-profile",
        apply: "serve",
        async transformIndexHtml() {
            const profile = await read();
            return [
                {
                    tag: "script",
                    injectTo: "head-prepend",
                    children: `globalThis.__HOC_ANIMATION_PROFILE__=${JSON.stringify(profile.values).replace(/</g, "\\u003c")};`,
                },
            ];
        },
        configureServer(server) {
            server.middlewares.use(async (request, response, next) => {
                if (request.url?.split("?")[0] !== ENDPOINT) return next();
                response.setHeader("Content-Type", "application/json");
                response.setHeader("Cache-Control", "no-store");
                try {
                    if (request.method === "GET") {
                        response.end(JSON.stringify(await read()));
                        return;
                    }
                    if (request.method !== "PATCH") {
                        response.statusCode = 405;
                        response.end();
                        return;
                    }
                    // Accept only local, same-origin JSON edits; never an arbitrary filesystem path.
                    if (request.headers.origin && new URL(request.headers.origin).host !== request.headers.host) {
                        response.statusCode = 403;
                        response.end();
                        return;
                    }
                    if (!request.headers["content-type"]?.startsWith("application/json")) {
                        response.statusCode = 415;
                        response.end();
                        return;
                    }
                    let body = "";
                    for await (const chunk of request) {
                        body += chunk;
                        if (body.length > 8192) throw new Error("Profile request too large");
                    }
                    const { key, value } = JSON.parse(body);
                    if (typeof key !== "string" || !validAnimationSetting(key, value)) {
                        response.statusCode = 400;
                        response.end(JSON.stringify({ error: "Invalid animation setting" }));
                        return;
                    }
                    const write = writes.then(async () => {
                        const profile = await read();
                        if (profile.values[key] === value) return;
                        const revision = `${Date.now()}-${randomUUID()}`;
                        const history = path.join(directory, "history");
                        await fs.mkdir(history, { recursive: true });
                        await fs.copyFile(file, path.join(history, `${revision}.json`));
                        profile.values[key] = value;
                        const temporary = `${file}.${revision}.next`;
                        await fs.writeFile(temporary, `${JSON.stringify(profile, null, 2)}\n`);
                        await fs.rename(temporary, file);
                    });
                    writes = write.catch(() => undefined);
                    await write;
                    response.end(JSON.stringify({ ok: true }));
                } catch (error) {
                    response.statusCode = 500;
                    response.end(JSON.stringify({ error: String(error) }));
                }
            });
        },
    };
}
