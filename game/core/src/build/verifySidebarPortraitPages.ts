import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import catalog from "../ui/sidebarPortraitPages.json";

type ExpectedPage = { key: string; bytes: number; sha256: string };

/** build:skip must also reject incomplete/stale page installs rather than silently loading whole sheets. */
export async function verifySidebarPortraitPages(
    directory: string,
    pages: readonly ExpectedPage[] = Object.values(catalog.animations).flatMap((animation) => animation.pages),
): Promise<void> {
    if (!pages.length) throw new Error("Sidebar portrait page catalog is empty");
    let next = 0;
    await Promise.all(
        Array.from({ length: 4 }, async () => {
            while (next < pages.length) {
                const page = pages[next++];
                const bytes = await readFile(path.join(directory, `${page.key}.webp`)).catch(() => undefined);
                if (
                    !bytes ||
                    bytes.length !== page.bytes ||
                    createHash("sha256").update(bytes).digest("hex") !== page.sha256
                ) {
                    throw new Error(
                        `Missing or stale sidebar portrait page: ${page.key}; restore the pinned Drive assets`,
                    );
                }
            }
        }),
    );
}
