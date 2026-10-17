import { expect, mock, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server.node";

import type { ExitMatchDialogProps } from "./exitRules/ExitMatchDialog";

let kind = { casual: false, vsAi: false, conduct: { calibrating: false, rules: { enforced: true, enforceAtMs: 123 } } };
const dialogs: ExitMatchDialogProps[] = [];
let guardEnabled: boolean | undefined;
mock.module("./auth/context/auth_context", () => ({ useAuthContext: () => ({}) }));
mock.module("react-router", () => ({ useNavigate: () => () => {} }));
mock.module("./exitRules/useDraftConduct", () => ({ useDraftConduct: () => kind }));
mock.module("./exitRules/useLeaveGuard", () => ({
    useLeaveGuard: (enabled: boolean) => {
        guardEnabled = enabled;
    },
}));
mock.module("./GameCornerExit", () => ({
    GameCornerExitButton: ({ label }: { label: string }) => <button aria-label={label} />,
}));
mock.module("./exitRules/ExitMatchDialog", () => ({
    ExitMatchDialog: (current: ExitMatchDialogProps) => {
        dialogs.push(current);
        return null;
    },
}));
const { PickExitFightControl } = await import("./PickExitFightControl");

test.each([
    { casual: false, vsAi: false, calibrating: false, expected: "abandon" },
    { casual: false, vsAi: false, calibrating: true, expected: "unscored" },
    { casual: true, vsAi: false, calibrating: false, expected: "casual" },
    { casual: true, vsAi: true, calibrating: false, expected: "casual" },
])("draft exit preserves $expected rules (AI=$vsAi)", ({ casual, vsAi, calibrating, expected }) => {
    kind = { casual, vsAi, conduct: { calibrating, rules: { enforced: true, enforceAtMs: 123 } } };
    dialogs.length = 0;
    const html = renderToStaticMarkup(<PickExitFightControl gameId="match" />);
    const props = dialogs.at(-1);
    expect(html).toContain('aria-label="Exit fight"');
    expect(props?.outcome).toBe(expected);
    expect(props?.phase).toBe("draft");
    expect(props?.rules).toEqual({ ranked: !casual, enforced: true, enforceAtMs: 123 });
    expect(props?.vsAi).toBe(vsAi);
    expect(guardEnabled).toBe(!casual);
});
