// Browser-side fetch + decode of the authenticated player-portal payload. Mirrors the auth base-URL
// resolution in auth-client.ts and the protobuf decode in game/core's player_portal_client.ts, so the
// website reuses the SAME endpoint the in-game portal does — no new server surface.
import {
    ResponsePlayerPortal,
    type ResponsePlayerPortalObject,
} from "@heroesofcrypto/common/src/generated/protobuf/v1/messages_reexports";

const host = globalThis.location?.hostname ?? "";
const sameOrigin = globalThis.location?.origin ?? "";

// The runtime hostname is authoritative (Astro doesn't reliably inline the env flags into client
// scripts — see the same note in auth-client.ts): any *.heroesofcrypto.io (or the apex) is production.
const isProd =
    host === "heroesofcrypto.io" ||
    host.endsWith(".heroesofcrypto.io") ||
    import.meta.env.PROD === true ||
    import.meta.env.VITE_IS_PROD === "true";

const authBaseUrl =
    import.meta.env.VITE_HOST_AUTH_API ||
    import.meta.env.VITE_AUTH_API ||
    (isProd ? "https://auth.heroesofcrypto.io" : sameOrigin || "http://localhost:3001");

const portalPath = isProd ? "/v1/portal" : "/v1/auth/portal";

function requestId(): string {
    return typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export class PortalAuthError extends Error {}

/** Fetch + decode the signed-in player's portal payload. Throws PortalAuthError when unauthenticated. */
export async function fetchPlayerPortal(): Promise<ResponsePlayerPortalObject> {
    const token = localStorage.getItem("accessToken");
    if (!token) {
        throw new PortalAuthError("not_authenticated");
    }

    const response = await fetch(`${authBaseUrl.replace(/\/$/, "")}${portalPath}`, {
        headers: {
            Accept: "application/octet-stream",
            Authorization: token,
            "x-request-id": requestId(),
        },
    });

    if (response.status === 401 || response.status === 403) {
        throw new PortalAuthError("unauthorized");
    }
    if (!response.ok) {
        throw new Error(`Portal request failed with status ${response.status}`);
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    return ResponsePlayerPortal.deserializeBinary(bytes).toObject();
}
