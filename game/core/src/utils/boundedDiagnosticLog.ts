export const MAX_DIAGNOSTIC_LOG_LINES = 2_000;

/** Keep browser-only diagnostic history useful without retaining an entire long-running session. */
export function appendBoundedDiagnosticLine(lines: string[], line: string, maxLines = MAX_DIAGNOSTIC_LOG_LINES): void {
    const safeMaxLines = Math.max(1, Math.floor(maxLines));
    if (lines.length >= safeMaxLines) {
        lines.splice(0, lines.length - safeMaxLines + 1);
    }
    lines.push(line);
}
