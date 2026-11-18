import { expect, test } from "bun:test";
import { observeViewportActivity } from "./viewport-activity";

const fixture = () => {
    const listeners = new Set<() => void>();
    const doc = {
        hidden: false,
        addEventListener: (_type: string, callback: () => void) => {
            listeners.add(callback);
        },
        removeEventListener: (_type: string, callback: () => void) => {
            listeners.delete(callback);
        },
    };
    let intersection: (entries: { isIntersecting: boolean }[]) => void;
    let disconnected = false;
    class Observer {
        constructor(callback: typeof intersection) {
            intersection = callback;
        }
        observe() {}
        disconnect() {
            disconnected = true;
        }
    }
    const changes: boolean[] = [];
    const stop = observeViewportActivity(
        {} as Element,
        true,
        (active) => changes.push(active),
        doc,
        Observer as unknown as typeof IntersectionObserver,
    );
    return {
        doc,
        changes,
        stop,
        listeners,
        disconnected: () => disconnected,
        intersect: (visible: boolean) => intersection([{ isIntersecting: visible }]),
        notify: () => listeners.forEach((callback) => callback()),
    };
};

test("offscreen widgets start only on approach, pause on leave, and resume without duplicate notifications", () => {
    const f = fixture();
    expect(f.changes).toEqual([false]);
    f.intersect(true);
    f.intersect(true);
    f.intersect(false);
    f.intersect(true);
    expect(f.changes).toEqual([false, true, false, true]);
    f.stop();
    expect(f.disconnected()).toBe(true);
    expect(f.listeners.size).toBe(0);
    f.intersect(false);
    expect(f.changes).toEqual([false, true, false, true]);
});

test("a hidden tab cannot activate or keep polling an on-screen widget", () => {
    const f = fixture();
    f.doc.hidden = true;
    f.notify();
    f.intersect(true);
    expect(f.changes).toEqual([false]);
    f.doc.hidden = false;
    f.notify();
    expect(f.changes).toEqual([false, true]);
    f.doc.hidden = true;
    f.notify();
    expect(f.changes).toEqual([false, true, false]);
    f.stop();
});

test("primary widgets and browsers without intersection observers still load immediately", () => {
    const doc = { hidden: false, addEventListener() {}, removeEventListener() {} };
    const changes: boolean[] = [];
    const stop = observeViewportActivity({} as Element, false, (active) => changes.push(active), doc);
    expect(changes).toEqual([true]);
    stop();
    const fallback: boolean[] = [];
    observeViewportActivity(
        {} as Element,
        true,
        (active) => fallback.push(active),
        doc,
        null as unknown as typeof IntersectionObserver,
    )();
    expect(fallback).toEqual([true]);
});
