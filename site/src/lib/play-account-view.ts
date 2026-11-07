import { authTokenExpiration, displayName, type AuthUser } from "./auth-state";

// These two functions are also serialized into a parser-time script. Keep their
// runtime dependencies explicit; no session values are embedded in generated HTML.
export function renderPlayAccount(root: ParentNode, loggedIn: boolean, user: AuthUser | null, name: string): void {
    const account = root.querySelector<HTMLElement>("[data-play-account]");
    const guest = root.querySelector<HTMLElement>("[data-play-guest]");
    if (loggedIn) {
        const values: Array<[string, string]> = [
            ["[data-play-username]", name],
            ["[data-play-wins]", String(user?.wins ?? 0)],
            ["[data-play-losses]", String(user?.losses ?? 0)],
            ["[data-play-games]", String(user?.total_games_played ?? 0)],
        ];
        for (const [selector, value] of values) {
            const element = root.querySelector<HTMLElement>(selector);
            if (element) element.textContent = value;
        }
    }
    if (account) account.hidden = !loggedIn;
    if (guest) guest.hidden = loggedIn;
}

function initializePlayAccount(
    root: ParentNode | null,
    expiration: typeof authTokenExpiration,
    nameFor: typeof displayName,
    render: typeof renderPlayAccount,
): void {
    if (!root) return;
    let loggedIn = false;
    let user: AuthUser | null = null;
    try {
        const expires = expiration(localStorage.getItem("accessToken"));
        loggedIn = expires !== null && expires > Date.now() / 1000;
        if (loggedIn) {
            try {
                const parsed: unknown = JSON.parse(localStorage.getItem("hocAuthUser") ?? "null");
                if (parsed && typeof parsed === "object") user = parsed as AuthUser;
            } catch {
                // A missing cached profile does not invalidate the signed-in session.
            }
        }
    } catch {
        // Storage can be disabled; the guest view remains immediately usable.
    }
    let name = "Account";
    if (loggedIn) {
        try {
            name = nameFor(user);
        } catch {
            // Corrupt cached display fields should not interrupt the first paint.
        }
    }
    render(root, loggedIn, user, name);
}

export function playAccountFirstPaintScript(): string {
    return `(${initializePlayAccount.toString()})(document.currentScript.parentElement,${authTokenExpiration.toString()},${displayName.toString()},${renderPlayAccount.toString()});`;
}
