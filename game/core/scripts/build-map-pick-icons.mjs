import sharp from "/Users/pro/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp/lib/index.js";
import { fileURLToPath } from "node:url";

const images = new URL("../images/", import.meta.url);
const imagePath = (name) => fileURLToPath(new URL(name, images));
const crop = { left: 768, top: 768, width: 512, height: 512 };

await sharp(imagePath("background_stone_tiles.webp"))
  .extract(crop)
  .webp({ quality: 92 })
  .toFile(imagePath("map_pick_normal_4x4.webp"));

await sharp(imagePath("background_stone_tiles_lava.webp"))
  .extract(crop)
  .webp({ quality: 92 })
  .toFile(imagePath("map_pick_lava_4x4.webp"));

const tombstone = await sharp(imagePath("tombstone_tiles_256_atlas.webp"))
  .extract({ left: 0, top: 0, width: 256, height: 256 })
  .resize({ width: 390, height: 390, fit: "contain" })
  .png()
  .toBuffer();

await sharp(imagePath("background_stone_tiles.webp"))
  .extract(crop)
  .modulate({ brightness: 0.72, saturation: 0.68 })
  .composite([{ input: tombstone, gravity: "centre" }])
  .webp({ quality: 92 })
  .toFile(imagePath("map_pick_cemetery_4x4.webp"));
