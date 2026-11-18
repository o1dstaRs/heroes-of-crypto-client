import { expect, test } from "bun:test";
import { verifiedParallelRead } from "./verified-parallel-read";

const deferred = <T>() => Promise.withResolvers<T>();

test("both endpoints start together, but early data is held until access is verified", async () => {
    const access = deferred<boolean>();
    const started: string[] = [];
    let exposed = false;
    const result = verifiedParallelRead(
        () => {
            started.push("account");
            return access.promise;
        },
        async () => {
            started.push("library");
            return "private data";
        },
        new AbortController().signal,
    ).then((value) => {
        exposed = true;
        return value;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(started).toEqual(["account", "library"]);
    expect(exposed).toBe(false);
    access.resolve(true);
    expect(await result).toEqual({ verified: true, value: "private data" });
});

test("a denied account cancels its pending library without publishing data", async () => {
    const access = deferred<boolean>();
    let aborted = false;
    const result = verifiedParallelRead(
        () => access.promise,
        (signal) =>
            new Promise((_resolve, reject) => {
                signal.addEventListener("abort", () => {
                    aborted = true;
                    reject(new Error("aborted"));
                });
            }),
        new AbortController().signal,
    );
    await Promise.resolve();
    access.resolve(false);
    expect(await result).toEqual({ verified: false });
    expect(aborted).toBe(true);
});

test("an early library failure waits for the account verification result", async () => {
    const access = deferred<boolean>();
    const failure = new Error("library unavailable");
    let accountVerified = false;
    const result = verifiedParallelRead(
        async () => {
            accountVerified = await access.promise;
            return accountVerified;
        },
        async () => {
            throw failure;
        },
        new AbortController().signal,
    );
    const checked = result.catch((error: unknown) => error);
    await Promise.resolve();
    await Promise.resolve();
    expect(accountVerified).toBe(false);
    access.resolve(true);
    expect(await checked).toBe(failure);
    expect(accountVerified).toBe(true);
});

test("account switches abort the independent read", async () => {
    const parent = new AbortController();
    const access = deferred<boolean>();
    let librarySignal: AbortSignal | undefined;
    const result = verifiedParallelRead(
        () => access.promise,
        async (signal) => {
            librarySignal = signal;
            return "old account";
        },
        parent.signal,
    );
    const checked = result.catch((error: unknown) => error);
    await Promise.resolve();
    parent.abort();
    access.resolve(true);
    expect(await checked).toBeInstanceOf(Error);
    expect(librarySignal?.aborted).toBe(true);
    const alreadyAborted = verifiedParallelRead(
        async () => {
            throw new Error("must not start");
        },
        async () => "data",
        parent.signal,
    );
    await expect(alreadyAborted).rejects.toThrow();
});

test("a failed verification cancels a pending library and preserves the verification error", async () => {
    const failure = new Error("account unavailable");
    let aborted = false;
    await expect(
        verifiedParallelRead(
            async () => {
                throw failure;
            },
            (signal) =>
                new Promise((_resolve, reject) => {
                    signal.addEventListener("abort", () => {
                        aborted = true;
                        reject(new Error("aborted"));
                    });
                }),
            new AbortController().signal,
        ),
    ).rejects.toBe(failure);
    expect(aborted).toBe(true);
});
