import type { ThemeTrack } from "./themeMusicPlayer";

export const ARENA_MUSIC_PLAYLIST: readonly ThemeTrack[] = [
    { webm: "/audio/the_besieged_town.webm", mp3: "/audio/the_besieged_town.mp3" },
    { webm: "/audio/the_last_stand.webm", mp3: "/audio/the_last_stand.mp3" },
    { webm: "/audio/the_stone_lullaby.webm", mp3: "/audio/the_stone_lullaby.mp3" },
];

export const MATCH_MUSIC_PLAYLIST: readonly ThemeTrack[] = [
    { webm: "/audio/iron_and_silk.webm", mp3: "/audio/iron_and_silk.mp3" },
    ARENA_MUSIC_PLAYLIST[1],
];
