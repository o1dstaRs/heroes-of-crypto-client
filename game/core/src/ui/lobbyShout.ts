export const lobbyShoutCooldownLabel = (nextAllowedAt: number, now: number = Date.now()): string => {
    const remainingMs = Math.max(0, nextAllowedAt - now);
    if (remainingMs <= 0) {
        return "";
    }
    const minutes = Math.ceil(remainingMs / 60_000);
    if (minutes < 60) {
        return `${minutes}m`;
    }
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
};
