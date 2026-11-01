import type { ThemePlaybackMemory } from "./themeMusicPlayer";
import { ARENA_MUSIC_PLAYLIST, MATCH_MUSIC_PLAYLIST } from "./themeMusicTracks";

export const parseThemePlaybackMemory = (raw: string | null): ThemePlaybackMemory | null => {
    try {
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<Record<keyof ThemePlaybackMemory, unknown>>;
        if (typeof parsed.index !== "number" || !Number.isInteger(parsed.index)) return null;
        if (parsed.index < 0 || parsed.index >= ARENA_MUSIC_PLAYLIST.length) return null;
        if (typeof parsed.time !== "number" || !Number.isFinite(parsed.time) || parsed.time < 0) return null;
        const memory: ThemePlaybackMemory = { index: parsed.index, time: parsed.time };
        if (typeof parsed.matchTime === "number" && Number.isFinite(parsed.matchTime) && parsed.matchTime >= 0) {
            memory.matchTime = parsed.matchTime;
            if (
                typeof parsed.matchIndex === "number" &&
                Number.isInteger(parsed.matchIndex) &&
                parsed.matchIndex >= 0 &&
                parsed.matchIndex < MATCH_MUSIC_PLAYLIST.length
            ) {
                memory.matchIndex = parsed.matchIndex;
            }
        }
        return memory;
    } catch {
        return null;
    }
};
