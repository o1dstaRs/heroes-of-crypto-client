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
    ArtifactRequest,
    DoctrineRequest,
    RevealRequest,
} from "@heroesofcrypto/common";
import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";

import { v4 as uuidv4 } from "uuid";

import { isValidToken, setSession } from "./auth_utils";
import { createAuthBootstrapGate, shouldBootstrapFromStorageEvent } from "./auth_bootstrap";
import { ActionMapType, AuthStateType, AuthUserType } from "./types";
import { AuthContext } from "./auth_context";
import {
    normalizeAccessToken,
    resolveAccessTokenHashHandoff,
    setStoredAccessToken,
    shouldAdoptAccessToken,
} from "../../../api/access_token";
import { axiosAuthInstance, axiosMMInstance, axiosGameInstance, endpoints } from "../../../api/axios";
import { buildSiweMessage, type SignMessageFn } from "../../../wallet/siwe";
import { disableGoogleAutoSelect } from "../googleIdentityServices";
import type { GoogleAuthStatus } from "./types";

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

/**
 * Expire the SSO handoff cookie under every scope it could have been set with. The cookie may carry
 * a domain attribute (e.g. `.heroesofcrypto.io` from the main-site handoff); a bare `path=/` expiry
 * silently fails to delete that variant, which left an immortal stale cookie clobbering the fresh
 * localStorage token on every boot — the "always prompts login again" bug.
 */
const clearAccessTokenCookie = () => {
    document.cookie = `${STORAGE_KEY}=; Max-Age=0; path=/`;
    const hostname = window.location.hostname;
    const labels = hostname.split(".");
    if (labels.length >= 2 && !/^[0-9.]+$/.test(hostname)) {
        const apex = labels.slice(-2).join(".");
        document.cookie = `${STORAGE_KEY}=; Max-Age=0; path=/; domain=.${apex}`;
    }
};

const refreshLocalStorageFromCookie = () => {
    const accessTokenCookie = getCookie(STORAGE_KEY);
    if (accessTokenCookie) {
        // The cookie is a single-use handoff, not a store of record: adopt it only when it is a
        // decodable, unexpired token that is FRESHER than what localStorage already holds, and
        // always consume (delete) it afterwards. Unconditional copying let one stale cookie
        // overwrite every future login's token on every page load.
        if (shouldAdoptAccessToken(accessTokenCookie, localStorage.getItem(STORAGE_KEY))) {
            setStoredAccessToken(accessTokenCookie);
        }
        clearAccessTokenCookie();
    }

    const handoff = resolveAccessTokenHashHandoff(window.location.hash, localStorage.getItem(STORAGE_KEY));
    if (!handoff.found) {
        return;
    }

    if (handoff.tokenToAdopt) {
        setStoredAccessToken(handoff.tokenToAdopt);
    }
    // Always consume the credential fragment, including stale/invalid handoffs. Leaving credentials
    // in the address bar leaks them through screenshots, copied URLs, and browser history.
    window.history.replaceState(null, document.title, `${window.location.pathname}${window.location.search}`);
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

const tokenFromAuthResponse = (authorization: unknown, data: unknown): string | null => {
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

const googleAuthStatusFrom = (data: unknown): GoogleAuthStatus => {
    if (!isRecord(data) || typeof data.linked !== "boolean" || typeof data.hasPasswordLogin !== "boolean") {
        throw new Error("Google account status was not returned by the auth service");
    }
    return {
        linked: data.linked,
        email: typeof data.email === "string" ? data.email : "",
        hasPasswordLogin: data.hasPasswordLogin,
    };
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

type EmailPasswordAuth = {
    accessToken: string | null;
    user: AuthUserType;
};

const authenticateWithEmailPassword = async (email: string, password: string): Promise<EmailPasswordAuth> => {
    const newPlayer = new NewPlayer({ email, password });
    const data = newPlayer.serializeBinary();

    const res = await axiosAuthInstance.post(endpoints.auth.login, data, {
        responseType: "arraybuffer",
        headers: { "Content-Type": "application/octet-stream", "x-request-id": uuidv4() },
    });

    const authHeader = res.headers.authorization;
    const reponseData = res.data;
    const responseMe = ResponseMe.deserializeBinary(reponseData);

    return {
        accessToken: tokenFromAuthResponse(authHeader, res.data),
        user: {
            ...responseMe.toObject(),
        },
    };
};

export function AuthProvider({ children }: Props) {
    const [state, dispatch] = useReducer(reducer, initialState);
    const bootstrapGateRef = useRef(createAuthBootstrapGate());

    const initialize = useCallback(async () => {
        const attempt = bootstrapGateRef.current.begin();
        const isCurrentAttempt = () => bootstrapGateRef.current.isCurrent(attempt);

        try {
            // Dev/e2e observer-play links (?e2ePlayerId=) identify the player via the URL, not a
            // login. Clear any stale token from a previous e2eEmail login in this browser so it
            // isn't sent as Authorization (which would hijack the dev game -> "Player is not in
            // this game") and so the route enters clean observer mode and resolves the team.
            if (isE2eLoginEnabled() && new URL(window.location.href).searchParams.has("e2ePlayerId")) {
                if (!isCurrentAttempt()) return;
                setSession(null);
                clearAccessTokenCookie();
                dispatch({ type: Types.INITIAL, payload: { user: null } });
                return;
            }

            const e2eLogin = readE2eLoginParams();
            if (e2eLogin) {
                const authenticated = await authenticateWithEmailPassword(e2eLogin.email, e2eLogin.password);
                if (!isCurrentAttempt()) return;
                setSession(authenticated.accessToken);
                window.history.replaceState(null, document.title, e2eLogin.cleanUrl);
                dispatch({
                    type: Types.INITIAL,
                    payload: {
                        user: authenticated.user,
                    },
                });
                return;
            }

            refreshLocalStorageFromCookie();
            if (!isCurrentAttempt()) return;

            const accessToken = normalizeAccessToken(localStorage.getItem(STORAGE_KEY));

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
                if (!isCurrentAttempt()) return;
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
                if (!isCurrentAttempt()) return;
                setSession(null);
                dispatch({
                    type: Types.INITIAL,
                    payload: {
                        user: null,
                    },
                });
            }
        } catch (error) {
            if (!isCurrentAttempt()) return;
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
        bootstrapGateRef.current.activate();
        const handleStorage = (event: StorageEvent) => {
            if (
                (event.storageArea === null || event.storageArea === localStorage) &&
                shouldBootstrapFromStorageEvent(event.key)
            ) {
                void initialize();
            }
        };

        window.addEventListener("storage", handleStorage);
        void initialize();

        return () => {
            window.removeEventListener("storage", handleStorage);
            bootstrapGateRef.current.deactivate();
        };
    }, [initialize]);

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
                    // ResponseMe/ResponseEnqueue toObject() use the snake_case field, so clearing only
                    // `matchMakingQueueAddedTime` left a stale enqueue timestamp behind (same class of
                    // bug as `isActive` vs `is_active`). Zero both spellings.
                    matchMakingQueueAddedTime: 0,
                    match_making_queue_added_time: 0,
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

    const artifact = useCallback(async (artifactId: number, tier: number) => {
        refreshLocalStorageFromCookie();
        const accessToken = localStorage.getItem(STORAGE_KEY);

        // ArtifactRequest carries the artifact id in `artifact` and the tier (1|2) in `level`.
        const artifactRequest = new ArtifactRequest({ artifact: artifactId, level: tier });
        const data = artifactRequest.serializeBinary();

        await axiosGameInstance.post(`${endpoints.game.artifact}`, data, {
            responseType: "arraybuffer",
            headers: {
                "Content-Type": "application/octet-stream",
                "x-request-id": uuidv4(),
                Authorization: accessToken,
            },
        });
    }, []);

    const perk = useCallback(async (perkId: number) => {
        refreshLocalStorageFromCookie();
        const accessToken = localStorage.getItem(STORAGE_KEY);

        const perkRequest = new DoctrineRequest({ doctrine: perkId });
        const data = perkRequest.serializeBinary();

        await axiosGameInstance.post(`${endpoints.game.perk}`, data, {
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

        // 204 / empty body = the player has no current game. That is the ordinary state on the
        // matchmaking route (and after a match ends), so the server reports it as a status rather than a
        // 404. Return null explicitly: an empty protobuf deserializes CLEANLY into a GamePublic with an
        // empty id rather than throwing, which would read as a real game and send callers chasing it.
        const reponseData = res.data;
        if (res.status === 204 || !reponseData || (reponseData as ArrayBuffer).byteLength === 0) {
            return null;
        }
        return GamePublic.deserializeBinary(reponseData).toObject();
    }, []);

    // LOGIN
    const login = useCallback(async (email: string, password: string) => {
        const attempt = bootstrapGateRef.current.begin();
        const authenticated = await authenticateWithEmailPassword(email, password);
        if (!bootstrapGateRef.current.isCurrent(attempt)) return;

        setSession(authenticated.accessToken);

        dispatch({
            type: Types.LOGIN,
            payload: {
                user: authenticated.user,
            },
        });
    }, []);

    const me = useCallback(async () => {
        const attempt = bootstrapGateRef.current.begin();
        const getResponseMe = await axiosAuthInstance.get(endpoints.auth.me, {
            responseType: "arraybuffer",
            headers: { "Content-Type": "application/octet-stream", "x-request-id": uuidv4() },
        });
        if (!bootstrapGateRef.current.isCurrent(attempt)) return;

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
            const attempt = bootstrapGateRef.current.begin();
            const proof = await buildWalletProof(address, signMessage);
            const res = await axiosAuthInstance.post(endpoints.auth.walletLogin, proof, {
                headers: authJsonHeaders(),
            });
            if (!bootstrapGateRef.current.isCurrent(attempt)) return;
            const accessToken = tokenFromAuthResponse(res.headers.authorization, res.data);
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

    const loginWithGoogle = useCallback(
        async (credential: string): Promise<void> => {
            const attempt = bootstrapGateRef.current.begin();
            const res = await axiosAuthInstance.post(
                endpoints.auth.googleLogin,
                { credential },
                { headers: authJsonHeaders() },
            );
            if (!bootstrapGateRef.current.isCurrent(attempt)) return;
            const accessToken = tokenFromAuthResponse(res.headers.authorization, res.data);
            if (!accessToken) {
                throw new Error("Google login did not return an access token");
            }
            setSession(accessToken);
            await me();
        },
        [me],
    );

    const getGoogleAuthStatus = useCallback(async (): Promise<GoogleAuthStatus> => {
        const accessToken = getAccessToken();
        const res = await axiosAuthInstance.get(endpoints.auth.googleStatus, {
            headers: authJsonHeaders(accessToken),
        });
        return googleAuthStatusFrom(res.data);
    }, []);

    const linkGoogle = useCallback(async (credential: string): Promise<GoogleAuthStatus> => {
        const accessToken = getAccessToken();
        const res = await axiosAuthInstance.post(
            endpoints.auth.googleLink,
            { credential },
            { headers: authJsonHeaders(accessToken) },
        );
        return googleAuthStatusFrom(res.data);
    }, []);

    const unlinkGoogle = useCallback(async (): Promise<GoogleAuthStatus> => {
        const accessToken = getAccessToken();
        const res = await axiosAuthInstance.post(endpoints.auth.googleUnlink, null, {
            headers: authJsonHeaders(accessToken),
        });
        return googleAuthStatusFrom(res.data);
    }, []);

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
                        // ResponseMe.toObject() uses the snake_case field `is_active`; setting
                        // `isActive` here left the real flag false, so the app never saw the account
                        // as activated until a full re-login. Flip the correct field.
                        is_active: true,
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
        const attempt = bootstrapGateRef.current.begin();
        const newPlayer = new NewPlayer({ username, email, password });
        const data = newPlayer.serializeBinary();

        const res = await axiosAuthInstance.post(endpoints.auth.register, data, {
            responseType: "arraybuffer",
            headers: { "Content-Type": "application/octet-stream", "x-request-id": uuidv4() },
        });
        if (!bootstrapGateRef.current.isCurrent(attempt)) return;

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
        const attempt = bootstrapGateRef.current.begin();
        await axiosAuthInstance.post(endpoints.auth.logout, null, {
            headers: { "Content-Type": "application/octet-stream", "x-request-id": uuidv4() },
        });
        if (!bootstrapGateRef.current.isCurrent(attempt)) return;

        setSession(null);
        disableGoogleAutoSelect();
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
            artifact,
            perk,
            ban,
            reveal,
            getCurrentGame,
            me,
            loginWithWallet,
            linkWallet,
            unlinkWallet,
            getWallets,
            loginWithGoogle,
            linkGoogle,
            unlinkGoogle,
            getGoogleAuthStatus,
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
            artifact,
            perk,
            ban,
            reveal,
            getCurrentGame,
            me,
            loginWithWallet,
            linkWallet,
            unlinkWallet,
            getWallets,
            loginWithGoogle,
            linkGoogle,
            unlinkGoogle,
            getGoogleAuthStatus,
            state.user,
            status,
        ],
    );

    return <AuthContext.Provider value={memoizedValue}>{children}</AuthContext.Provider>;
}
