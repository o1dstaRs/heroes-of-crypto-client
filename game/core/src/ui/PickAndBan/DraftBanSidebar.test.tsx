import { CreatureLevelList, LIVE_AUTO_BANS_BY_LEVEL } from "@heroesofcrypto/common";
import { afterEach, expect, mock, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server.node";

import { setLanguage } from "../../i18n/i18n";
import { UNIT_ID_TO_NAME } from "../unit_ui_constants";

mock.module("../CreaturePortraitImage", () => ({ CreaturePortraitImage: () => null }));
const { DraftBanSidebar } = await import("./DraftBanSidebar");
const render = (banned: number[]) => renderToStaticMarkup(<DraftBanSidebar banned={banned} />);
afterEach(() => setLanguage("en"));

test("the right sidebar shows all twenty bans in ascending level groups", () => {
    const banned = LIVE_AUTO_BANS_BY_LEVEL.flatMap((count, index) => CreatureLevelList[index + 1].slice(0, count));
    const html = render([...banned].reverse());
    expect(html).toContain('data-placement="right"');
    expect(html.match(/<li /g)).toHaveLength(20);
    expect([...(html.match(/data-ban-level="[1-4]"/g) ?? [])]).toEqual(
        [1, 2, 3, 4].map((level) => `data-ban-level="${level}"`),
    );
    for (const id of banned) expect(html).toContain(`aria-label="${UNIT_ID_TO_NAME[id]}"`);
    expect(html).not.toContain("<details");
});

test("partial scouting never adds future-level headers, unknown identities or duplicates", () => {
    const known = CreatureLevelList[1][0];
    const html = render([known, 0, 9999, known]);
    expect(html.match(/<li /g)).toHaveLength(1);
    expect(html).toContain('aria-label="Level 1"');
    for (const level of [2, 3, 4]) expect(html).not.toContain(`data-ban-level="${level}"`);
    expect(html).not.toContain("9999");
    expect(render([])).toContain("Bans are revealed when each creature level opens.");
    expect(render([])).not.toContain("data-ban-level");
});

test("the sidebar preserves translated names and accessible level labels", () => {
    setLanguage("ru");
    const html = render([CreatureLevelList[4][0]]);
    expect(html).toContain("Забаненные существа");
    expect(html).toContain('aria-label="Уровень 4"');
});
