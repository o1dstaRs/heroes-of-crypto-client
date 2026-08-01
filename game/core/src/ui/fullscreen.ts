/**
 * One place that knows how to ask a browser about fullscreen.
 *
 * The toggle used to read `document.fullscreenElement` and call `document.exitFullscreen()` directly. Where
 * a browser keeps that state under a vendor prefix, the read comes back null while the page IS fullscreen —
 * so the toggle concluded it was windowed and requested fullscreen again. Entering worked, leaving never
 * did, and the icon stayed on "expand" the whole time. Everything here checks the prefixed spellings
 * alongside the standard one, so the answer is right on every engine and wrong on none.
 */

type PrefixedDocument = Document & {
    webkitFullscreenElement?: Element | null;
    webkitExitFullscreen?: () => Promise<void> | void;
    mozFullScreenElement?: Element | null;
    mozCancelFullScreen?: () => Promise<void> | void;
    msFullscreenElement?: Element | null;
    msExitFullscreen?: () => Promise<void> | void;
};

type PrefixedElement = HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
    mozRequestFullScreen?: () => Promise<void> | void;
    msRequestFullscreen?: () => Promise<void> | void;
};

/** Every event name a browser might use to announce the change, so the icon tracks the real state. */
const CHANGE_EVENTS = ["fullscreenchange", "webkitfullscreenchange", "mozfullscreenchange", "MSFullscreenChange"];

export const getFullscreenElement = (): Element | null => {
    const doc = document as PrefixedDocument;
    return (
        doc.fullscreenElement ??
        doc.webkitFullscreenElement ??
        doc.mozFullScreenElement ??
        doc.msFullscreenElement ??
        null
    );
};

export const isFullscreenActive = (): boolean => getFullscreenElement() !== null;

/** Subscribe to fullscreen changes. Returns the unsubscribe. */
export const onFullscreenChange = (handler: () => void): (() => void) => {
    for (const event of CHANGE_EVENTS) {
        document.addEventListener(event, handler);
    }
    return () => {
        for (const event of CHANGE_EVENTS) {
            document.removeEventListener(event, handler);
        }
    };
};

/**
 * Enter fullscreen if windowed, leave it if not. Failures are swallowed: a browser that refuses the request
 * (no user gesture, embedded frame, policy) has nothing useful to report to a player mid-fight.
 */
export const toggleFullscreen = (): void => {
    const doc = document as PrefixedDocument;
    try {
        if (isFullscreenActive()) {
            const exit =
                doc.exitFullscreen?.bind(doc) ??
                doc.webkitExitFullscreen?.bind(doc) ??
                doc.mozCancelFullScreen?.bind(doc) ??
                doc.msExitFullscreen?.bind(doc);
            void Promise.resolve(exit?.()).catch(() => undefined);
            return;
        }
        const root = document.documentElement as PrefixedElement;
        const request =
            root.requestFullscreen?.bind(root) ??
            root.webkitRequestFullscreen?.bind(root) ??
            root.mozRequestFullScreen?.bind(root) ??
            root.msRequestFullscreen?.bind(root);
        void Promise.resolve(request?.()).catch(() => undefined);
    } catch {
        /* fullscreen unsupported — leave the window as it is */
    }
};
