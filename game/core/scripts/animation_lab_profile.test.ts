import { expect, test } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import { createServer } from "vite";
import { animationLabProfilePlugin } from "./animation_lab_profile";

test("independent profile preserves edits across restart, keeps history and rejects invalid writes", async () => {
    await fs.mkdir("tmp", { recursive: true });
    const directory = await fs.mkdtemp(path.resolve("tmp/animation-profile-test-"));
    const server = await createServer({
        configFile: false,
        root: directory,
        cacheDir: path.join(directory, "vite-cache"),
        optimizeDeps: { noDiscovery: true, include: [] },
        plugins: [animationLabProfilePlugin(directory)],
        server: { host: "127.0.0.1", port: 0 },
        logLevel: "silent",
    });
    try {
        await server.listen();
        const address = server.httpServer!.address() as { port: number };
        const url = `http://127.0.0.1:${address.port}/__hoc-dev/animation-profile`;
        const patch = (key: string, value: unknown) =>
            fetch(url, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ key, value }),
            });
        expect((await (await fetch(url)).json()).values["cyclops.impactMode"]).toBe("engine");
        await Promise.all([patch("mantis.travelSpeed", 1.8), patch("griffin.landingSpeed", 1.4)]);
        const saved = await fs.readFile(path.join(directory, "settings.json"), "utf8");
        expect(JSON.parse(saved).values["mantis.travelSpeed"]).toBe(1.8);
        expect(JSON.parse(saved).values["griffin.landingSpeed"]).toBe(1.4);
        expect((await fs.readdir(path.join(directory, "history"))).length).toBe(2);
        expect((await patch("stone.playbackRate", -1)).status).toBe(400);
        expect((await patch("__proto__", {})).status).toBe(400);
        expect(await fs.readFile(path.join(directory, "settings.json"), "utf8")).toBe(saved);
        await server.restart();
        const html = await server.transformIndexHtml("/", "<html><head></head><body></body></html>");
        expect(html).toContain('"mantis.travelSpeed":1.8');
        expect(await fs.readFile(path.join(directory, "settings.json"), "utf8")).toBe(saved);
        await fs.writeFile(path.join(directory, "settings.json"), "broken json");
        await expect(server.transformIndexHtml("/", "<html></html>")).rejects.toThrow();
        expect(await fs.readFile(path.join(directory, "settings.json"), "utf8")).toBe("broken json");
    } finally {
        await server.close();
        await fs.rm(directory, { recursive: true, force: true });
    }
});
