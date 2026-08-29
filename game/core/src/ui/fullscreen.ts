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

/** CSS can react to this even if React receives the fullscreen event late. */
export const FULLSCREEN_PRESENTATION_ATTRIBUTE = "data-hoc-fullscreen-active";

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

export const FULLSCREEN_BROWSER_CHROME_TOLERANCE_PX = 24;

/**
 * Browser-level fullscreen (for example F11) does not populate `document.fullscreenElement`. Its reliable
 * observable signal is that the page viewport fills the browser window because the tab/address bars are gone.
 */
export const viewportFillsBrowserWindow = (
    innerHeight: number,
    outerHeight: number,
    tolerance = FULLSCREEN_BROWSER_CHROME_TOLERANCE_PX,
): boolean => innerHeight > 0 && outerHeight > 0 && Math.abs(outerHeight - innerHeight) <= Math.max(0, tolerance);

/** Covers both HTML Fullscreen API and browser-level fullscreen presentation. */
export const isFullscreenPresentationActive = (): boolean =>
    isFullscreenActive() || viewportFillsBrowserWindow(window.innerHeight, window.outerHeight);

/** Mirror the browser state onto <html>, giving fullscreen-only layout a synchronous CSS hook. */
export const syncFullscreenPresentationAttribute = (): boolean => {
    const active = isFullscreenPresentationActive();
    if (active) {
        document.documentElement.setAttribute(FULLSCREEN_PRESENTATION_ATTRIBUTE, "true");
    } else {
        document.documentElement.removeAttribute(FULLSCREEN_PRESENTATION_ATTRIBUTE);
    }
    return active;
};

const setFullscreenPresentationAttribute = (active: boolean): void => {
    if (active) {
        document.documentElement.setAttribute(FULLSCREEN_PRESENTATION_ATTRIBUTE, "true");
    } else {
        document.documentElement.removeAttribute(FULLSCREEN_PRESENTATION_ATTRIBUTE);
    }
};

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
            setFullscreenPresentationAttribute(false);
            const exit =
                doc.exitFullscreen?.bind(doc) ??
                doc.webkitExitFullscreen?.bind(doc) ??
                doc.mozCancelFullScreen?.bind(doc) ??
                doc.msExitFullscreen?.bind(doc);
            void Promise.resolve(exit?.())
                .then(syncFullscreenPresentationAttribute)
                .catch(syncFullscreenPresentationAttribute);
            return;
        }
        const root = document.documentElement as PrefixedElement;
        const request =
            root.requestFullscreen?.bind(root) ??
            root.webkitRequestFullscreen?.bind(root) ??
            root.mozRequestFullScreen?.bind(root) ??
            root.msRequestFullscreen?.bind(root);
        // Apply compact fullscreen layout on the click itself. The resolved browser state then confirms it
        // or removes it again if fullscreen was refused.
        setFullscreenPresentationAttribute(true);
        void Promise.resolve(request?.())
            .then(syncFullscreenPresentationAttribute)
            .catch(syncFullscreenPresentationAttribute);
    } catch {
        syncFullscreenPresentationAttribute();
    }
};
