import { expect, test } from "bun:test";
import { CssVarsProvider } from "@mui/joy/styles";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server.node";

import { hocJoyTheme } from "../hocTheme";
import { MatchHistorySearchControls } from "./MatchHistorySearchControls";

const render = (loading: boolean) =>
    renderToStaticMarkup(
        <CssVarsProvider theme={hocJoyTheme}>
            <MatchHistorySearchControls
                query=""
                scope="either"
                filter="all"
                count={12}
                loading={loading}
                onQueryChange={() => {}}
                onScopeChange={() => {}}
                onFilterChange={() => {}}
            />
        </CssVarsProvider>,
    );

test("search controls expose accessible text entry, army scope, and result filters", () => {
    const html = render(false);
    expect(html).toContain('aria-label="Search match history"');
    expect(html).toContain('aria-label="Search army"');
    expect(html).toContain('aria-label="Filter match history"');
    expect(html).toContain("Either army");
    expect(html).toContain("Dual Strike Charm");
    expect(html).toContain("Combine names to narrow your search.");
    expect(html).toContain('role="status"');
    expect(html).toContain("12 matches shown");
});

test("search activity has a live announcement and keeps the controls mounted", () => {
    const html = render(true);
    expect(html).toContain("Searching match history…");
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-label="Search match history"');
    expect(html).toContain('aria-label="Filter match history"');
});
