import { hocTooltipSx } from "../hocTheme";

/**
 * The sidebar's tooltip look: dark wood, gold border, parchment text.
 *
 * It is no longer the sidebar's alone — `hocJoyTheme` gives every Tooltip in the app the same chrome, since
 * the ones that carried no style of their own were opening as white slabs under Joy's stock light palette.
 * This alias stays for the call sites that pass it explicitly; it is the very same object, so the two can
 * no longer drift apart.
 */
export const commonTooltipSx = hocTooltipSx;
