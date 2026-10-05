import { afterEach, expect, test } from "bun:test";

import {
    installPortraitImageFactoryForTests,
    resetPortraitImageCacheForTests,
    warmDecodedImage,
} from "./decodedImageCache";
import { arePortraitImagesDecoded, decodePortraitImages } from "./portraitImageDecode";

afterEach(resetPortraitImageCacheForTests);

const retainImage = async (src: string) => {
    installPortraitImageFactoryForTests(() => ({
        src: "",
        decoding: "async",
        naturalWidth: 16,
        onload: null,
        onerror: null,
        decode: () => Promise.resolve(),
    }));
    expect(await warmDecodedImage(src)).toBe(true);
};

test("retained complete portrait layers reveal synchronously without another decode", async () => {
    const sources = ["fixture-background", "fixture-cutout"];
    for (const src of sources) await retainImage(src);
    let decodes = 0;
    const images = sources.map((src) => ({
        src,
        complete: true,
        naturalWidth: 16,
        decode: () => {
            decodes += 1;
            return Promise.resolve();
        },
    })) as HTMLImageElement[];
    expect(arePortraitImagesDecoded(images)).toBe(true);
    expect(await decodePortraitImages(images)).toBe(true);
    expect(decodes).toBe(0);
});

test("mounted pixels alone do not bypass decode without a retained bitmap", async () => {
    const layer = deferredImage();
    Object.assign(layer.image, { src: "fixture-cold", complete: true });
    expect(arePortraitImagesDecoded([layer.image])).toBe(false);
    let ready = false;
    const decoding = decodePortraitImages([layer.image]).then((value) => (ready = value));
    await Promise.resolve();
    expect(ready).toBe(false);
    layer.resolve();
    expect(await decoding).toBe(true);
});

test("a retained URL still requires a complete mounted image with pixels", async () => {
    await retainImage("fixture-cached");
    for (const properties of [
        { src: "fixture-cached", complete: false, naturalWidth: 16 },
        { src: "fixture-cached", complete: true, naturalWidth: 0 },
        { src: "", complete: true, naturalWidth: 16 },
    ]) {
        expect(arePortraitImagesDecoded([properties as HTMLImageElement])).toBe(false);
    }
    expect(arePortraitImagesDecoded([])).toBe(false);
});

test("responsive currentSrc must be retained rather than the fallback src", async () => {
    await retainImage("fixture-fallback");
    const image = {
        src: "fixture-fallback",
        currentSrc: "fixture-selected",
        complete: true,
        naturalWidth: 16,
    } as HTMLImageElement;
    expect(arePortraitImagesDecoded([image])).toBe(false);
    await retainImage("fixture-selected");
    expect(arePortraitImagesDecoded([image])).toBe(true);
});

test("an aborted cached portrait cannot reveal", async () => {
    await retainImage("fixture-cached");
    const controller = new AbortController();
    controller.abort();
    const image = { src: "fixture-cached", complete: true, naturalWidth: 16 } as HTMLImageElement;
    expect(await decodePortraitImages([image], controller.signal)).toBe(false);
});

const deferredImage = () => {
    let resolve!: () => void;
    let reject!: () => void;
    const promise = new Promise<void>((done, fail) => {
        resolve = done;
        reject = () => fail(new Error("failed image"));
    });
    const image = { naturalWidth: 16, decode: () => promise } as HTMLImageElement;
    return { image, resolve, reject };
};

test("the portrait waits for both mounted layers, regardless of which decodes first", async () => {
    for (const first of [0, 1]) {
        const layers = [deferredImage(), deferredImage()];
        let finished = false;
        const ready = decodePortraitImages(layers.map(({ image }) => image)).then((value) => {
            finished = true;
            return value;
        });
        layers[first].resolve();
        await Promise.resolve();
        await Promise.resolve();
        expect(finished).toBe(false);
        layers[1 - first].resolve();
        expect(await ready).toBe(true);
    }
});

test("a failed cutout never releases the background alone", async () => {
    const background = deferredImage();
    const cutout = deferredImage();
    const ready = decodePortraitImages([background.image, cutout.image]);
    background.resolve();
    cutout.reject();
    expect(await ready).toBe(false);
});

test("empty compositions and images without decoded pixels are not ready", async () => {
    expect(await decodePortraitImages([])).toBe(false);
    const image = deferredImage();
    Object.defineProperty(image.image, "naturalWidth", { value: 0 });
    const ready = decodePortraitImages([image.image]);
    image.resolve();
    expect(await ready).toBe(false);
});

const loadImage = (complete = false, naturalWidth = 0) => {
    const target = new EventTarget();
    const active = new Set<EventListenerOrEventListenerObject>();
    const image = {
        complete,
        naturalWidth,
        addEventListener: (event: string, listener: EventListenerOrEventListenerObject) => {
            active.add(listener);
            target.addEventListener(event, listener);
        },
        removeEventListener: (event: string, listener: EventListenerOrEventListenerObject) => {
            active.delete(listener);
            target.removeEventListener(event, listener);
        },
    } as unknown as HTMLImageElement;
    return { image, target, active };
};

test("without decode(), loading waits and removes both listeners on completion", async () => {
    const { image, target, active } = loadImage();
    const ready = decodePortraitImages([image]);
    expect(active.size).toBe(1);
    Object.defineProperty(image, "naturalWidth", { value: 16 });
    target.dispatchEvent(new Event("load"));
    expect(await ready).toBe(true);
    expect(active.size).toBe(0);
});

test("without decode(), cached loads and errors settle without exposing broken images", async () => {
    const cached = loadImage(true, 16);
    expect(await decodePortraitImages([cached.image])).toBe(true);
    expect(cached.active.size).toBe(0);
    const broken = loadImage();
    const ready = decodePortraitImages([broken.image]);
    broken.target.dispatchEvent(new Event("error"));
    expect(await ready).toBe(false);
    expect(broken.active.size).toBe(0);
});

test("unmount aborts pending load listeners and cannot reveal the old request", async () => {
    const controller = new AbortController();
    const pending = loadImage();
    const ready = decodePortraitImages([pending.image], controller.signal);
    expect(pending.active.size).toBe(1);
    controller.abort();
    expect(pending.active.size).toBe(0);
    expect(await ready).toBe(false);
    expect(await decodePortraitImages([pending.image], controller.signal)).toBe(false);
});
