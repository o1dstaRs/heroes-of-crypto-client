import { axiosAuthInstance, axiosMMInstance } from "../../../api/axios";

function jwtDecode(token: string) {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
        window
            .atob(base64)
            .split("")
            .map((c) => `%${`00${c.charCodeAt(0).toString(16)}`.slice(-2)}`)
            .join(""),
    );

    return JSON.parse(jsonPayload);
}

// ----------------------------------------------------------------------

export const isValidToken = (accessToken: string) => {
    if (!accessToken) {
        return false;
    }

    const decoded = jwtDecode(accessToken);

    const currentTime = Date.now() / 1000;

    return decoded.exp > currentTime;
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

        // This function below will handle when token is expired
        const { exp } = jwtDecode(accessToken); // ~3 days by minimals server
        tokenExpired(exp);
    } else {
        localStorage.removeItem("accessToken");

        delete axiosMMInstance.defaults.headers.common.Authorization;
        delete axiosAuthInstance.defaults.headers.common.Authorization;
    }
};
