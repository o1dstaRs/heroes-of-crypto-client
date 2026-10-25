import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "vite";
import { streamedImageAssets } from "./streamedImageAssets";

test("a real Vite build publishes exact image bytes with revisioned URLs under its base", async () => {
    const temporary = path.resolve(import.meta.dir, "../../tmp");
    await mkdir(temporary, { recursive: true });
    const root = await mkdtemp(path.join(temporary, "streamed-assets-"));
    try {
        await mkdir(path.join(root, "src/generated"), { recursive: true });
        await mkdir(path.join(root, "images"));
        await writeFile(path.join(root, "index.html"), '<script type="module" src="/src/main.ts"></script>');
        await writeFile(
            path.join(root, "src/main.ts"),
            'import { images } from "./generated/image_imports"; document.body.dataset.image = images.unit;',
        );
        await writeFile(
            path.join(root, "src/generated/image_imports.ts"),
            'export const images = {unit: new URL("../../images/unit_atlas.webp?v=old", import.meta.url).toString()};',
        );
        const revisions: string[] = [];
        for (const bytes of [Buffer.from("first approved image"), Buffer.from("revised approved image")]) {
            await writeFile(path.join(root, "images/unit_atlas.webp"), bytes);
            await build({
                configFile: false,
                root,
                base: "/game/",
                plugins: [streamedImageAssets(root)],
                build: { outDir: "dist", minify: false },
                logLevel: "silent",
            });
            const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
            const filename = `unit_atlas-${hash}.webp`;
            expect(await readFile(path.join(root, "dist/assets", filename))).toEqual(bytes);
            const scripts = (await readdir(path.join(root, "dist/assets"))).filter((name) => name.endsWith(".js"));
            expect(await readFile(path.join(root, "dist/assets", scripts[0]), "utf8")).toContain(
                `/game/assets/${filename}`,
            );
            revisions.push(filename);
        }
        expect(revisions[0]).not.toBe(revisions[1]);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
