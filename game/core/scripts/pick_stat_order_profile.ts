import type { Plugin } from "vite";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { resolvePickOrderDirectory } from "./pick_card_order_profile";
import { PICK_STAT_ORDER_ENDPOINT, validatePickStatOrder, type PickStatId } from "../src/ui/pickStatOrderModel";

export function createPickStatStore(directory: string) {
    const file = path.join(directory, "settings.json");
    let queue: Promise<unknown> = Promise.resolve();
    const read = async (): Promise<PickStatId[] | null> => {
        try {
            return validatePickStatOrder(JSON.parse(await fs.readFile(file, "utf8")));
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
            throw error;
        }
    };
    const write = (value: unknown) => {
        const next = validatePickStatOrder(value);
        const result = queue.then(async () => {
            const current = await read();
            if (JSON.stringify(current) === JSON.stringify(next)) return next;
            await fs.mkdir(path.join(directory, "history"), { recursive: true });
            if (current) await fs.copyFile(file, path.join(directory, "history", `${Date.now()}-${randomUUID()}.json`));
            const temporary = `${file}.${randomUUID()}.next`;
            await fs.writeFile(temporary, JSON.stringify(next, null, 2) + "\n");
            await fs.rename(temporary, file);
            return next;
        });
        queue = result.catch(() => undefined);
        return result;
    };
    return { read, write };
}

export function pickStatOrderProfilePlugin(env: Record<string, string | undefined>): Plugin {
    const store = createPickStatStore(path.resolve(resolvePickOrderDirectory(env), "../pick-stat-order"));
    return {
        name: "hoc-local-pick-stat-order",
        apply: "serve",
        configureServer(server) {
            server.middlewares.use(PICK_STAT_ORDER_ENDPOINT, async (request, response) => {
                response.setHeader("Content-Type", "application/json");
                response.setHeader("Cache-Control", "no-store");
                try {
                    if (request.method === "GET") {
                        response.end(JSON.stringify(await store.read()));
                        return;
                    }
                    if (request.method !== "PUT") {
                        response.statusCode = 405;
                        response.end("{}");
                        return;
                    }
                    if (
                        !request.headers.origin ||
                        new URL(request.headers.origin).host !== request.headers.host ||
                        !request.headers["content-type"]?.startsWith("application/json")
                    ) {
                        response.statusCode = 403;
                        response.end("{}");
                        return;
                    }
                    let body = "";
                    for await (const chunk of request) {
                        body += chunk;
                        if (body.length > 2048) {
                            response.statusCode = 413;
                            response.end("{}");
                            return;
                        }
                    }
                    let order: PickStatId[];
                    try {
                        order = validatePickStatOrder(JSON.parse(body));
                    } catch {
                        response.statusCode = 400;
                        response.end("{}");
                        return;
                    }
                    response.end(JSON.stringify(await store.write(order)));
                } catch (error) {
                    server.config.logger.error(`Stat order: ${String(error)}`);
                    response.statusCode = 500;
                    response.end(JSON.stringify({ error: "Unable to load or save stat order" }));
                }
            });
        },
    };
}
