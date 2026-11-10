import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { Container, DOMAdapter, Sprite, Texture } from "pixi.js";
import { images } from "../imageAssets";
import type { TextureLoadOptions } from "../pixi/boardFirstTextureLoads";
import { resolveCreaturePortraitVisual } from "../ui/creaturePortraitVisual";
import { UNIT_NAME_TO_ID } from "../ui/unit_ui_constants";
import { UnitChip } from "./UnitChip";
import { isVisibleThroughAncestor, UnitsOverlay } from "./UnitsOverlay";

const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));
const overlays: UnitsOverlay[] = [];
afterEach(() => overlays.splice(0).forEach((overlay) => overlay.destroy()));
const urlToKey = new Map(Object.entries(images).map(([key, url]) => [url, key]));
type Internals = {
    allChips: UnitChip[];
    chipLevels: Map<UnitChip, number>;
    rowsContainer: Container;
    selectedLevel: number;
    levelTabs: { level: number; cont: Container }[];
    setSelectedLevel(level: number): void;
};
const parts = (chip: UnitChip) => chip as unknown as { sprite: Sprite; portraitBackground?: Sprite };
function fixture() {
    const ready = new Set<string>();
    const requests: { key: string; options?: TextureLoadOptions }[] = [];
    const selected: (string | null)[] = [];
    const overlay = new UnitsOverlay(
        {
            renderer: { width: 1600, height: 900 },
            stage: new Container(),
            ticker: { add: () => {}, remove: () => {} },
        } as unknown as ConstructorParameters<typeof UnitsOverlay>[0],
        (key, options) => {
            requests.push({ key, options });
            return ready.has(key) ? Texture.WHITE : undefined;
        },
        (unit) => selected.push(unit?.name ?? null),
    );
    overlays.push(overlay);
    overlay.build();
    const state = overlay as unknown as Internals;
    const finishRequested = () => requests.forEach(({ key }) => ready.add(key));
    const foregroundReady = () => {
        finishRequested();
        overlay.refreshLazyTextures();
    };
    const warmAll = () => {
        for (let i = 0; i < 40; i++) foregroundReady();
    };
    const visible = () => state.allChips.filter((chip) => isVisibleThroughAncestor(chip, state.rowsContainer));
    const portraitKeys = (level?: number) =>
        state.allChips
            .filter((chip) => level === undefined || state.chipLevels.get(chip) === level)
            .map((chip) => {
                const visual = resolveCreaturePortraitVisual(UNIT_NAME_TO_ID[chip.nameKey])!;
                return urlToKey.get(visual.source)!;
            });
    return { overlay, state, ready, requests, selected, foregroundReady, warmAll, visible, portraitKeys };
}

test("warms two static portraits at a time after the visible row is ready", () => {
    const f = fixture();
    const firstRowKeys = new Set(f.requests.map(({ key }) => key));
    expect(f.requests.some(({ key }) => key === "black_dragon_portrait_full")).toBe(false);
    f.foregroundReady();
    const queued = f.requests.filter(({ key }) => !firstRowKeys.has(key));
    expect(new Set(queued.map(({ key }) => key)).size).toBe(2);
    expect(queued.every(({ key, options }) => f.portraitKeys().includes(key) && !options?.priority)).toBe(true);
    f.warmAll();
    expect(f.portraitKeys().every((key) => f.ready.has(key))).toBe(true);
});

test("a cold level keeps the complete current row until its final portrait arrives", () => {
    const f = fixture();
    f.foregroundReady();
    const firstRow = f.visible();
    expect(firstRow.every((chip) => parts(chip).sprite.visible)).toBe(true);
    f.state.setSelectedLevel(4);
    expect(f.state.selectedLevel).toBe(1);
    expect(f.visible()).toEqual(firstRow);
    for (const key of f.portraitKeys(4)) if (key !== "black_dragon_portrait_full") f.ready.add(key);
    f.overlay.refreshLazyTextures();
    expect(f.state.selectedLevel).toBe(1);
    f.ready.add("black_dragon_portrait_full");
    f.overlay.refreshLazyTextures();
    expect(f.state.selectedLevel).toBe(4);
    expect(f.visible().every((chip) => parts(chip).sprite.visible && parts(chip).portraitBackground?.visible)).toBe(
        true,
    );
});

test("cached level changes reuse the same chips and their ready texture layers immediately", () => {
    const f = fixture();
    f.warmAll();
    const chips = [...f.state.allChips];
    const textures = chips.map((chip) => parts(chip).sprite.texture);
    for (const level of [2, 3, 4, 1, 3, 2, 4, 1]) {
        f.state.setSelectedLevel(level);
        expect(f.state.selectedLevel).toBe(level);
        expect(f.visible().every((chip) => parts(chip).sprite.visible && parts(chip).portraitBackground?.visible)).toBe(
            true,
        );
        expect(f.state.allChips).toEqual(chips);
        expect(chips.map((chip) => parts(chip).sprite.texture)).toEqual(textures);
    }
});

test("a later tab request wins when an older level finishes in the meantime", () => {
    const f = fixture();
    f.foregroundReady();
    f.state.setSelectedLevel(4);
    f.state.setSelectedLevel(3);
    f.portraitKeys(4).forEach((key) => f.ready.add(key));
    f.overlay.refreshLazyTextures();
    expect(f.state.selectedLevel).toBe(1);
    f.portraitKeys(3).forEach((key) => f.ready.add(key));
    f.overlay.refreshLazyTextures();
    expect(f.state.selectedLevel).toBe(3);
});

test("choosing a visible creature cancels a pending row switch", () => {
    const f = fixture();
    f.foregroundReady();
    f.state.setSelectedLevel(4);
    f.overlay.selectCreatureByName("Peasant");
    f.portraitKeys(4).forEach((key) => f.ready.add(key));
    f.overlay.refreshLazyTextures();
    expect(f.state.selectedLevel).toBe(1);
    expect(f.selected.at(-1)).toBe("Peasant");
});

test("a cached chip stays ready even if the resolver temporarily has no texture entry", () => {
    const f = fixture();
    f.warmAll();
    f.ready.clear();
    f.state.setSelectedLevel(3);
    expect(f.state.selectedLevel).toBe(3);
    expect(f.visible().every((chip) => parts(chip).sprite.visible && parts(chip).portraitBackground?.visible)).toBe(
        true,
    );
});

test("clicking the current tab cancels a cold request instead of switching later", () => {
    const f = fixture();
    f.foregroundReady();
    f.state.setSelectedLevel(4);
    const current = f.state.levelTabs.find((tab) => tab.level === 1)!.cont.toGlobal({ x: 0, y: 0 });
    // Native canvas text metrics are irrelevant to this pointer-routing regression.
    for (const tab of f.state.levelTabs) {
        const center = tab.cont.toGlobal({ x: 0, y: 0 });
        Object.assign(tab.cont, { getBounds: () => ({ x: center.x - 1, y: center.y - 1, width: 2, height: 2 }) });
    }
    expect(f.overlay.handlePointerDown(current.x, current.y)).toBe(true);
    f.portraitKeys(4).forEach((key) => f.ready.add(key));
    f.overlay.refreshLazyTextures();
    expect(f.state.selectedLevel).toBe(1);
});

test("a hidden roster does not queue more background portraits after an in-flight pair finishes", () => {
    const f = fixture();
    f.foregroundReady();
    f.overlay.setVisible(false);
    const requests = f.requests.length;
    f.requests.forEach(({ key }) => f.ready.add(key));
    f.overlay.refreshLazyTextures();
    expect(f.requests).toHaveLength(requests);
    f.overlay.setVisible(true);
    expect(f.requests.length).toBeGreaterThan(requests);
});
