import type { Plugin } from "vite";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

export const PICK_ORDER_ENDPOINT = "/__hoc-dev/pick-card-order";
const STORAGE_KEY = "hoc.pick-preview.card-order.v1";
type Orders = Partial<Record<number, number[]>>;

export function validatePickOrders(value: unknown, complete = false): Orders {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid card order");
    const orders: Orders = {};
    for (const [key, ids] of Object.entries(value)) {
        const level = Number(key);
        if (
            !/^[1-4]$/.test(key) ||
            !Array.isArray(ids) ||
            ids.length !== (level < 3 ? 16 : 12) ||
            ids.some((id) => !Number.isSafeInteger(id) || id <= 0) ||
            new Set(ids).size !== ids.length
        ) {
            throw new Error("Invalid level order");
        }
        orders[level] = [...ids];
    }
    if (complete && Object.keys(orders).length !== 4) throw new Error("All four levels are required");
    return orders;
}

export function resolvePickOrderDirectory(env: Record<string, string | undefined>): string {
    return env.HOC_IMAGES_LOC
        ? path.resolve(env.HOC_IMAGES_LOC, "../config/pick-card-order")
        : fileURLToPath(new URL("../../../../heroesofcrypto-assets/config/pick-card-order", import.meta.url));
}

export function createPickOrderStore(directory: string) {
    const file = path.join(directory, "settings.json");
    let queue: Promise<unknown> = Promise.resolve();
    const read = async (): Promise<Orders | null> => {
        try {
            return validatePickOrders(JSON.parse(await fs.readFile(file, "utf8")));
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
            throw error;
        }
    };
    const update = (operation: (current: Orders | null) => Orders) => {
        const result = queue.then(async () => {
            const current = await read();
            const next = validatePickOrders(operation(current));
            if (JSON.stringify(current) === JSON.stringify(next)) return next;
            await fs.mkdir(path.join(directory, "history"), { recursive: true });
            if (current !== null)
                await fs.copyFile(file, path.join(directory, "history", `${Date.now()}-${randomUUID()}.json`));
            const temporary = `${file}.${randomUUID()}.next`;
            await fs.writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`);
            await fs.rename(temporary, file);
            return next;
        });
        queue = result.catch(() => undefined);
        return result;
    };
    return { read, update };
}

export function pickOrderBootstrapScript(): string {
    // Import the user's existing four-level layout once. Never let an empty/stale browser replace a saved profile.
    return `globalThis.__HOC_PICK_ORDER_READY__=(async()=>{
      const endpoint=${JSON.stringify(PICK_ORDER_ENDPOINT)};
      const read=async(response)=>{if(!response.ok)throw new Error('Card order save failed');return response.json()};
      let orders=await read(await fetch(endpoint,{cache:'no-store'}));
      if(orders===null){
        let stored;try{stored=JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)})||'null')}catch{}
        if(stored&&[1,2,3,4].every(level=>Array.isArray(stored[level])&&stored[level].length===(level<3?16:12))){
          orders=await read(await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(stored)}));
        }
      }
      return orders;
    })();globalThis.__HOC_PICK_ORDER_READY__.catch(()=>{});`;
}

export function pickCardOrderProfilePlugin(directory: string): Plugin {
    const store = createPickOrderStore(directory);
    return {
        name: "hoc-local-pick-card-order",
        apply: "serve",
        transformIndexHtml() {
            return [{ tag: "script", injectTo: "head-prepend", children: pickOrderBootstrapScript() }];
        },
        configureServer(server) {
            server.middlewares.use(PICK_ORDER_ENDPOINT, async (request, response) => {
                response.setHeader("Content-Type", "application/json");
                response.setHeader("Cache-Control", "no-store");
                try {
                    if (request.method === "GET") {
                        response.end(JSON.stringify(await store.read()));
                        return;
                    }
                    if (request.method !== "POST" && request.method !== "PATCH") {
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
                        if (body.length > 8192) {
                            response.statusCode = 413;
                            response.end("{}");
                            return;
                        }
                    }
                    const input = JSON.parse(body);
                    if (request.method === "POST") {
                        const imported = validatePickOrders(input, true);
                        response.end(JSON.stringify(await store.update((current) => current ?? imported)));
                    } else {
                        const level = input?.level;
                        if (![1, 2, 3, 4].includes(level)) throw new Error("Invalid level");
                        if (input.order !== null) validatePickOrders({ [level]: input.order });
                        response.end(
                            JSON.stringify(
                                await store.update((current) => {
                                    const next = { ...current };
                                    if (input.order === null) delete next[level];
                                    else next[level] = input.order;
                                    return next;
                                }),
                            ),
                        );
                    }
                } catch (error) {
                    server.config.logger.error(`Pick card order: ${String(error)}`);
                    response.statusCode = 500;
                    response.end(JSON.stringify({ error: "Unable to load or save the local card order" }));
                }
            });
        },
    };
}
