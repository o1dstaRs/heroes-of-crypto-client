import { expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import Toggler from ".";

const renderToggle = ({ open }: { open: boolean }) => <button>{open ? "Close" : "Open"}</button>;

test("a deferred closed toggler does not mount its expensive children", () => {
    const html = renderToStaticMarkup(
        <Toggler defaultExpanded={false} deferChildrenUntilExpanded renderToggle={renderToggle}>
            <span>Heavy panel</span>
        </Toggler>,
    );

    expect(html).toContain("Open");
    expect(html).not.toContain("Heavy panel");
});

test("an expanded deferred toggler mounts its children immediately", () => {
    const html = renderToStaticMarkup(
        <Toggler defaultExpanded deferChildrenUntilExpanded renderToggle={renderToggle}>
            <span>Heavy panel</span>
        </Toggler>,
    );

    expect(html).toContain("Close");
    expect(html).toContain("Heavy panel");
});
