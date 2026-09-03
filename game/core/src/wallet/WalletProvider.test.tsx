import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AuthContext } from "../ui/auth/context/auth_context";
import type { JWTContextType } from "../ui/auth/context/types";
import { WalletProvider } from "./WalletProvider";

describe("WalletProvider", () => {
    test("does not suspend authenticated game routes behind the wallet runtime", () => {
        const html = renderToStaticMarkup(
            <AuthContext.Provider value={{ authenticated: true } as JWTContextType}>
                <WalletProvider>
                    <span>battle ready</span>
                </WalletProvider>
            </AuthContext.Provider>,
        );

        expect(html).toBe("<span>battle ready</span>");
    });
});
