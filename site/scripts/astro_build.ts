import { fileURLToPath } from "node:url";
import { prepareBuildEnvironment } from "../../scripts/build_environment";

const mode = process.argv[2] ?? "production";
if (!["production", "test"].includes(mode)) throw new Error(`Unsupported site build mode: ${mode}`);
prepareBuildEnvironment(process.env);

const { build } = await import("astro");
await build({ root: fileURLToPath(new URL("../", import.meta.url)), mode });
