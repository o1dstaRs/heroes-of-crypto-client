import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

import { ARENA_MUSIC_PLAYLIST } from "../../core/src/ui/audio/themeMusicTracks";

const output = process.argv[2];
if (!output) throw new Error("Usage: bun scripts/bundle-startup.ts <resources-directory>");

const mac = join(import.meta.dir, "..");
const siteImages = join(mac, "../../site/public/assets/images");
const music = join(output, "Music");
mkdirSync(music, { recursive: true });

copyFileSync(join(siteImages, "home/hero/moonlit_battle_armies_2048x1152.webp"), join(output, "startup-battle.webp"));
copyFileSync(join(siteImages, "home/logo/logo_forged.webp"), join(output, "startup-logo.webp"));
copyFileSync(join(siteImages, "home/modes/ranked.webp"), join(output, "statistics-arena.webp"));
for (const league of ["aspirant", "vanguard", "marshal", "overlord", "demigod"]) {
    const crest = `league_${league}_512.webp`;
    copyFileSync(join(siteImages, "leagues", crest), join(output, crest));
}
copyFileSync(join(mac, "../../site/public/assets/icons/premium.svg"), join(output, "premium.svg"));
copyFileSync(join(mac, "../../site/public/branding/google-sign-in.png"), join(output, "google-sign-in.png"));

const tracks = ARENA_MUSIC_PLAYLIST.map(({ mp3 }) => {
    const filename = basename(mp3);
    copyFileSync(join(mac, "../core/public/audio", filename), join(music, filename));
    return filename;
});

writeFileSync(join(output, "startup-music.json"), JSON.stringify(tracks));
