import { describe, expect, mock, test } from "bun:test";
import { Container, Sprite, Texture } from "pixi.js";

import type { RenderableUnit } from "./RenderableUnit";
import { SpellBookOverlay } from "./SpellBookOverlay";

const pending = () => {
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<void>((done, fail) => {
        resolve = done;
        reject = fail;
    });
    return { promise, resolve, reject };
};
const flush = async () => {
    for (let i = 0; i < 4; i++) await Promise.resolve();
};
const caster = () => ({ renderSpells: mock() }) as unknown as RenderableUnit;

const fixture = (revealDurationMs = 140) => {
    let now = 1000;
    const parent = new Container();
    const content = new Container();
    content.addChild(new Sprite(Texture.WHITE), new Sprite(Texture.WHITE));
    parent.addChild(content);
    const requests: ReturnType<typeof pending>[] = [];
    const prepare = mock(() => {
        const request = pending();
        requests.push(request);
        return request.promise;
    });
    const onError = mock(() => overlay.setOpen(false));
    const overlay = new SpellBookOverlay(parent, 1680, 980, {
        content,
        prepare,
        onError,
        now: () => now,
        revealDurationMs,
    });
    return {
        content,
        overlay,
        prepare,
        requests,
        onError,
        parent,
        advance: (ms: number) => {
            now += ms;
        },
        destroy: () => {
            overlay.destroy();
            parent.destroy({ children: true });
        },
    };
};

describe("spellbook presentation", () => {
    test("reveals book and cards together after preparation, with one short real-time fade", async () => {
        const book = fixture();
        const unit = caster();
        try {
            expect(book.content.visible).toBe(false);
            book.overlay.render(unit);
            expect(book.prepare).not.toHaveBeenCalled();
            book.overlay.setOpen(true);
            book.overlay.render(unit);
            book.advance(1000);
            book.overlay.render(unit);
            expect(book.prepare).toHaveBeenCalledTimes(1);
            expect(unit.renderSpells).not.toHaveBeenCalled();
            expect(book.content.visible).toBe(false);

            book.requests[0].resolve();
            await flush();
            book.overlay.render(unit);
            expect(unit.renderSpells).toHaveBeenCalledWith(1);
            expect(book.content.visible).toBe(true);
            expect(book.content.alpha).toBe(0);
            expect(book.overlay.isReadyFor(unit)).toBe(false);

            book.advance(70);
            book.overlay.render(unit);
            expect(book.content.alpha).toBeCloseTo(0.875);
            expect(book.overlay.isReadyFor(unit)).toBe(true);
            book.advance(70);
            book.overlay.render(unit);
            expect(book.content.alpha).toBe(1);
            expect(book.prepare).toHaveBeenCalledTimes(1);
            book.overlay.setOpen(false);
            expect(book.content.visible).toBe(false);
            expect(book.overlay.isReadyFor(unit)).toBe(false);
        } finally {
            book.destroy();
        }
    });

    test("a closed book never reopens when its assets arrive late", async () => {
        const book = fixture();
        const unit = caster();
        try {
            book.overlay.setOpen(true);
            book.overlay.render(unit);
            book.overlay.setOpen(false);
            book.requests[0].resolve();
            await flush();
            book.overlay.render(unit);
            expect(book.content.visible).toBe(false);
            expect(unit.renderSpells).not.toHaveBeenCalled();
        } finally {
            book.destroy();
        }
    });

    test("a fast reopen cannot be revealed by the previous opening's completion", async () => {
        const book = fixture(0);
        const unit = caster();
        try {
            book.overlay.setOpen(true);
            book.overlay.render(unit);
            book.overlay.setOpen(false);
            book.overlay.setOpen(true);
            book.overlay.render(unit);
            book.requests[0].resolve();
            await flush();
            book.overlay.render(unit);
            expect(book.content.visible).toBe(false);
            expect(unit.renderSpells).not.toHaveBeenCalled();
            book.requests[1].resolve();
            await flush();
            book.overlay.render(unit);
            expect(book.content.alpha).toBe(1);
            expect(book.overlay.isReadyFor(unit)).toBe(true);
            expect(unit.renderSpells).toHaveBeenCalledTimes(1);
        } finally {
            book.destroy();
        }
    });

    test("changing casters retires the old request without showing its cards", async () => {
        const book = fixture(0);
        const first = caster();
        const second = caster();
        try {
            book.overlay.setOpen(true);
            book.overlay.render(first);
            book.overlay.render(second);
            book.requests[0].resolve();
            await flush();
            book.overlay.render(second);
            expect(first.renderSpells).not.toHaveBeenCalled();
            expect(second.renderSpells).not.toHaveBeenCalled();
            book.requests[1].resolve();
            await flush();
            book.overlay.render(second);
            expect(book.overlay.isReadyFor(first)).toBe(false);
            expect(book.overlay.isReadyFor(second)).toBe(true);
        } finally {
            book.destroy();
        }
    });

    test("losing the active unit hides the book and invalidates a pending reveal", async () => {
        const book = fixture(0);
        const unit = caster();
        try {
            book.overlay.setOpen(true);
            book.overlay.render(unit);
            book.overlay.render(undefined);
            book.requests[0].resolve();
            await flush();
            expect(book.content.visible).toBe(false);
            expect(book.overlay.isReadyFor(unit)).toBe(false);
            expect(unit.renderSpells).not.toHaveBeenCalled();
        } finally {
            book.destroy();
        }
    });

    test("an unexpected preparation error closes the book instead of leaving input trapped", async () => {
        const book = fixture();
        const unit = caster();
        try {
            book.overlay.setOpen(true);
            book.overlay.render(unit);
            book.requests[0].reject(new Error("Preparation failed"));
            await flush();
            expect(book.onError).toHaveBeenCalledTimes(1);
            expect(book.content.visible).toBe(false);
            expect(book.overlay.isReadyFor(unit)).toBe(false);
        } finally {
            book.destroy();
        }
    });

    test("destroying the scene cancels pending presentation and removes its input blocker", async () => {
        const book = fixture();
        const unit = caster();
        book.overlay.setOpen(true);
        book.overlay.render(unit);
        book.overlay.destroy();
        book.requests[0].resolve();
        await flush();
        book.overlay.render(unit);
        expect(book.parent.children).toEqual([book.content]);
        expect(book.content.visible).toBe(false);
        expect(unit.renderSpells).not.toHaveBeenCalled();
        expect(book.onError).not.toHaveBeenCalled();
        book.destroy();
        expect(Texture.WHITE.destroyed).toBe(false);
    });
});
