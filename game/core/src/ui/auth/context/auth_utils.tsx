import { axiosAuthInstance, axiosGameInstance, axiosMMInstance } from "../../../api/axios";

function jwtDecode(token: string) {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    // Global atob (not window.atob): identical in every browser, and keeps this decodable under the
    // bun test runtime where `window` does not exist.
    const jsonPayload = decodeURIComponent(
        atob(base64)
            .split("")
            .map((c) => `%${`00${c.charCodeAt(0).toString(16)}`.slice(-2)}`)
            .join(""),
    );

    return JSON.parse(jsonPayload);
}

// ----------------------------------------------------------------------

/**
 * The token's exp (seconds), or null when the value is not a decodable JWT. A stale SSO cookie or a
 * corrupted localStorage entry must read as "no token", never throw out of the auth bootstrap —
 * an exception here left the app permanently on the login prompt.
 */
export const tokenExpSafe = (accessToken: string | null | undefined): number | null => {
    if (!accessToken) {
        return null;
    }
    try {
        const decoded = jwtDecode(accessToken);
        return typeof decoded.exp === "number" ? decoded.exp : null;
    } catch {
        return null;
    }
};

export const isValidToken = (accessToken: string) => {
    const exp = tokenExpSafe(accessToken);
    return exp !== null && exp > Date.now() / 1000;
};

// ----------------------------------------------------------------------

export const tokenExpired = (exp: number) => {
    let expiredTimer;

    const currentTime = Date.now();
    const timeLeft = exp * 1000 - currentTime;

    clearTimeout(expiredTimer);

    expiredTimer = setTimeout(() => {
        localStorage.removeItem("accessToken");

        window.location.href = "/";
    }, timeLeft);
};

// ----------------------------------------------------------------------

export const setSession = (accessToken: string | null) => {
    if (accessToken) {
        localStorage.setItem("accessToken", accessToken);

        axiosMMInstance.defaults.headers.common.Authorization = accessToken;
        axiosAuthInstance.defaults.headers.common.Authorization = accessToken;
        axiosGameInstance.defaults.headers.common.Authorization = accessToken;

        // This function below will handle when token is expired
        const { exp } = jwtDecode(accessToken); // ~3 days by minimals server
        tokenExpired(exp);
    } else {
        localStorage.removeItem("accessToken");

        delete axiosMMInstance.defaults.headers.common.Authorization;
        delete axiosAuthInstance.defaults.headers.common.Authorization;
        delete axiosGameInstance.defaults.headers.common.Authorization;
    }
};
