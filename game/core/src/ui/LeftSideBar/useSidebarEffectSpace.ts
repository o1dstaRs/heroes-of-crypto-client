import * as React from "react";

export function fitSidebarBuffRows(rowHeight: number, available: number): number {
    return rowHeight * Math.max(1, Math.min(2, Math.floor((available + 0.5) / rowHeight)));
}

/** Keep the effect wells above the live footer, including its optional More Time button. */
export function useSidebarEffectSpace(rowHeight: number, gap: number, creature: string) {
    const effectsRef = React.useRef<HTMLDivElement>(null);
    const debuffEndRef = React.useRef<HTMLDivElement>(null);
    const [buffHeight, setBuffHeight] = React.useState(rowHeight);

    React.useLayoutEffect(() => {
        const effects = effectsRef.current;
        const debuffEnd = debuffEndRef.current;
        const sidebar = effects?.closest(".Sidebar");
        const footer = sidebar?.querySelector<HTMLElement>("[data-sidebar-footer]");
        if (!effects || !debuffEnd || !sidebar || !footer) return;
        let frame: number | undefined;
        const measure = () => {
            frame = undefined;
            const bounds = effects.getBoundingClientRect();
            const scale = bounds.width / effects.offsetWidth;
            if (!Number.isFinite(scale) || scale <= 0) return;
            const maxHeight = Math.max(0, (footer.getBoundingClientRect().top - bounds.top) / scale - gap);
            const fixedHeight =
                (debuffEnd.parentElement!.getBoundingClientRect().bottom - bounds.top) / scale - buffHeight;
            const nextHeight = fitSidebarBuffRows(rowHeight, maxHeight - fixedHeight);
            // Keep a complete minimum row in natural layout: useFitScale can then fit the card
            // above the footer instead of clipping the last debuff row on short windows.
            setBuffHeight((current) => (Math.abs(current - nextHeight) < 0.5 ? current : nextHeight));
        };
        const schedule = () => {
            if (frame === undefined) frame = requestAnimationFrame(measure);
        };
        const observer = new ResizeObserver(schedule);
        observer.observe(sidebar);
        observer.observe(footer);
        observer.observe(effects);
        // CSS fit transforms do not resize the observed layout boxes.
        const card = effects.closest(".SidebarCard");
        card?.addEventListener("transitionend", schedule);
        measure();
        return () => {
            observer.disconnect();
            card?.removeEventListener("transitionend", schedule);
            if (frame !== undefined) cancelAnimationFrame(frame);
        };
    }, [rowHeight, gap, creature, buffHeight]);

    return { effectsRef, debuffEndRef, buffHeight };
}
