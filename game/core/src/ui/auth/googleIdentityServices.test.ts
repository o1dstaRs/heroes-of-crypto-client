import { beforeEach, describe, expect, test } from "bun:test";

import {
    type GoogleButtonConfiguration,
    type GoogleCredentialResponse,
    type GoogleIdentityApi,
    renderGoogleIdentityButton,
    resetGoogleIdentityServicesForTests,
} from "./googleIdentityServices";

const parent = (): HTMLElement =>
    ({
        replaceChildren: () => undefined,
    }) as unknown as HTMLElement;

describe("Google Identity Services button contract", () => {
    beforeEach(() => resetGoogleIdentityServicesForTests());

    test("initializes once and routes credentials by the button state", () => {
        let googleCallback: ((response: GoogleCredentialResponse) => void) | undefined;
        const rendered: GoogleButtonConfiguration[] = [];
        const api: GoogleIdentityApi = {
            initialize: (configuration) => {
                googleCallback = configuration.callback;
                expect(configuration.client_id).toBe("client-id");
                expect(configuration.auto_select).toBe(false);
            },
            renderButton: (_element, configuration) => rendered.push(configuration),
        };
        const loginCredentials: string[] = [];
        const linkCredentials: string[] = [];

        const disposeLogin = renderGoogleIdentityButton(api, parent(), {
            clientId: "client-id",
            state: "login-button",
            action: "login",
            width: 350,
            onCredential: (credential) => loginCredentials.push(credential),
        });
        renderGoogleIdentityButton(api, parent(), {
            clientId: "client-id",
            state: "link-button",
            action: "link",
            width: 999,
            onCredential: (credential) => linkCredentials.push(credential),
        });
        renderGoogleIdentityButton(api, parent(), {
            clientId: "client-id",
            state: "signup-button",
            action: "signup",
            width: 100,
            onCredential: () => undefined,
        });

        expect(rendered.map(({ text, width }) => [text, width])).toEqual([
            ["signin_with", 350],
            ["continue_with", 400],
            ["signup_with", 200],
        ]);
        googleCallback?.({ credential: "login-token", state: "login-button" });
        googleCallback?.({ credential: "link-token", state: "link-button" });
        expect(loginCredentials).toEqual(["login-token"]);
        expect(linkCredentials).toEqual(["link-token"]);

        disposeLogin();
        googleCallback?.({ credential: "ignored", state: "login-button" });
        expect(loginCredentials).toEqual(["login-token"]);
    });

    test("rejects missing or conflicting client IDs", () => {
        const api: GoogleIdentityApi = {
            initialize: () => undefined,
            renderButton: () => undefined,
        };
        const options = {
            state: "button",
            action: "login" as const,
            width: 320,
            onCredential: () => undefined,
        };
        expect(() => renderGoogleIdentityButton(api, parent(), { ...options, clientId: "" })).toThrow("not configured");
        renderGoogleIdentityButton(api, parent(), { ...options, clientId: "client-a" });
        expect(() =>
            renderGoogleIdentityButton(api, parent(), { ...options, state: "other", clientId: "client-b" }),
        ).toThrow("different client ID");
    });
});
