export const PREVIEW_PLACEMENT_GAME_ID = "preview-placement";

export function isPreviewPlayGameForEnvironment(gameId: string, previewsEnabled: boolean): boolean {
    return previewsEnabled && gameId === PREVIEW_PLACEMENT_GAME_ID;
}

declare const __PROD__: boolean | undefined;

const isProductionBuild =
    typeof __PROD__ === "boolean"
        ? __PROD__
        : (import.meta.env.PROD as unknown) === true || import.meta.env.VITE_IS_PROD === "true";

export const PREVIEW_ROUTES_ENABLED = !isProductionBuild;

export const isPreviewPlayGame = (gameId: string): boolean =>
    isPreviewPlayGameForEnvironment(gameId, PREVIEW_ROUTES_ENABLED);
