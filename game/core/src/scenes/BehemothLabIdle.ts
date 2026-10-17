// Grounded idle only: no windup, chest contact, withdrawal or return-to-ground cels.
export const BEHEMOTH_IDLE_FRAME_COUNT = 32;
export const BEHEMOTH_IDLE_FRAME_MS = 100 / 1.4 / 1.3 / 1.2;
export const BEHEMOTH_IDLE_PERIOD_MS = BEHEMOTH_IDLE_FRAME_COUNT * BEHEMOTH_IDLE_FRAME_MS;
export const BEHEMOTH_IDLE_CHEST_CONTACTS_MS: readonly number[] = [];
export function behemothIdleFrame(elapsedMs: number): number {
    const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
    return Math.floor(elapsed / BEHEMOTH_IDLE_FRAME_MS + 1e-9) % BEHEMOTH_IDLE_FRAME_COUNT;
}
