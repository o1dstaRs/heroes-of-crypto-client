import { expect, test } from "bun:test";

import { shouldRenderTogglerChildren } from ".";

test("a deferred closed toggler does not mount its expensive children", () => {
    expect(shouldRenderTogglerChildren(true, false, false)).toBe(false);
});

test("an expanded deferred toggler mounts its children immediately", () => {
    expect(shouldRenderTogglerChildren(true, true, true)).toBe(true);
});

test("a deferred toggler keeps its children mounted after it closes again", () => {
    expect(shouldRenderTogglerChildren(true, false, true)).toBe(true);
});

test("a normal toggler always mounts its children", () => {
    expect(shouldRenderTogglerChildren(false, false, false)).toBe(true);
});
