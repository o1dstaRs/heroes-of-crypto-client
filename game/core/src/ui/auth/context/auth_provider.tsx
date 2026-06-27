import React from "react";

import {
    ConfirmCode,
    NewPlayer,
    RequestCode,
    GamePublic,
    GamePublicObject,
    ResetPassword,
    ResponseEnqueue,
    ResponseMe,
    PickPairRequest,
    PickBanRequest,
    RevealRequest,
} from "@heroesofcrypto/common";
import { useCallback, useEffect, useMemo, useReducer } from "react";

import { v4 as uuidv4 } from "uuid";

import { isValidToken, setSession } from "./auth_utils";
import { ActionMapType, AuthStateType, AuthUserType } from "./types";
import { AuthContext } from "./auth_context";
import { axiosAuthInstance, axiosMMInstance, axiosGameInstance, endpoints } from "../../../api/axios";
import { buildSiweMessage, type SignMessageFn } from "../../../wallet/siwe";

enum Types {
    INITIAL = "INITIAL",
    LOGIN = "LOGIN",
    REGISTER = "REGISTER",
    LOGOUT = "LOGOUT",
}

type Payload = {
    [Types.INITIAL]: {
        user: AuthUserType | null;
    };
    [Types.LOGIN]: {
        user: AuthUserType;
    };
    [Types.REGISTER]: {
        user: AuthUserType;
    };
    [Types.LOGOUT]: undefined;
};

type ActionsType = ActionMapType<Payload>[keyof ActionMapType<Payload>];

const initialState: AuthStateType = {
    user: null,
    loading: true,
};

const getCookie = (name: string): string | undefined => {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) {
        const part = parts.pop();
        if (part) {
            return part.split(";").shift();
        }
    }
    return undefined;
};

const reducer = (state: AuthStateType, action: ActionsType) => {
    if (action.type === Types.INITIAL) {
        return {
            loading: false,
            user: action.payload.user,
        };
    }
    if (action.type === Types.LOGIN) {
        return {
            ...state,
            user: action.payload.user,
        };
    }
    if (action.type === Types.REGISTER) {
        return {
            ...state,
            user: action.payload.user,
        };
    }
    if (action.type === Types.LOGOUT) {
        return {
            ...state,
            user: null,
        };
    }
    return state;
};

// ----------------------------------------------------------------------

const STORAGE_KEY = "accessToken";

type Props = {
    children: React.ReactNode;
};

const refreshLocalStorageFromCookie = () => {
    const accessTokenCookie = getCookie(STORAGE_KEY);
    if (accessTokenCookie) {
        localStorage.setItem(STORAGE_KEY, accessTokenCookie);
    }

    const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
    if (!hash.includes("access_token=") && !hash.includes("accessToken=")) {
        return;
    }

    const hashParams = new URLSearchParams(hash);
    const accessToken = hashParams.get("access_token") ?? hashParams.get(STORAGE_KEY);
    if (accessToken) {
        localStorage.setItem(STORAGE_KEY, accessToken);
        window.history.replaceState(null, document.title, `${window.location.pathname}${window.location.search}`);
    }
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === "object" && value !== null;
};

const authJsonHeaders = (accessToken?: string | null): Record<string, string> => ({
    "Content-Type": "application/json",
    "x-request-id": uuidv4(),
    ...(accessToken ? { Authorization: accessToken } : {}),
});

const getAccessToken = (): string | null => {
    refreshLocalStorageFromCookie();
    return localStorage.getItem(STORAGE_KEY);
};

const stringArrayFrom = (value: unknown): string[] => {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
};

const walletAddressesFrom = (data: unknown): string[] => {
    if (Array.isArray(data)) {
        return stringArrayFrom(data);
    }
    if (!isRecord(data)) {
        return [];
    }
    return stringArrayFrom(data.walletAddresses)
        .concat(stringArrayFrom(data.addresses))
        .concat(stringArrayFrom(data.wallets));
};

const tokenFromWalletResponse = (authorization: unknown, data: unknown): string | null => {
    const normalizeToken = (token: string): string => {
        return token.startsWith("Bearer ") ? token : `Bearer ${token}`;
    };

    if (typeof authorization === "string" && authorization.length > 0) {
        return normalizeToken(authorization);
    }
    if (!isRecord(data)) {
        return null;
    }
    const accessToken = data.accessToken ?? data.token;
    return typeof accessToken === "string" && accessToken.length > 0 ? normalizeToken(accessToken) : null;
};

const isE2eLoginEnabled = (): boolean => {
    return !import.meta.env.PROD && import.meta.env.VITE_IS_PROD !== "true";
};

const readE2eLoginParams = (): { email: string; password: string; cleanUrl: string } | null => {
    if (!isE2eLoginEnabled()) {
        return null;
    }

    const url = new URL(window.location.href);
    const email = url.searchParams.get("e2eEmail") ?? url.searchParams.get("email");
    const password = url.searchParams.get("e2ePassword") ?? url.searchParams.get("password");

    if (!email || !password) {
        return null;
    }

    url.searchParams.delete("e2eEmail");
    url.searchParams.delete("e2ePassword");
    url.searchParams.delete("email");
    url.searchParams.delete("password");

    return { email, password, cleanUrl: `${url.pathname}${url.search}${url.hash}` };
};

const authenticateWithEmailPassword = async (email: string, password: string): Promise<AuthUserType> => {
    const newPlayer = new NewPlayer({ email, password });
    const data = newPlayer.serializeBinary();

    const res = await axiosAuthInstance.post(endpoints.auth.login, data, {
        responseType: "arraybuffer",
        headers: { "Content-Type": "application/octet-stream", "x-request-id": uuidv4() },
    });

    const authHeader = res.headers.authorization;
    const reponseData = res.data;
    const responseMe = ResponseMe.deserializeBinary(reponseData);

    setSession(authHeader);

    return {
        ...responseMe.toObject(),
    };
};

export function AuthProvider({ children }: Props) {
    const [state, dispatch] = useReducer(reducer, initialState);

    const initialize = useCallback(async () => {
        try {
            // Dev/e2e observer-play links (?e2ePlayerId=) identify the player via the URL, not a
            // login. Clear any stale token from a previous e2eEmail login in this browser so it
            // isn't sent as Authorization (which would hijack the dev game -> "Player is not in
            // this game") and so the route enters clean observer mode and resolves the team.
            if (isE2eLoginEnabled() && new URL(window.location.href).searchParams.has("e2ePlayerId")) {
                setSession(null);
                document.cookie = "accessToken=; Max-Age=0; path=/";
                dispatch({ type: Types.INITIAL, payload: { user: null } });
                return;
            }

            const e2eLogin = readE2eLoginParams();
            if (e2eLogin) {
                const user = await authenticateWithEmailPassword(e2eLogin.email, e2eLogin.password);
                window.history.replaceState(null, document.title, e2eLogin.cleanUrl);
                dispatch({
                    type: Types.INITIAL,
                    payload: {
                        user,
                    },
                });
                return;
            }

            refreshLocalStorageFromCookie();

            const accessToken = localStorage.getItem(STORAGE_KEY);

            if (accessToken && isValidToken(accessToken)) {
                setSession(accessToken);

                const getResponseMe = await axiosAuthInstance.get(endpoints.auth.me, {
                    responseType: "arraybuffer",
                    headers: {
                        "Content-Type": "application/octet-stream",
                        "x-request-id": uuidv4(),
                        Authorization: accessToken,
                    },
                });
                const meResponse = ResponseMe.deserializeBinary(getResponseMe.data);

                dispatch({
                    type: Types.INITIAL,
                    payload: {
                        user: {
                            ...meResponse.toObject(),
                        },
                    },
                });
            } else {
                dispatch({
                    type: Types.INITIAL,
                    payload: {
                        user: null,
                    },
                });
            }
        } catch (error) {
            console.error(error);
            dispatch({
                type: Types.INITIAL,
                payload: {
                    user: null,
                },
            });
        }
    }, []);

    useEffect(() => {
        initialize();
    }, []);

    const startGameSearch = useCallback(async () => {
        const accessToken = getAccessToken();

        const res = await axiosMMInstance.post(endpoints.mm.queue, null, {
            responseType: "arraybuffer",
            headers: {
                "Content-Type": "application/octet-stream",
                "x-request-id": uuidv4(),
                ...(accessToken ? { Authorization: accessToken } : {}),
            },
        });

        const reponseData = res.data;
        const responseEnqueue = ResponseEnqueue.deserializeBinary(reponseData);

        dispatch({
            type: Types.INITIAL,
            payload: {
                user: {
                    ...state.user,
                    ...responseEnqueue.toObject(),
                } as AuthUserType,
            },
        });
    }, [state]);

    const stopGameSearch = useCallback(async () => {
        const accessToken = getAccessToken();

        await axiosMMInstance.delete(endpoints.mm.queue, {
            responseType: "arraybuffer",
            headers: {
                "Content-Type": "application/octet-stream",
                "x-request-id": uuidv4(),
                ...(accessToken ? { Authorization: accessToken } : {}),
            },
        });

        dispatch({
            type: Types.INITIAL,
            payload: {
                user: {
                    ...state.user,
                    matchMakingQueueAddedTime: 0,
                } as AuthUserType,
            },
        });
    }, [state]);

    const confirmGame = useCallback(async (gameId: string) => {
        const accessToken = getAccessToken();

        await axiosGameInstance.post(`${endpoints.game.confirm}/${gameId}`, null, {
            responseType: "arraybuffer",
            headers: {
                "Content-Type": "application/octet-stream",
                "x-request-id": uuidv4(),
                ...(accessToken ? { Authorization: accessToken } : {}),
            },
        });
    }, []);

    const abandonGame = useCallback(
        async (gameId: string) => {
            const accessToken = getAccessToken();

            await axiosGameInstance.post(`${endpoints.game.abandon}/${gameId}`, null, {
                responseType: "arraybuffer",
                headers: {
                    "Content-Type": "application/octet-stream",
                    "x-request-id": uuidv4(),
                    ...(accessToken ? { Authorization: accessToken } : {}),
                },
            });

            dispatch({
                type: Types.INITIAL,
                payload: {
                    user: {
                        ...state.user,
                        inGameId: "",
                    } as AuthUserType,
                },
            });
        },
        [state],
    );

    const pickPair = useCallback(async (pairIndex: number) => {
        refreshLocalStorageFromCookie();
        const accessToken = localStorage.getItem(STORAGE_KEY);

        const pickPairRequest = new PickPairRequest({ pair_index: pairIndex });
        const data = pickPairRequest.serializeBinary();

        await axiosGameInstance.post(`${endpoints.game.pickPair}`, data, {
            responseType: "arraybuffer",
            headers: {
                "Content-Type": "application/octet-stream",
                "x-request-id": uuidv4(),
                Authorization: accessToken,
            },
        });
    }, []);

    const pick = useCallback(async (creature: number) => {
        refreshLocalStorageFromCookie();
        const accessToken = localStorage.getItem(STORAGE_KEY);

        const pickRequest = new PickBanRequest({ creature });
        const data = pickRequest.serializeBinary();

        await axiosGameInstance.post(`${endpoints.game.pick}`, data, {
            responseType: "arraybuffer",
            headers: {
                "Content-Type": "application/octet-stream",
                "x-request-id": uuidv4(),
                Authorization: accessToken,
            },
        });
    }, []);

    const ban = useCallback(async (creature: number) => {
        refreshLocalStorageFromCookie();
        const accessToken = localStorage.getItem(STORAGE_KEY);

        const banRequest = new PickBanRequest({ creature });
        const data = banRequest.serializeBinary();

        await axiosGameInstance.post(`${endpoints.game.ban}`, data, {
            responseType: "arraybuffer",
            headers: {
                "Content-Type": "application/octet-stream",
                "x-request-id": uuidv4(),
                Authorization: accessToken,
            },
        });
    }, []);

    const reveal = useCallback(async (slot: number) => {
        refreshLocalStorageFromCookie();
        const accessToken = localStorage.getItem(STORAGE_KEY);

        const revealRequest = new RevealRequest({ creature_index: slot });
        const data = revealRequest.serializeBinary();

        await axiosGameInstance.post(`${endpoints.game.reveal}`, data, {
            responseType: "arraybuffer",
            headers: {
                "Content-Type": "application/octet-stream",
                "x-request-id": uuidv4(),
                Authorization: accessToken,
            },
        });
    }, []);

    const getCurrentGame = useCallback(async (): Promise<GamePublicObject | null> => {
        refreshLocalStorageFromCookie();
        const accessToken = localStorage.getItem(STORAGE_KEY);

        const res = await axiosGameInstance.get(`${endpoints.game.current}`, {
            responseType: "arraybuffer",
            headers: {
                "Content-Type": "application/octet-stream",
                "x-request-id": uuidv4(),
                Authorization: accessToken,
            },
        });

        const reponseData = res.data;
        return GamePublic.deserializeBinary(reponseData).toObject();
    }, []);

    // LOGIN
    const login = useCallback(async (email: string, password: string) => {
        const user = await authenticateWithEmailPassword(email, password);

        dispatch({
            type: Types.LOGIN,
            payload: {
                user,
            },
        });
    }, []);

    const me = useCallback(async () => {
        const getResponseMe = await axiosAuthInstance.get(endpoints.auth.me, {
            responseType: "arraybuffer",
            headers: { "Content-Type": "application/octet-stream", "x-request-id": uuidv4() },
        });

        const meResponse = ResponseMe.deserializeBinary(getResponseMe.data);

        dispatch({
            type: Types.INITIAL,
            payload: {
                user: {
                    ...meResponse.toObject(),
                },
            },
        });
    }, []);

    const buildWalletProof = useCallback(async (address: string, signMessage: SignMessageFn) => {
        const nonceResponse = await axiosAuthInstance.post(
            endpoints.auth.walletNonce,
            { address },
            { headers: authJsonHeaders() },
        );
        const nonceData = nonceResponse.data as unknown;
        const nonce =
            typeof nonceData === "string"
                ? nonceData
                : isRecord(nonceData) && typeof nonceData.nonce === "string"
                  ? nonceData.nonce
                  : "";

        if (!nonce) {
            throw new Error("Wallet nonce was not returned by the auth service");
        }

        const chainId =
            isRecord(nonceData) && typeof nonceData.chainId === "number" && Number.isFinite(nonceData.chainId)
                ? nonceData.chainId
                : 1;
        const message =
            isRecord(nonceData) && typeof nonceData.message === "string"
                ? nonceData.message
                : buildSiweMessage({
                      domain: window.location.host,
                      uri: window.location.origin,
                      address,
                      nonce,
                      chainId,
                  });
        const signature = await signMessage(message);

        return { address, message, signature };
    }, []);

    const loginWithWallet = useCallback(
        async (address: string, signMessage: SignMessageFn) => {
            const proof = await buildWalletProof(address, signMessage);
            const res = await axiosAuthInstance.post(endpoints.auth.walletLogin, proof, {
                headers: authJsonHeaders(),
            });
            const accessToken = tokenFromWalletResponse(res.headers.authorization, res.data);
            if (!accessToken) {
                throw new Error("Wallet login did not return an access token");
            }
            setSession(accessToken);
            await me();
        },
        [buildWalletProof, me],
    );

    const getWallets = useCallback(async (): Promise<string[]> => {
        const accessToken = getAccessToken();
        const res = await axiosAuthInstance.get(endpoints.auth.walletList, {
            headers: authJsonHeaders(accessToken),
        });
        return walletAddressesFrom(res.data);
    }, []);

    const linkWallet = useCallback(
        async (address: string, signMessage: SignMessageFn): Promise<string[]> => {
            const accessToken = getAccessToken();
            const proof = await buildWalletProof(address, signMessage);
            const res = await axiosAuthInstance.post(endpoints.auth.walletLink, proof, {
                headers: authJsonHeaders(accessToken),
            });
            const wallets = walletAddressesFrom(res.data);
            return wallets.length ? wallets : getWallets();
        },
        [buildWalletProof, getWallets],
    );

    const unlinkWallet = useCallback(
        async (address: string): Promise<string[]> => {
            const accessToken = getAccessToken();
            const res = await axiosAuthInstance.post(
                endpoints.auth.walletUnlink,
                { address },
                {
                    headers: authJsonHeaders(accessToken),
                },
            );
            const wallets = walletAddressesFrom(res.data);
            return wallets.length ? wallets : getWallets();
        },
        [getWallets],
    );

    const confirmCode = useCallback(
        async (email: string, code: string) => {
            const confirmRequest = new ConfirmCode({ email, code });
            const data = confirmRequest.serializeBinary();

            await axiosAuthInstance.post(endpoints.auth.confirmCode, data, {
                headers: { "Content-Type": "application/octet-stream", "x-request-id": uuidv4() },
            });

            dispatch({
                type: Types.INITIAL,
                payload: {
                    user: {
                        ...state.user,
                        isActive: true,
                    } as AuthUserType,
                },
            });
        },
        [state],
    );

    const requestCode = useCallback(async (email: string) => {
        const codeRequest = new RequestCode({ email });
        const data = codeRequest.serializeBinary();

        await axiosAuthInstance.post(endpoints.auth.requestCode, data, {
            headers: { "Content-Type": "application/octet-stream", "x-request-id": uuidv4() },
        });
    }, []);

    const requestPasswordReset = useCallback(async (email: string) => {
        const passwordResetRequest = new RequestCode({ email });
        const data = passwordResetRequest.serializeBinary();

        await axiosAuthInstance.post(endpoints.auth.requestPasswordReset, data, {
            headers: { "Content-Type": "application/octet-stream", "x-request-id": uuidv4() },
        });
    }, []);

    const resetPassword = useCallback(async (email: string, password: string, token: Uint8Array) => {
        const resetPasswordRequest = new ResetPassword({ email, password, token });
        const data = resetPasswordRequest.serializeBinary();

        await axiosAuthInstance.post(endpoints.auth.resetPassword, data, {
            headers: { "Content-Type": "application/octet-stream", "x-request-id": uuidv4() },
        });
    }, []);

    const requestEmailLink = useCallback(async (email: string) => {
        const accessToken = getAccessToken();
        if (!accessToken) {
            throw new Error("Unauthorized");
        }

        await axiosAuthInstance.post(
            endpoints.auth.requestEmailLink,
            { email },
            {
                headers: authJsonHeaders(accessToken),
            },
        );
    }, []);

    const confirmEmailLink = useCallback(
        async (email: string, password: string, code: string) => {
            const accessToken = getAccessToken();
            if (!accessToken) {
                throw new Error("Unauthorized");
            }

            await axiosAuthInstance.post(
                endpoints.auth.confirmEmailLink,
                { email, password, code },
                {
                    headers: authJsonHeaders(accessToken),
                },
            );
            await me();
        },
        [me],
    );

    // REGISTER
    const register = useCallback(async (email: string, password: string, username: string) => {
        const newPlayer = new NewPlayer({ username, email, password });
        const data = newPlayer.serializeBinary();

        const res = await axiosAuthInstance.post(endpoints.auth.register, data, {
            responseType: "arraybuffer",
            headers: { "Content-Type": "application/octet-stream", "x-request-id": uuidv4() },
        });

        const authHeader = res.headers.authorization;
        const reponseData = res.data;
        const responseMe = ResponseMe.deserializeBinary(reponseData);

        setSession(authHeader);

        dispatch({
            type: Types.REGISTER,
            payload: {
                user: {
                    ...responseMe.toObject(),
                },
            },
        });
    }, []);

    // LOGOUT
    const logout = useCallback(async () => {
        await axiosAuthInstance.post(endpoints.auth.logout, null, {
            headers: { "Content-Type": "application/octet-stream", "x-request-id": uuidv4() },
        });

        setSession(null);
        dispatch({
            type: Types.LOGOUT,
        });
    }, []);

    // ----------------------------------------------------------------------

    const checkAuthenticated = state.user ? "authenticated" : "unauthenticated";

    const status = state.loading ? "loading" : checkAuthenticated;

    const memoizedValue = useMemo(
        () => ({
            user: state.user,
            method: "jwt",
            loading: status === "loading",
            authenticated: status === "authenticated",
            unauthenticated: status === "unauthenticated",
            //
            login,
            register,
            logout,
            confirmCode,
            requestCode,
            requestPasswordReset,
            resetPassword,
            requestEmailLink,
            confirmEmailLink,
            startGameSearch,
            stopGameSearch,
            confirmGame,
            abandonGame,
            pickPair,
            pick,
            ban,
            reveal,
            getCurrentGame,
            me,
            loginWithWallet,
            linkWallet,
            unlinkWallet,
            getWallets,
        }),
        [
            login,
            logout,
            register,
            confirmCode,
            requestCode,
            requestPasswordReset,
            resetPassword,
            requestEmailLink,
            confirmEmailLink,
            startGameSearch,
            stopGameSearch,
            confirmGame,
            abandonGame,
            pickPair,
            pick,
            ban,
            reveal,
            getCurrentGame,
            me,
            loginWithWallet,
            linkWallet,
            unlinkWallet,
            getWallets,
            state.user,
            status,
        ],
    );

    return <AuthContext.Provider value={memoizedValue}>{children}</AuthContext.Provider>;
}
