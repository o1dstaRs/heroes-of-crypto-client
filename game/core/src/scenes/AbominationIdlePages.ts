import type { ArbalesterIdlePage, ArbalesterIdlePages } from "./ArbalesterIdlePager";

/** Native pages preserve 768px artwork without exceeding the board's texture limit. */
export function abominationIdlePages(meta: unknown): ArbalesterIdlePages | undefined {
    if (!meta || typeof meta !== "object") return;
    const value = meta as Record<string, unknown>;
    if (value.frameWidth !== 768 || value.frameHeight !== 768 || !Number.isInteger(value.frameCount)) return;
    if (!Array.isArray(value.pages) || !value.pages.length) return;
    let expected = 0;
    const pages: ArbalesterIdlePage[] = [];
    for (const raw of value.pages) {
        if (!raw || typeof raw !== "object") return;
        const page = raw as ArbalesterIdlePage;
        if (
            !/^abomination_lab_idle_page_\d{2}_atlas$/.test(page.imageKey) ||
            page.firstFrame !== expected ||
            ![page.frameCount, page.cols, page.rows].every((n) => Number.isInteger(n) && n > 0) ||
            page.frameCount > page.cols * page.rows ||
            page.width !== page.cols * 768 ||
            page.height !== page.rows * 768 ||
            page.width > 4096 ||
            page.height > 4096
        )
            return;
        pages.push({ ...page });
        expected += page.frameCount;
    }
    if (expected !== value.frameCount || new Set(pages.map((page) => page.imageKey)).size !== pages.length) return;
    const durations = value.frameDurationsMs;
    if (
        !Array.isArray(durations) ||
        durations.length !== expected ||
        !durations.every((n) => Number.isFinite(n) && n > 0)
    )
        return;
    return { frameWidth: 768, frameHeight: 768, frameCount: expected, durations: [...durations], pages };
}
