import { GamePublicObject, ResponseMeObject } from "@heroesofcrypto/common";

import type { SignMessageFn } from "../../../wallet/siwe";

// import { PopupLoginOptions, RedirectLoginOptions } from "@auth0/auth0-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ActionMapType<M extends { [index: string]: any }> = {
    [Key in keyof M]: M[Key] extends undefined
        ? {
              type: Key;
          }
        : {
              type: Key;
              payload: M[Key];
          };
};

export type AuthUserType = null | ResponseMeObject;

export type AuthStateType = {
    status?: string;
    loading: boolean;
    user: AuthUserType;
};

// ----------------------------------------------------------------------

// type CanRemove = {
//   login?: (email: string, password: string) => Promise<void>;
//   register?: (email: string, password: string, username: string) => Promise<void>;
//   //
//   loginWithGoogle?: () => Promise<void>;
//   loginWithGithub?: () => Promise<void>;
//   loginWithTwitter?: () => Promise<void>;
//   //
//   loginWithPopup?: (options?: PopupLoginOptions) => Promise<void>;
//   loginWithRedirect?: (options?: RedirectLoginOptions) => Promise<void>;
//   //
//   confirmCode?: (email: string, code: string) => Promise<void>;
//   forgotPassword?: (email: string) => Promise<void>;
//   resendCodeRegister?: (email: string) => Promise<void>;
//   newPassword?: (email: string, code: string, password: string) => Promise<void>;
//   updatePassword?: (password: string) => Promise<void>;
// };

export type JWTContextType = {
    user: AuthUserType;
    method: string;
    loading: boolean;
    authenticated: boolean;
    unauthenticated: boolean;
    me: () => Promise<void>;
    login: (email: string, password: string) => Promise<void>;
    register: (email: string, password: string, username: string) => Promise<void>;
    confirmCode: (email: string, code: string) => Promise<void>;
    requestCode: (email: string) => Promise<void>;
    requestPasswordReset: (email: string) => Promise<void>;
    resetPassword: (email: string, password: string, token: Uint8Array) => Promise<void>;
    startGameSearch: () => Promise<void>;
    stopGameSearch: () => Promise<void>;
    confirmGame: (gameId: string) => Promise<void>;
    abandonGame: (gameId: string) => Promise<void>;
    pickPair: (pairIndex: number) => Promise<void>;
    pick: (creature: number) => Promise<void>;
    ban: (creature: number) => Promise<void>;
    reveal: (slot: number) => Promise<void>;
    getCurrentGame: () => Promise<GamePublicObject | null>;
    logout: () => Promise<void>;
    loginWithWallet: (address: string, signMessage: SignMessageFn) => Promise<void>;
    linkWallet: (address: string, signMessage: SignMessageFn) => Promise<string[]>;
    unlinkWallet: (address: string) => Promise<string[]>;
    getWallets: () => Promise<string[]>;
};
