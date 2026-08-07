import { ResponseMe, type ResponseMeObject } from "@heroesofcrypto/common/src/generated/protobuf/v1/messages_reexports";

export type GoogleAuthFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface GoogleLoginRequest {
    authBaseUrl: string;
    credential: string;
    isProd: boolean;
    requestId: string;
    fetchImpl?: GoogleAuthFetch;
}

export interface GoogleLoginSession {
    token: string;
    user: ResponseMeObject;
}

export const googleLoginPath = (isProd: boolean): string => (isProd ? "/v1/google-login" : "/v1/auth/google-login");

export async function exchangeGoogleCredential({
    authBaseUrl,
    credential,
    isProd,
    requestId,
    fetchImpl = fetch,
}: GoogleLoginRequest): Promise<GoogleLoginSession> {
    const normalizedCredential = credential.trim();
    if (!normalizedCredential) {
        throw new Error("Google did not return a credential");
    }

    const response = await fetchImpl(`${authBaseUrl.replace(/\/$/, "")}${googleLoginPath(isProd)}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-request-id": requestId,
        },
        body: JSON.stringify({ credential: normalizedCredential }),
    });

    if (!response.ok) {
        const body = (await response.text()).trim();
        throw new Error(body && body !== "Bad Request" ? body : `Google sign-in failed with status ${response.status}`);
    }

    const token = response.headers.get("authorization") || response.headers.get("x-new-token") || "";
    if (!token) {
        throw new Error("Google sign-in response did not include a session token");
    }

    const responseBytes = new Uint8Array(await response.arrayBuffer());
    const user = ResponseMe.deserializeBinary(responseBytes).toObject();
    return { token, user };
}
