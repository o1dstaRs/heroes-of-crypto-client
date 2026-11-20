import { createHash } from "node:crypto";
import { constants, copyFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";

import catalog from "../src/pixi/halfBodyAtlases.json";

/**
 * Put each pinned half-size body atlas in place of its full-size master in a flattened images directory
 * (see src/build/halfBodyAtlases.ts). Both the atlas copy step and the approved level-one package install
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
    for (const [key, entry] of Object.entries(catalog.atlases)) {
        if (!include(key)) continue;
        const source = path.join(animationsOutputDir, entry.releasePath.replace(/^animations\/output\//, ""));
        if (!existsSync(source)) {
            missing.push(key);
            continue;
        }
        if (sha256(source) !== entry.sha256) {
            throw new Error(`Refusing to ship ${entry.releasePath}: it does not match the pinned half-size copy.`);
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
