import React, { useLayoutEffect, useRef, useState } from "react";

import { arePortraitImagesDecoded, decodePortraitImages } from "./portraitImageDecode";

interface PortraitLayers {
    key: string;
    children: React.ReactNode;
}

const MountedPortraitLayers = ({
    visible,
    requested,
    onReady,
    children,
}: {
    visible: boolean;
    requested: boolean;
    onReady: () => void;
    children: React.ReactNode;
}) => {
    const root = useRef<HTMLDivElement>(null);
    const [decoded, setDecoded] = useState(false);
    const readyCallback = useRef(onReady);
    useLayoutEffect(() => {
        readyCallback.current = onReady;
    }, [onReady]);
    useLayoutEffect(() => {
        // A rapid return can request an already-decoded held layer before the pending swap commits.
        // Re-promote it without decoding again, and never promote a layer that is only being held.
        if (decoded && requested) readyCallback.current();
    }, [decoded, requested]);
    useLayoutEffect(() => {
        const element = root.current;
        if (!element) return;
        const controller = new AbortController();
        const images = Array.from(element.querySelectorAll<HTMLImageElement>("img[data-portrait-critical]"));
        if (arePortraitImagesDecoded(images)) {
            setDecoded(true);
            return;
        }
        void decodePortraitImages(images, controller.signal).then((ready) => {
            if (ready && !controller.signal.aborted) setDecoded(true);
        });
        return () => {
            controller.abort();
        };
    }, []);

    return (
        <div
            ref={root}
            data-portrait-layers={visible ? "ready" : "loading"}
            aria-hidden={visible ? undefined : true}
            style={{ position: "absolute", inset: 0, visibility: visible ? "visible" : "hidden" }}
        >
            {children}
        </div>
    );
};

/** Keep the last complete portrait until the next mounted cutout and background have both decoded. */
export const DecodedPortraitLayers = ({
    portraitKey,
    children,
}: {
    portraitKey: string;
    children: React.ReactNode;
}) => {
    const [displayedKey, setDisplayedKey] = useState<string>();
    const held = useRef<PortraitLayers>(undefined);
    // Keep live crop and animation changes in the held composition too, without re-decoding its images.
    useLayoutEffect(() => {
        if (displayedKey === portraitKey) held.current = { key: portraitKey, children };
    }, [displayedKey, portraitKey, children]);
    const current = { key: portraitKey, children };
    const layers = held.current && displayedKey !== portraitKey ? [held.current, current] : [current];

    return layers.map((layer) => (
        <MountedPortraitLayers
            key={layer.key}
            visible={displayedKey === layer.key}
            requested={portraitKey === layer.key}
            onReady={() => {
                held.current = layer;
                setDisplayedKey(layer.key);
            }}
        >
            {layer.children}
        </MountedPortraitLayers>
    ));
};
