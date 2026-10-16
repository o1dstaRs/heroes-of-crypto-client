/**
 * Browser stand-in for the imitation-learning dataset fingerprint. The sealed A19 profile never writes
 * that dataset, but importing it hashes its feature names immediately, so this has to succeed.
 */

const SHA256_K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98,
    0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8,
    0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
    0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
    0xc67178f2,
]);

const rotateRight = (value: number, bits: number): number => (value >>> bits) | (value << (32 - bits));

function sha256(bytes: Uint8Array): Uint8Array {
    const bitLength = bytes.length * 8;
    const withMarker = bytes.length + 1;
    const zeroPad = (56 - (withMarker % 64) + 64) % 64;
    const padded = new Uint8Array(bytes.length + 1 + zeroPad + 8);
    padded.set(bytes);
    padded[bytes.length] = 0x80;
    const view = new DataView(padded.buffer);
    view.setUint32(padded.length - 8, Math.floor(bitLength / 0x100000000));
    view.setUint32(padded.length - 4, bitLength >>> 0);

    let h0 = 0x6a09e667;
    let h1 = 0xbb67ae85;
    let h2 = 0x3c6ef372;
    let h3 = 0xa54ff53a;
    let h4 = 0x510e527f;
    let h5 = 0x9b05688c;
    let h6 = 0x1f83d9ab;
    let h7 = 0x5be0cd19;
    const words = new Uint32Array(64);

    for (let offset = 0; offset < padded.length; offset += 64) {
        for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4);
        for (let index = 16; index < 64; index += 1) {
            const earlier = words[index - 15];
            const recent = words[index - 2];
            const small = (rotateRight(earlier, 7) ^ rotateRight(earlier, 18) ^ (earlier >>> 3)) >>> 0;
            const large = (rotateRight(recent, 17) ^ rotateRight(recent, 19) ^ (recent >>> 10)) >>> 0;
            words[index] = (words[index - 16] + small + words[index - 7] + large) >>> 0;
        }

        let a = h0;
        let b = h1;
        let c = h2;
        let d = h3;
        let e = h4;
        let f = h5;
        let g = h6;
        let h = h7;
        for (let index = 0; index < 64; index += 1) {
            const upper = (rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25)) >>> 0;
            const choose = ((e & f) ^ (~e & g)) >>> 0;
            const first = (h + upper + choose + SHA256_K[index] + words[index]) >>> 0;
            const lower = (rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22)) >>> 0;
            const majority = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
            const second = (lower + majority) >>> 0;
            h = g;
            g = f;
            f = e;
            e = (d + first) >>> 0;
            d = c;
            c = b;
            b = a;
            a = (first + second) >>> 0;
        }

        h0 = (h0 + a) >>> 0;
        h1 = (h1 + b) >>> 0;
        h2 = (h2 + c) >>> 0;
        h3 = (h3 + d) >>> 0;
        h4 = (h4 + e) >>> 0;
        h5 = (h5 + f) >>> 0;
        h6 = (h6 + g) >>> 0;
        h7 = (h7 + h) >>> 0;
    }

    const digest = new Uint8Array(32);
    const digestView = new DataView(digest.buffer);
    [h0, h1, h2, h3, h4, h5, h6, h7].forEach((word, index) => digestView.setUint32(index * 4, word));
    return digest;
}

function asBytes(data: string | Uint8Array): Uint8Array {
    return typeof data === "string" ? new TextEncoder().encode(data) : data;
}

/** Sync SHA-256, matching `node:crypto`'s `createHash("sha256").update(text).digest("hex")`. */
export function createHash(algorithm: string): {
    update(data: string | Uint8Array): ReturnType<typeof createHash>;
    digest(encoding: "hex"): string;
} {
    if (algorithm !== "sha256") {
        throw new Error(`node:crypto shim only supports sha256, got ${algorithm}`);
    }
    const chunks: Uint8Array[] = [];
    const hash = {
        update(data: string | Uint8Array) {
            chunks.push(asBytes(data));
            return hash;
        },
        digest(encoding: "hex") {
            if (encoding !== "hex") {
                throw new Error("node:crypto shim only supports digest('hex')");
            }
            const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
            const bytes = new Uint8Array(total);
            let offset = 0;
            for (const chunk of chunks) {
                bytes.set(chunk, offset);
                offset += chunk.length;
            }
            return [...sha256(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
        },
    };
    return hash;
}
