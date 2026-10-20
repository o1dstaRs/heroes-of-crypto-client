import { CreatureLevelList, Doctrine, getVisibleDraftBans, LIVE_PICK_PHASES } from "@heroesofcrypto/common";
import { afterEach, expect, mock, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server.node";

import { setLanguage } from "../../i18n/i18n";
import { UNIT_ID_TO_NAME } from "../unit_ui_constants";

mock.module("../CreaturePortraitImage", () => ({ CreaturePortraitImage: () => null }));
const { DraftBanSummary } = await import("./DraftBanSummary");
const bans = [1, 2, 3, 4].map((level) => CreatureLevelList[level][0]);
const levels = LIVE_PICK_PHASES.map(({ creatureLevel }) => creatureLevel);
const render = (ids: number[]) => renderToStaticMarkup(<DraftBanSummary banned={ids} />);
afterEach(() => setLanguage("en"));

test("Scout and Spymaster can inspect bans from every level before any creature pick", () => {
    for (const doctrine of [Doctrine.Doctrine.THREE_REVEALS, Doctrine.Doctrine.SEE_ALL]) {
        const html = render(getVisibleDraftBans(bans, levels, 0, doctrine));
        expect(html).toContain("Banned creatures");
        for (const id of bans) expect(html).toContain(UNIT_ID_TO_NAME[id]);
        for (const level of [1, 2, 3, 4]) expect(html).toContain(`Level ${level}`);
    }
});

test("Battle Trance renders only known bans, with no future identities or future-level headers", () => {
    const html = render(getVisibleDraftBans(bans, levels, 2, Doctrine.Doctrine.SEE_NONE));
    expect(html).toContain(UNIT_ID_TO_NAME[bans[0]]);
    expect(html).toContain("Level 1");
    for (const id of bans.slice(1)) expect(html).not.toContain(UNIT_ID_TO_NAME[id]);
    for (const level of [2, 3, 4]) expect(html).not.toContain(`Level ${level}`);
});

test("an unopened draft explains when bans will arrive and deduplicates authoritative entries", () => {
    expect(render([])).toContain("Bans are revealed when each creature level opens.");
    expect(render([])).not.toContain("Level 4");
    const html = render([bans[0], bans[0], 0, 9999]);
    expect(html.match(new RegExp(UNIT_ID_TO_NAME[bans[0]], "g"))).toHaveLength(1);
    expect(html).not.toContain("9999");
});

test("the ban summary has Russian labels and explanatory copy", () => {
    setLanguage("ru");
    expect(render([])).toContain("Баны открываются по мере появления выбора каждого уровня существ.");
    const html = render(bans);
    expect(html).toContain("Показаны только уже раскрытые баны.");
    expect(html).not.toContain("Only revealed bans");
});
