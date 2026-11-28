/** A hosted Mac window writes the changed keys to storage before notifying the browser stores. */
export const onMacPreferenceChange = (keys: readonly string[], refresh: () => void): void => {
    globalThis.window?.addEventListener?.("hoc:mac-preferences", (event) => {
        const changed: unknown = (event as CustomEvent<unknown>).detail;
        // Older native builds announce changes without listing the keys.
        if (!Array.isArray(changed) || keys.some((key) => changed.includes(key))) refresh();
    });
};
