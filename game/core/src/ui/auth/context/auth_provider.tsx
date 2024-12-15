import React from "react";

import { ConfirmCode } from "@heroesofcrypto/common/src/generated/protobuf/v1/confirm_code_pb";
import { NewPlayer } from "@heroesofcrypto/common/src/generated/protobuf/v1/new_player_pb";
import { RequestCode } from "@heroesofcrypto/common/src/generated/protobuf/v1/request_code_pb";
import { GamePublic } from "@heroesofcrypto/common/src/generated/protobuf/v1/game_public_pb";
import { ResetPassword } from "@heroesofcrypto/common/src/generated/protobuf/v1/reset_password_pb";
import { ResponseEnqueue } from "@heroesofcrypto/common/src/generated/protobuf/v1/response_enqueue_pb";
import { ResponseMe } from "@heroesofcrypto/common/src/generated/protobuf/v1/response_me_pb";
import {
    PickPairRequest,
    PickBanRequest,
    RevealRequest,
} from "@heroesofcrypto/common/src/generated/protobuf/v1/pick_phase_requests_pb";
import { useCallback, useEffect, useMemo, useReducer } from "react";

import { v4 as uuidv4 } from "uuid";

import { isValidToken, setSession } from "./auth_utils";
import { ActionMapType, AuthStateType, AuthUserType } from "./types";
import { AuthContext } from "./auth_context";
import { axiosAuthInstance, axiosMMInstance, axiosGameInstance, endpoints } from "../../../api/axios";

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
};

export function AuthProvider({ children }: Props) {
    const [state, dispatch] = useReducer(reducer, initialState);

    const initialize = useCallback(async () => {
        try {
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
        const res = await axiosMMInstance.post(endpoints.mm.queue, null, {
            responseType: "arraybuffer",
            headers: { "Content-Type": "application/octet-stream", "x-request-id": uuidv4() },
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
        await axiosMMInstance.delete(endpoints.mm.queue, {
            responseType: "arraybuffer",
            headers: { "Content-Type": "application/octet-stream", "x-request-id": uuidv4() },
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
        await axiosGameInstance.post(`${endpoints.game.confirm}/${gameId}`, {
            responseType: "arraybuffer",
            headers: { "Content-Type": "application/octet-stream", "x-request-id": uuidv4() },
        });
    }, []);

    const abandonGame = useCallback(async (gameId: string) => {
        await axiosGameInstance.post(`${endpoints.game.abandon}/${gameId}`, {
            responseType: "arraybuffer",
            headers: { "Content-Type": "application/octet-stream", "x-request-id": uuidv4() },
        });
    }, []);

    const pickPair = useCallback(async (pairIndex: number) => {
        refreshLocalStorageFromCookie();
        const accessToken = localStorage.getItem(STORAGE_KEY);

        const pickPairRequest = new PickPairRequest();
        pickPairRequest.setPairIndex(pairIndex);
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

        const pickRequest = new PickBanRequest();
        pickRequest.setCreature(creature);
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

        const banRequest = new PickBanRequest();
        banRequest.setCreature(creature);
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

        const revealRequest = new RevealRequest();
        revealRequest.setCreatureIndex(slot);
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

    const getCurrentGame = useCallback(async (): Promise<GamePublic.AsObject | null> => {
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
        const newPlayer = new NewPlayer();
        newPlayer.setPassword(password);
        newPlayer.setEmail(email);
        const data = newPlayer.serializeBinary();

        const res = await axiosAuthInstance.post(endpoints.auth.login, data, {
            responseType: "arraybuffer",
            headers: { "Content-Type": "application/octet-stream", "x-request-id": uuidv4() },
        });

        const authHeader = res.headers.authorization;
        const reponseData = res.data;
        const responseMe = ResponseMe.deserializeBinary(reponseData);

        setSession(authHeader);

        dispatch({
            type: Types.LOGIN,
            payload: {
                user: {
                    ...responseMe.toObject(),
                },
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

    const confirmCode = useCallback(
        async (email: string, code: string) => {
            const confirmRequest = new ConfirmCode();
            confirmRequest.setCode(code);
            confirmRequest.setEmail(email);
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
        const codeRequest = new RequestCode();
        codeRequest.setEmail(email);
        const data = codeRequest.serializeBinary();

        await axiosAuthInstance.post(endpoints.auth.requestCode, data, {
            headers: { "Content-Type": "application/octet-stream", "x-request-id": uuidv4() },
        });
    }, []);

    const requestPasswordReset = useCallback(async (email: string) => {
        const passwordResetRequest = new RequestCode();
        passwordResetRequest.setEmail(email);
        const data = passwordResetRequest.serializeBinary();

        await axiosAuthInstance.post(endpoints.auth.requestPasswordReset, data, {
            headers: { "Content-Type": "application/octet-stream", "x-request-id": uuidv4() },
        });
    }, []);

    const resetPassword = useCallback(async (email: string, password: string, token: Uint8Array) => {
        const resetPasswordRequest = new ResetPassword();
        resetPasswordRequest.setEmail(email);
        resetPasswordRequest.setPassword(password);
        resetPasswordRequest.setToken(token);
        const data = resetPasswordRequest.serializeBinary();

        await axiosAuthInstance.post(endpoints.auth.resetPassword, data, {
            headers: { "Content-Type": "application/octet-stream", "x-request-id": uuidv4() },
        });
    }, []);

    // REGISTER
    const register = useCallback(async (email: string, password: string, username: string) => {
        const newPlayer = new NewPlayer();
        newPlayer.setUsername(username);
        newPlayer.setPassword(password);
        newPlayer.setEmail(email);
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
        }),
        [
            login,
            logout,
            register,
            confirmCode,
            requestCode,
            requestPasswordReset,
            resetPassword,
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
            state.user,
            status,
        ],
    );

    return <AuthContext.Provider value={memoizedValue}>{children}</AuthContext.Provider>;
}
