import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LoginScreen } from "./LoginScreenRuntime";
import { AuthContext } from "../auth/context/auth_context";
import type { JWTContextType } from "../auth/context/types";

describe("email account sign-in", () => {
    test("renders email login without wallet providers or a connection step", () => {
        const html = renderToStaticMarkup(
            <AuthContext.Provider value={{ user: null } as JWTContextType}>
                <LoginScreen />
            </AuthContext.Provider>,
        );

        expect(html).toContain('type="email"');
        expect(html).toContain('type="password"');
        expect(html).toContain("Sign In");
        expect(html).not.toMatch(/wallet|wagmi|rainbowkit/i);
    });

    test("unverified email accounts still receive the verification step", () => {
        const html = renderToStaticMarkup(
            <AuthContext.Provider value={{ user: { email: "player@example.com", is_active: false } } as JWTContextType}>
                <LoginScreen />
            </AuthContext.Provider>,
        );

        expect(html).toContain("player@example.com");
        expect(html).toContain("Verify");
        expect(html).not.toMatch(/wallet|wagmi|rainbowkit/i);
    });
});
