import {
    CreatureLevelList,
    Doctrine,
    getVisibleDraftBans,
    LIVE_AUTO_BANS_BY_LEVEL,
    LIVE_PICK_PHASES,
} from "@heroesofcrypto/common";
import { afterEach, expect, mock, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server.node";

import { setLanguage } from "../../i18n/i18n";
import { UNIT_ID_TO_NAME } from "../unit_ui_constants";

mock.module("../CreaturePortraitImage", () => ({ CreaturePortraitImage: () => null }));
const { DraftBanSummary } = await import("./DraftBanSummary");
const bans = [1, 2, 3, 4].map((level) => CreatureLevelList[level][0]);
const levels = LIVE_PICK_PHASES.map(({ creatureLevel }) => creatureLevel);
const render = (ids: number[], doctrine: number = Doctrine.Doctrine.THREE_REVEALS) =>
    renderToStaticMarkup(<DraftBanSummary banned={ids} doctrine={doctrine} />);
afterEach(() => setLanguage("en"));

test("Scout and Spymaster can inspect bans from every level before any creature pick", () => {
    for (const doctrine of [Doctrine.Doctrine.THREE_REVEALS, Doctrine.Doctrine.SEE_ALL]) {
        const html = render(getVisibleDraftBans(bans, levels, 0, doctrine), doctrine);
        expect(html).toContain("Banned creatures");
        for (const id of bans) expect(html).toContain(UNIT_ID_TO_NAME[id]);
        for (const level of [1, 2, 3, 4]) expect(html).not.toContain(`Level ${level}`);
    }
});

test("Battle Trance never renders a ban summary, even after every creature level has opened", () => {
    for (let sequence = 0; sequence < levels.length; sequence++) {
        const known = getVisibleDraftBans(bans, levels, sequence, Doctrine.Doctrine.SEE_NONE);
        expect(render(known, Doctrine.Doctrine.SEE_NONE)).toBe("");
    }
    expect(render(bans, Doctrine.Doctrine.SEE_NONE)).toBe("");
});

test("missing and unknown doctrines cannot display the scouting summary", () => {
    for (const doctrine of [Doctrine.Doctrine.NO_DOCTRINE, -1, 9999]) expect(render(bans, doctrine)).toBe("");
});

test("empty or invalid ban data leaves no empty strip and valid entries are deduplicated", () => {
    expect(render([])).toBe("");
    expect(render([0, 9999])).toBe("");
    const html = render([bans[0], bans[0], 0, 9999]);
    expect(html.match(new RegExp(UNIT_ID_TO_NAME[bans[0]], "g"))).toHaveLength(1);
    expect(html).not.toContain("9999");
});

test("the ban summary retains its Russian label without level headings", () => {
    setLanguage("ru");
    const html = render(bans);
    expect(html).toContain("Забаненные существа");
    for (const level of [1, 2, 3, 4]) expect(html).not.toContain(`Уровень ${level}`);
});

test("all twenty scouting bans are visible immediately, without opening a drawer", () => {
    const complete = LIVE_AUTO_BANS_BY_LEVEL.flatMap((count, index) => CreatureLevelList[index + 1].slice(0, count));
    for (const doctrine of [Doctrine.Doctrine.THREE_REVEALS, Doctrine.Doctrine.SEE_ALL]) {
        const html = render(getVisibleDraftBans(complete, levels, 0, doctrine), doctrine);
        expect(html).toContain("<section");
        expect(html).not.toContain("<details");
        expect(html).not.toContain("<summary");
        expect(html.match(/<ul /g)).toHaveLength(1);
        expect(html.match(/<li /g)).toHaveLength(20);
        for (const id of complete) expect(html).toContain(`aria-label="${UNIT_ID_TO_NAME[id]}"`);
    }
});
