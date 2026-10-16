/** Browser stand-in. Production search never writes an audit file; a call here is a bug. */
export function appendFileSync(): never {
    throw new Error("node:fs is not available in the browser");
}
