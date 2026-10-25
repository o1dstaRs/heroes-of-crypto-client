import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { Doctrine, GridVals } from "@heroesofcrypto/common";
import { afterEach, expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server.node";

import { getLanguage, setLanguage, t } from "../../i18n/i18n";
import { getDoctrineCopy } from "../doctrineCopy";
import { getMapDisplay } from "./mapDisplay";
import { MapBadge, StartingMapPreview } from "./MapReveal";

const language = getLanguage();
afterEach(() => setLanguage(language));
const render = (node: React.ReactNode): string =>
    renderToStaticMarkup(<CacheProvider value={createCache({ key: "starting-map" })}>{node}</CacheProvider>);

test("starting map preview shows the real terrain image, name and description in both languages", () => {
    for (const lang of ["en", "ru"]) {
        setLanguage(lang);
        for (const mapType of [GridVals.NORMAL, GridVals.BLOCK_CENTER, GridVals.LAVA_CENTER]) {
            const display = getMapDisplay(mapType)!;
            const html = render(<StartingMapPreview mapType={mapType} />);
            expect(html).toContain('data-testid="starting-map-preview"');
            expect(html).toContain("<img");
            expect(html).toContain(t(display.name));
            expect(html).toContain(t(display.blurb));
            expect(html).toContain(t("Spymaster"));
            expect(html).not.toContain("<button");
            expect(html).not.toContain('role="dialog"');
        }
        const copy = t(getDoctrineCopy(Doctrine.Doctrine.SEE_ALL)!.detail);
        expect(copy).toContain(
            lang === "en"
                ? "The map is revealed with your starting bundle choices"
                : "Карта открывается вместе с вариантами стартового бандла",
        );
    }
});

test("without an authorized map there is no terrain preview, image or name to inspect", () => {
    for (const mapType of [0, -1, 999]) {
        expect(render(<StartingMapPreview mapType={mapType} />)).toBe("");
        const badge = render(<MapBadge mapType={mapType} />);
        expect(badge).toContain("?");
        expect(badge).not.toContain("<img");
    }
});
