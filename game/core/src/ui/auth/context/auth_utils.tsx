import { isValidAccessToken, setStoredAccessToken, tokenExpSafe } from "../../../api/access_token";

// ----------------------------------------------------------------------

/**
 * The token's exp (seconds), or null when the value is not a decodable JWT. A stale SSO cookie or a
 * corrupted localStorage entry must read as "no token", never throw out of the auth bootstrap —
 * an exception here left the app permanently on the login prompt.
 */
export { tokenExpSafe };

export const isValidToken = (accessToken: string) => {
    return isValidAccessToken(accessToken);
};

// ----------------------------------------------------------------------

export const setSession = (accessToken: string | null) => {
    setStoredAccessToken(accessToken);
};
