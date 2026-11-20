export const isPortraitContourPreview = (): boolean =>
    !!import.meta.env.DEV &&
    typeof window !== "undefined" &&
    window.location.pathname === "/preview/picks/level2" &&
    new URLSearchParams(window.location.search).get("portraitContours") === "1";
