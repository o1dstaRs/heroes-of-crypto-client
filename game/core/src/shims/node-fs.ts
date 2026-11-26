/**
 * Browser stand-in. Production search never writes an audit file, and the native rollout backend (Bun only, off in
 * the browser) never writes its shadow dumps or fixtures there; a call here is a bug.
 */
const unavailable = (): never => {
    throw new Error("node:fs is not available in the browser");
};

export function appendFileSync(): never {
    return unavailable();
}

export function mkdirSync(): never {
    return unavailable();
}

export function writeFileSync(): never {
    return unavailable();
}
