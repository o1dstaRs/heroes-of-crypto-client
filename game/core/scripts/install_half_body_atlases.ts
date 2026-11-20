import { createHash } from "node:crypto";
import { constants, copyFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";

import halfBodyAtlases from "../src/pixi/halfBodyAtlases.json";
import q93Atlases from "../src/pixi/q93Atlases.json";

/** Every derived release copy, keyed by the master it replaces in the flattened images directory. */
export const releaseAtlasCopies: Readonly<Record<string, { releasePath: string; sha256: string }>> = {
    ...q93Atlases.atlases,
    ...halfBodyAtlases.atlases,
};

/**
 * Put each pinned release copy — half-size body atlases (src/build/halfBodyAtlases.ts) and full-size Q93
 * atlases (src/build/q93Atlases.ts) — in place of its lossless master in a flattened images directory. Both the atlas copy step and the approved level-one package install
 * masters into that directory, so both finish by calling this.
 *
 * A missing half-size file leaves the master: the runtime halves it in the browser, so an older art
 * checkout still renders correctly and only downloads more. A file that exists but does not match its pin
 * is never shipped.
 */
export function installHalfBodyAtlases(
    imagesDir: string,
    animationsOutputDir: string,
    include: (key: string) => boolean = () => true,
): { installed: number; missing: string[] } {
    const sha256 = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
    let installed = 0;
    const missing: string[] = [];
    for (const [key, entry] of Object.entries(releaseAtlasCopies)) {
        if (!include(key)) continue;
        const source = path.join(animationsOutputDir, entry.releasePath.replace(/^animations\/output\//, ""));
        if (!existsSync(source)) {
            missing.push(key);
            continue;
        }
        if (sha256(source) !== entry.sha256) {
            throw new Error(`Refusing to ship ${entry.releasePath}: it does not match its pinned release copy.`);
        }
        const target = path.join(imagesDir, `${key}.webp`);
        if (existsSync(target) && sha256(target) === entry.sha256) {
            installed++;
            continue;
        }
        copyFileSync(source, target, constants.COPYFILE_FICLONE);
        installed++;
    }
    return { installed, missing };
}
