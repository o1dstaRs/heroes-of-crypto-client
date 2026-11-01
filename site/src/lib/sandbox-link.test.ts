import { expect, test } from "bun:test";
import { sandboxLinkHref } from "./sandbox-link";

test("public Sandbox links launch the game without the redirect page", () => {
    expect(sandboxLinkHref({})).toBe("https://app.heroesofcrypto.io/");
    expect(sandboxLinkHref({ sandbox: " ", host: "https://test.heroesofcrypto.io/play/" })).toBe(
        "https://test.heroesofcrypto.io/",
    );
    expect(
        sandboxLinkHref({
            sandbox: "https://beta.heroesofcrypto.io/?muted=1",
            host: "https://test.heroesofcrypto.io",
            client: "https://app.heroesofcrypto.io",
        }),
    ).toBe("https://beta.heroesofcrypto.io/?muted=1");
});

test("keeps configured paths, query and fragment while removing the ranked entry path", () => {
    expect(sandboxLinkHref({ client: "https://test.heroesofcrypto.io/client/play?vol=0.4#view=compact" })).toBe(
        "https://test.heroesofcrypto.io/client/?vol=0.4#view=compact",
    );
});

test("local development retains running-client discovery", () => {
    expect(sandboxLinkHref({ development: true, host: "http://localhost:5175/play" })).toBe("/sandbox");
});
