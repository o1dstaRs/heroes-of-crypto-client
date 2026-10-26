import { expect, test } from "bun:test";

import { observePremiumAdviceView } from "./usePremiumAdviceView";

const fixture = () => {
    let callback: IntersectionObserverCallback;
    let disconnected = false;
    class Observer {
        public constructor(cb: IntersectionObserverCallback) {
            callback = cb;
        }
        public observe() {}
        public disconnect() {
            disconnected = true;
        }
    }
    const document = Object.assign(new EventTarget(), {
        visibilityState: "hidden",
        defaultView: { IntersectionObserver: Observer },
    }) as unknown as Document;
    const element = { ownerDocument: document } as Element;
    return {
        document,
        element,
        enter: (visible: boolean) =>
            callback(
                [{ target: element, isIntersecting: visible } as IntersectionObserverEntry],
                {} as IntersectionObserver,
            ),
        disconnected: () => disconnected,
    };
};
const flush = async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
};

test("background fetches and offscreen panels are not counted as viewed advice", async () => {
    const f = fixture();
    let sent = 0;
    const stop = observePremiumAdviceView(f.element, async () => {
        sent++;
    });
    f.enter(true);
    await flush();
    expect(sent).toBe(0);
    f.enter(false);
    Object.defineProperty(f.document, "visibilityState", { value: "visible", configurable: true });
    f.document.dispatchEvent(new Event("visibilitychange"));
    await flush();
    expect(sent).toBe(0);
    f.enter(true);
    await flush();
    expect(sent).toBe(1);
    f.enter(true);
    f.document.dispatchEvent(new Event("visibilitychange"));
    await flush();
    expect(sent).toBe(1);
    stop();
    expect(f.disconnected()).toBe(true);
});

test("changing match or turn aborts pending measurement and removes listeners", async () => {
    const f = fixture();
    Object.defineProperty(f.document, "visibilityState", { value: "visible", configurable: true });
    let signal: AbortSignal | undefined;
    let sent = 0;
    const stop = observePremiumAdviceView(f.element, (next) => {
        signal = next;
        sent++;
        return new Promise(() => {});
    });
    f.enter(true);
    expect(sent).toBe(1);
    stop();
    expect(signal?.aborted).toBe(true);
    f.document.dispatchEvent(new Event("visibilitychange"));
    f.enter(true);
    await flush();
    expect(sent).toBe(1);
});

test("missing intersection support never invents a visible exposure", () => {
    const f = fixture();
    Object.defineProperty(f.document, "defaultView", { value: {} });
    let sent = 0;
    const stop = observePremiumAdviceView(f.element, async () => {
        sent++;
    });
    f.document.dispatchEvent(new Event("visibilitychange"));
    expect(sent).toBe(0);
    stop();
});
