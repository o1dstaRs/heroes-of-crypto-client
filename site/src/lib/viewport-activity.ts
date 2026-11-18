interface ActivityDocument {
    readonly hidden: boolean;
    addEventListener(type: "visibilitychange", listener: () => void): void;
    removeEventListener(type: "visibilitychange", listener: () => void): void;
}

/** Keep below-the-fold live widgets quiet until a reader approaches them. */
export function observeViewportActivity(
    element: Element,
    deferred: boolean,
    changed: (active: boolean) => void,
    doc: ActivityDocument = document,
    Observer = globalThis.IntersectionObserver,
): () => void {
    let visible = !deferred || typeof Observer !== "function";
    let active: boolean | undefined;
    let disposed = false;
    const update = () => {
        const next = visible && !doc.hidden;
        if (!disposed && next !== active) {
            active = next;
            changed(next);
        }
    };
    const observer =
        deferred && typeof Observer === "function"
            ? new Observer(
                  ([entry]) => {
                      visible = entry.isIntersecting;
                      update();
                  },
                  { rootMargin: "400px" },
              )
            : undefined;
    observer?.observe(element);
    doc.addEventListener("visibilitychange", update);
    update();
    return () => {
        disposed = true;
        observer?.disconnect();
        doc.removeEventListener("visibilitychange", update);
    };
}
