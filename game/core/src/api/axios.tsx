import { HoCLib } from "@heroesofcrypto/common";
import axios, { AxiosRequestConfig } from "axios";

const IS_PROD = HoCLib.stringToBoolean(process.env.IS_PROD);

export const axiosAuthInstance = axios.create({ baseURL: process.env.HOST_AUTH_API });

axiosAuthInstance.interceptors.response.use(
    (res) => {
        const newToken = res.headers["x-new-token"];
        if (newToken) {
            localStorage.setItem("accessToken", newToken);
        }
        res.headers = { ...res.headers };
        return res;
    },
    (error) => {
        if (
            error.response?.status === 400 &&
            (!error.response.data ||
                error.response.data.constructor !== String ||
                !error.response.data?.startsWith("Password matches"))
        ) {
            error.message = "Request failed: Invalid inputs";
        }
        return Promise.reject(
            error.response?.data &&
                error.response?.data.constructor === String &&
                error.response?.data !== "Bad Request"
                ? `Request failed: ${error.response.data}`
                : error,
        );
    },
);

export const axiosMMInstance = axios.create({ baseURL: process.env.HOST_MATCHMAKING_API });
axiosMMInstance.interceptors.response.use(
    (res) => {
        res.headers = { ...res.headers };
        return res;
    },
    (error) => {
        if (error.response?.status === 409) {
            return Promise.reject(new Error("Already in game"));
        }
        return Promise.reject(
            error.response?.data &&
                error.response?.data.constructor === String &&
                error.response?.data !== "Bad Request"
                ? `Request failed: ${error.response.data}`
                : error,
        );
    },
);

export const axiosGameInstance = axios.create({ baseURL: process.env.HOST_GAME_API });
axiosGameInstance.interceptors.response.use(
    (res) => {
        res.headers = { ...res.headers };
        return res;
    },
    (error) => {
        if (error.response?.status === 409) {
            return Promise.reject(new Error("Already in game"));
        } else if (error.response?.status === 401) {
            return Promise.reject(new Error("Unauthorized"));
        }
        return Promise.reject(
            error.response?.data &&
                error.response?.data.constructor === String &&
                error.response?.data !== "Bad Request"
                ? `Request failed: ${error.response.data}`
                : error,
        );
    },
);

export const authFetcher = async (args: string | [string, AxiosRequestConfig]) => {
    const [url, config] = Array.isArray(args) ? args : [args];

    const res = await axiosAuthInstance.get(url, { ...config });

    return res.data;
};

// ----------------------------------------------------------------------

export const endpoints = {
    auth: {
        me: `${IS_PROD ? "/v1/me" : "/v1/auth/me"}`,
        login: `${IS_PROD ? "/v1/login" : "/v1/auth/login"}`,
        logout: `${IS_PROD ? "/v1/logout" : "/v1/auth/logout"}`,
        register: `${IS_PROD ? "/v1/register" : "/v1/auth/register"}`,
        confirmCode: `${IS_PROD ? "/v1/confirm-verification-code" : "/v1/auth/confirm-verification-code"}`,
        requestCode: `${IS_PROD ? "/v1/request-verification-code" : "/v1/auth/request-verification-code"}`,
        requestPasswordReset: `${IS_PROD ? "/v1/request-password-reset" : "/v1/auth/request-password-reset"}`,
        resetPassword: `${IS_PROD ? "/v1/reset-password" : "/v1/auth/reset-password"}`,
    },
    mm: {
        queue: `${IS_PROD ? "/v1/queue" : "/v1/mm/queue"}`,
    },
    game: {
        confirm: `${IS_PROD ? "/v1/confirm" : "/v1/game/confirm"}`,
        abandon: `${IS_PROD ? "/v1/abandon" : "/v1/game/abandon"}`,
        current: `${IS_PROD ? "/v1/current" : "/v1/game/current"}`,
    },
};

console.log(endpoints);
