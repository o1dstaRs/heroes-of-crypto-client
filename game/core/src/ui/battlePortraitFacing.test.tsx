import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server.node";
import { CreatureVals, TeamVals } from "@heroesofcrypto/common";
import { CreaturePortraitImage } from "./CreaturePortraitImage";
import { battlePortraitFacingScale } from "./battlePortraitFacing";
const render = (children: React.ReactNode) =>
    renderToStaticMarkup(<CacheProvider value={createCache({ key: "battle-facing-test" })}>{children}</CacheProvider>);
for (const name of ["Wolf", "Gargantuan", "Squire", "Black Dragon", "Cyclops", "Zena", "Hydra", "Tsar Cannon"]) {
    test(`${name} follows opposite battle directions while ordinary portraits retain their framing`, () => {
        expect(battlePortraitFacingScale(name, undefined)).toBe(1);
        expect(battlePortraitFacingScale(name, 1) * battlePortraitFacingScale(name, -1)).toBe(-1);
    });
}
test("native head and muzzle directions match the reviewed card and sidebar sources", () => {
    expect(battlePortraitFacingScale("Tsar Cannon", 1)).toBe(1);
    expect(battlePortraitFacingScale("Tsar Cannon", -1)).toBe(-1);
    expect(battlePortraitFacingScale("Black Dragon", 1)).toBe(-1);
    expect(battlePortraitFacingScale("Squire", 1)).toBe(1);
    expect(battlePortraitFacingScale("Wolf Rider", 1)).toBe(-1);
});
test("only creature art is mirrored, including its animation; the faction background stays outside", () => {
    const html = render(
        <CreaturePortraitImage
            creatureId={CreatureVals.BLACK_DRAGON}
            unitId="dragon"
            unitTeam={TeamVals.RIGHT}
            renderArt={(art) => <span data-test-animation>{art}</span>}
        />,
    );
    expect(html).toContain('data-battle-portrait-facing="-1"');
    expect(html).toContain('data-battle-portrait-art-scale="1"');
    const artLayer = html.indexOf("data-battle-portrait-facing");
    expect(html.indexOf("data-creature-portrait-background=")).toBeLessThan(artLayer);
    expect(html.indexOf("data-test-animation")).toBeGreaterThan(artLayer);
    expect(render(<CreaturePortraitImage creatureId={CreatureVals.BLACK_DRAGON} />)).not.toContain(
        "data-battle-portrait-facing",
    );
});
