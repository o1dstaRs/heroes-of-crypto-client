import { describe, expect, mock, test } from "bun:test";
import { Container, Graphics, Sprite, Texture } from "pixi.js";

import { Sandbox } from "./Sandbox";
import type { RenderableUnit } from "./RenderableUnit";
import { spellBookTextureKeys } from "./spellIcons";

const BOOK = "book_1024_clean_pages_v1";
const names = ["Heal", "Spiritual Armor"];
const keys = [BOOK, ...spellBookTextureKeys(names)];
const deferred = () => {
    let resolve!: (texture: Texture | undefined) => void;
    const promise = new Promise<Texture | undefined>((done) => {
        resolve = done;
    });
    return { promise, resolve };
};

interface BookScene {
    sc_destroyed: boolean;
    sc_renderSpellBookOverlay: boolean;
    currentActiveUnit?: RenderableUnit;
    spellBookBackground?: Sprite;
    spellBookFallback?: Graphics;
    spellBookOverlay?: { isReadyFor(unit?: RenderableUnit): boolean };
    spellBookContainer: Container;
    ensureSpellBookBackground(): Promise<void>;
    releaseSpellBookBackground(): void;
    prepareSpellBookPresentation(unit: RenderableUnit): Promise<void>;
    handleSpellbookClick(point: { x: number; y: number }): void;
    closeSpellBook(): void;
}

const fixture = () => {
    const pending = new Map(keys.map((key) => [key, deferred()]));
    const build = mock(() => true);
    const unit = {
        getSpells: () => names.map((name) => ({ getName: () => name })),
        hideSpells: mock(),
        ensureSpellBookRendering: build,
        getHoveredSpell: mock(),
    } as unknown as RenderableUnit;
    const content = new Container();
    content.visible = false;
    const backdrop = new Graphics();
    content.addChild(backdrop);
    const waitForTexture = mock((key: string) => pending.get(key)?.promise ?? Promise.resolve(undefined));
    const upload = mock();
    const close = mock();
    const scene: BookScene = Object.assign(Object.create(Sandbox.prototype) as BookScene, {
        sc_destroyed: false,
        sc_renderSpellBookOverlay: true,
        currentActiveUnit: unit,
        spellBookContainer: content,
        spellBookBackdrop: backdrop,
        digitTextures: new Map(),
        setHoveredSpell: mock(),
        closeSpellBook: close,
        unitsHolder: { getAllUnits: () => new Map([["caster", unit]]) },
        pixiApp: {
            getApplication: () => ({
                screen: { width: 1680, height: 980 },
                renderer: { texture: { initSource: upload } },
            }),
        },
        waitForTexture,
    });
    return {
        scene,
        unit,
        pending,
        build,
        content,
        waitForTexture,
        upload,
        close,
        destroy: () => {
            scene.releaseSpellBookBackground();
            content.destroy({ children: true });
        },
    };
};
const flush = async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe("scene spellbook preparation", () => {
    for (const lastKey of [BOOK, "heal_256", "spell_cast_wax_seal_blank_v1"]) {
        test(`keeps the entire book hidden when ${lastKey} arrives after the other artwork`, async () => {
            const book = fixture();
            try {
                const preparing = book.scene.prepareSpellBookPresentation(book.unit);
                expect(book.waitForTexture).toHaveBeenCalledTimes(keys.length);
                for (const [key, request] of book.pending) if (key !== lastKey) request.resolve(Texture.WHITE);
                await flush();
                expect(book.build).not.toHaveBeenCalled();
                expect(book.content.visible).toBe(false);
                expect(book.unit.hideSpells).toHaveBeenCalledTimes(1);

                book.pending.get(lastKey)!.resolve(Texture.WHITE);
                await preparing;

                expect(book.build).toHaveBeenCalledTimes(1);
                expect(book.scene.spellBookBackground?.parent).toBe(book.content);
                expect(book.upload).toHaveBeenCalledTimes(keys.length);
                expect(book.content.visible).toBe(false);
                for (const [key, options] of book.waitForTexture.mock.calls as unknown as [
                    string,
                    { priority: string },
                ][]) {
                    expect(keys).toContain(key);
                    expect(options.priority).toBe("visible");
                }
            } finally {
                book.destroy();
            }
        });
    }

    test("failed artwork leaves a usable parchment fallback and can recover on the next opening", async () => {
        const book = fixture();
        try {
            const preparing = book.scene.prepareSpellBookPresentation(book.unit);
            for (const [key, request] of book.pending)
                request.resolve(key === BOOK || key === "heal_256" ? undefined : Texture.WHITE);
            await preparing;
            expect(book.build).toHaveBeenCalledTimes(1);
            const fallback = book.scene.spellBookFallback;
            expect(fallback).toBeInstanceOf(Graphics);
            expect(fallback?.parent).toBe(book.content);

            book.waitForTexture.mockImplementation(async () => Texture.WHITE);
            await book.scene.ensureSpellBookBackground();

            expect(fallback?.destroyed).toBe(true);
            expect(book.scene.spellBookFallback).toBeUndefined();
            expect(book.scene.spellBookBackground?.parent).toBe(book.content);
            await book.scene.prepareSpellBookPresentation(book.unit);
            expect(book.waitForTexture.mock.calls.filter(([key]) => key === BOOK)).toHaveLength(2);
        } finally {
            book.destroy();
        }
    });

    for (const change of ["closed", "new caster", "destroyed"] as const) {
        test(`late artwork does not rebuild a ${change} book`, async () => {
            const book = fixture();
            try {
                const preparing = book.scene.prepareSpellBookPresentation(book.unit);
                if (change === "closed") book.scene.sc_renderSpellBookOverlay = false;
                if (change === "new caster") book.scene.currentActiveUnit = undefined;
                if (change === "destroyed") {
                    book.scene.sc_destroyed = true;
                    book.scene.releaseSpellBookBackground();
                }
                for (const request of book.pending.values()) request.resolve(Texture.WHITE);
                await preparing;
                expect(book.build).not.toHaveBeenCalled();
                expect(book.upload).not.toHaveBeenCalled();
                expect(book.content.visible).toBe(false);
                if (change === "destroyed") expect(book.content.children).toHaveLength(1);
            } finally {
                book.destroy();
            }
        });
    }

    test("a loading book cannot select a stale invisible card or send a cast", () => {
        const book = fixture();
        try {
            book.scene.spellBookOverlay = { isReadyFor: () => false };
            book.scene.handleSpellbookClick({ x: 0, y: 0 });
            expect(book.close).toHaveBeenCalledTimes(1);
            expect(book.unit.getHoveredSpell).not.toHaveBeenCalled();
            expect(book.build).not.toHaveBeenCalled();
        } finally {
            book.destroy();
        }
    });
});
