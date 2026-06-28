// game/core/src/ui/env.ts
interface ImportMetaEnvLike {
    [k: string]: string | boolean | undefined;
    PROD?: boolean;
    VITE_PICK_EVENT_SOURCE?: string;
    VITE_IS_PROD?: string | boolean;
}

function viteEnv(): ImportMetaEnvLike | undefined {
    const m = (typeof import.meta !== "undefined" ? (import.meta as unknown) : undefined) as
        { env?: ImportMetaEnvLike } | undefined;
    return m?.env;
}

export function readIsProd(): boolean {
    const v = viteEnv();
    if (typeof v?.PROD === "boolean") return v.PROD;
    if (typeof v?.VITE_IS_PROD === "string") return v.VITE_IS_PROD === "true";
    if (typeof v?.VITE_IS_PROD === "boolean") return v.VITE_IS_PROD;
    if (typeof process !== "undefined" && process.env && process.env.NODE_ENV) {
        return process.env.NODE_ENV === "production";
    }
    return false;
}

export function readEnvString(viteKey: keyof ImportMetaEnvLike, nodeKey: string): string | undefined {
    const v = viteEnv();
    const fromVite = v && typeof v[viteKey] === "string" ? (v[viteKey] as string) : undefined;
    if (fromVite && fromVite.length > 0) return fromVite;
    if (typeof process !== "undefined" && process.env) {
        const fromNode = process.env[nodeKey];
        if (typeof fromNode === "string" && fromNode.length > 0) return fromNode;
    }
    return undefined;
}

export const IS_PROD = readIsProd();
export const PICK_EVENT_SOURCE = readEnvString("VITE_PICK_EVENT_SOURCE", "PICK_EVENT_SOURCE");
