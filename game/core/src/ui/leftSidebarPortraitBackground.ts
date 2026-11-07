import { creaturePortraitBackgroundShadeAlpha, resolveCreaturePortraitBackground } from "./creaturePortraitBackground";

/** Cards and animated sidebars retain the faction backgrounds selected on main. */
export const resolveLeftSidebarPortraitBackground = resolveCreaturePortraitBackground;
export const leftSidebarPortraitBackgroundShadeAlpha = creaturePortraitBackgroundShadeAlpha;
