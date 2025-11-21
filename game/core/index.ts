export {};

const DIST_DIR = "./dist";
const PORT = 8080;

// 1. Check for "--public" argument
const isPublic = process.argv.includes("--public");
const hostname = isPublic ? "0.0.0.0" : "localhost";

// 2. Find Favicon Once (Sync/Startup)
let faviconFilename = "favicon.ico";
try {
    const glob = new Bun.Glob("favicon*.ico");
    for await (const file of glob.scan(DIST_DIR)) {
        faviconFilename = file;
        break;
    }
} catch (e) {}

console.log(`🚀 Server running at http://${isPublic ? "0.0.0.0" : "localhost"}:${PORT}`);
if (isPublic) {
    console.log(`   Make sure to allow port ${PORT} in your firewall if needed.`);
}

// 3. Standalone Server
Bun.serve({
    port: PORT,
    hostname: hostname, // <--- Dynamic hostname
    async fetch(req) {
        const url = new URL(req.url);
        let pathname = url.pathname;

        // Default to index.html
        if (pathname === "/" || pathname === "") {
            pathname = "/index.html";
        }

        // Serve Favicon
        if (pathname === "/favicon.ico") {
            pathname = "/" + faviconFilename;
        }

        // Construct Path
        const cleanPath = pathname.startsWith("/") ? pathname.slice(1) : pathname;
        const filePath = `${DIST_DIR}/${cleanPath}`;
        const file = Bun.file(filePath);

        if (await file.exists()) {
            return new Response(file);
        }

        return new Response("Not found", { status: 404 });
    },
    error(err) {
        console.error("🔥 Server Error:", err);
        return new Response("Server Error", { status: 500 });
    },
});
