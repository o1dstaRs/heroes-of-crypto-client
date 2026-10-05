/** Browser stand-in for the audit path join. Production search does not build that path. */
export function join(...parts: string[]): string {
    return parts.join("/");
}
