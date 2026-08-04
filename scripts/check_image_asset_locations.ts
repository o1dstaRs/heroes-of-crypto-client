const ALLOWED_IMAGE_PREFIX = "site/public/";
const ALLOWED_IMAGE_PATHS = new Set(["game/core/public/favicon.ico"]);
const IMAGE_FILE = /\.(?:apng|avif|bmp|gif|heic|heif|ico|jpe?g|png|psd|svg|tiff?|webp)$/i;

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
const trackedImages = trackedFiles.filter((filePath) => IMAGE_FILE.test(filePath));
const misplacedImages = trackedImages.filter(
    (filePath) => !filePath.startsWith(ALLOWED_IMAGE_PREFIX) && !ALLOWED_IMAGE_PATHS.has(filePath),
);

if (misplacedImages.length > 0) {
    console.error("Tracked images are allowed only under site/public.");
    console.error("The sole game exception is game/core/public/favicon.ico.");
    console.error("Move game runtime art to $HOC_IMAGES_LOC as compressed WebP and use the generated image map.");
    console.error("Attach review screenshots to the PR or issue instead of committing them.");
    for (const filePath of misplacedImages) {
        console.error("  - " + filePath);
    }
    process.exit(1);
}

console.log("Image asset location check passed (" + trackedImages.length + " allowed images).");
