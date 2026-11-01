import { afterEach, expect, test } from "bun:test";
import { initPremiumAi } from "./premium-ai-panel";

class Element {
    hidden = true;
    disabled = false;
    value = "";
    textContent = "";
    innerHTML = "";
    title = "";
    className = "";
    children: Element[] = [];
    nodes = new Map<string, Element>();
    events = new Map<string, (event: { preventDefault(): void }) => void>();
    querySelector(selector: string): Element {
        if (!this.nodes.has(selector)) this.nodes.set(selector, new Element());
        return this.nodes.get(selector)!;
    }
    querySelectorAll() {
        return [];
    }
    addEventListener(name: string, callback: (event: { preventDefault(): void }) => void) {
        this.events.set(name, callback);
    }
    setAttribute() {}
    replaceChildren() {
        this.children = [];
    }
    append(child: Element) {
        this.children.push(child);
    }
    focus() {}
}
const saved = ["document", "window", "localStorage", "fetch"].map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
);
afterEach(() => {
    for (const [key, descriptor] of saved) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
});
function fixture() {
    const token = "Bearer x." + btoa(JSON.stringify({ exp: Date.now() / 1000 + 3600 })) + ".x";
    Object.defineProperties(globalThis, {
        document: { configurable: true, value: { createElement: () => new Element() } },
        window: { configurable: true, value: { addEventListener() {} } },
        localStorage: { configurable: true, value: { getItem: () => token, removeItem() {} } },
    });
    const root = new Element();
    const panel = root.querySelector("[data-premium-ai]");
    let accessLost = 0;
    const ai = initPremiumAi(root as unknown as HTMLElement, "en", () => accessLost++);
    const submit = () => {
        panel.querySelector("[data-ai-question]").value = "Explain Blacksmith";
        panel.querySelector("[data-ai-form]").events.get("submit")!({ preventDefault() {} });
    };
    return { panel, ai, submit, accessLost: () => accessLost };
}
async function settled() {
    for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}
test("eligible accounts can see and submit Premium AI with no statistics snapshot", async () => {
    const { panel, ai, submit } = fixture();
    let body: Record<string, unknown> | undefined;
    globalThis.fetch = (async (_url, init) => {
        body = JSON.parse(init!.body as string);
        return new Response(
            'event: meta\ndata: {"mode":"premium","context":"general","evidenceAvailable":false}\n\nevent: done\ndata: {"answer":"Failed enchants preserve existing bonuses.","sources":[]}\n\n',
        );
    }) as typeof fetch;
    ai.setAccess(true, undefined, "Game rules and strategy");
    expect(panel.hidden).toBe(false);
    expect(panel.querySelector("[data-ai-submit]").disabled).toBe(false);
    submit();
    await settled();
    expect(body).toMatchObject({ mode: "premium", question: "Explain Blacksmith" });
    expect(body).not.toHaveProperty("library");
    expect(
        panel.querySelector("[data-ai-transcript]").children[0].querySelector(".premium-ai-answer").innerHTML,
    ).toContain("Failed enchants");
    expect(panel.querySelector("[data-ai-status]").textContent).toContain("Answer ready");
});
test("revoking access aborts requests and clears conversation even without a snapshot", async () => {
    const { panel, ai, submit } = fixture();
    let signal: AbortSignal | undefined;
    globalThis.fetch = ((_url, init) => {
        signal = init!.signal as AbortSignal;
        return new Promise((_resolve, reject) => signal!.addEventListener("abort", () => reject(new Error("Aborted"))));
    }) as typeof fetch;
    ai.setAccess(true);
    submit();
    expect(signal?.aborted).toBe(false);
    ai.setAccess(false);
    await settled();
    expect(signal?.aborted).toBe(true);
    expect(panel.hidden).toBe(true);
    expect(panel.querySelector("[data-ai-submit]").disabled).toBe(true);
    expect(panel.querySelector("[data-ai-transcript]").children).toEqual([]);
    submit();
    expect(panel.querySelector("[data-ai-transcript]").children).toEqual([]);
});
test("server access rejection returns to the account gate", async () => {
    const { panel, ai, submit, accessLost } = fixture();
    globalThis.fetch = (async () => new Response("{}", { status: 403 })) as typeof fetch;
    ai.setAccess(true);
    submit();
    await settled();
    expect(accessLost()).toBe(1);
    expect(panel.querySelector("[data-ai-transcript]").children).toEqual([]);
});
