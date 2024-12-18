import { ResponseMe } from "@heroesofcrypto/common/src/generated/protobuf/v1/response_me_pb";
import { GamePublic } from "@heroesofcrypto/common/src/generated/protobuf/v1/game_public_pb";

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

export type AuthUserType = null | ResponseMe.AsObject;

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
    getCurrentGame: () => Promise<GamePublic.AsObject | null>;
    logout: () => Promise<void>;
};
