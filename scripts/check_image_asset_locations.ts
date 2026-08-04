const ALLOWED_IMAGE_PREFIX = "site/public/";
const ALLOWED_IMAGE_PATHS = new Set(["game/core/public/favicon.ico"]);
const IMAGE_FILE = /\.(?:apng|avif|bmp|gif|heic|heif|ico|jpe?g|png|psd|svg|tiff?|webp)$/i;
const ANIMATION_METADATA_FILE = /_meta\.json$/i;

const trackedFilesResult = Bun.spawnSync(["git", "ls-files", "-z"], {
    stdout: "pipe",
    stderr: "pipe",
});

if (trackedFilesResult.exitCode !== 0) {
    const message = new TextDecoder().decode(trackedFilesResult.stderr).trim();
    console.error("Unable to list tracked files: " + message);
    process.exit(2);
}

const trackedFiles = new TextDecoder().decode(trackedFilesResult.stdout).split("\0").filter(Boolean);
const trackedAssets = trackedFiles.filter(
    (filePath) => IMAGE_FILE.test(filePath) || ANIMATION_METADATA_FILE.test(filePath),
);
const misplacedAssets = trackedAssets.filter(
    (filePath) => !filePath.startsWith(ALLOWED_IMAGE_PREFIX) && !ALLOWED_IMAGE_PATHS.has(filePath),
);

if (misplacedAssets.length > 0) {
    console.error("Tracked images and animation metadata are allowed only under site/public.");
    console.error("The sole game exception is game/core/public/favicon.ico.");
    console.error(
        "Move static game art to $HOC_IMAGES_LOC and animation atlases/metadata to $HOC_ANIMATIONS_LOC/output.",
    );
    console.error("Attach review screenshots to the PR or issue instead of committing them.");
    for (const filePath of misplacedAssets) {
        console.error("  - " + filePath);
    }
    process.exit(1);
}

console.log("Game asset location check passed (" + trackedAssets.length + " allowed tracked assets).");
