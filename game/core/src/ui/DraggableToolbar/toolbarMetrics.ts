import type { IVisibleButton } from "../../scenes/VisibleState";

/** Slots in the complete combat column: Wait, Luck Shield, Next, the AI toggle, attack type and spellbook. */
export const TOOLBAR_FULL_SLOTS = 6;

const CELL_SIZE_PX = 57;
const GAP_PX = 8;

/**
 * How many button slots the fight row reserves. The AI toggle (autobattle) is offered only in the sandbox and the
 * friend co-op sandbox; ranked, lobby and vs-AI scenes never publish it (`isAiToggleAllowed`), so their row drops
 * that slot and the log beneath takes the height. The choice is per scene, never per turn: a button that hides on
 * the opponent's turn stays in the list. Until the scene publishes its buttons the list is empty, and the full
 * column is kept.
 */
export const toolbarSlotCount = (buttons: readonly Pick<IVisibleButton, "name">[]): number =>
    buttons.length > 0 && !buttons.some((button) => button.name === "AI") ? TOOLBAR_FULL_SLOTS - 1 : TOOLBAR_FULL_SLOTS;

/** The column's height for a given screen ratio and slot count. */
export const toolbarColumnHeightForPx = (screenRatio: number, slots: number): number =>
    Math.round(CELL_SIZE_PX * screenRatio * slots + GAP_PX * (slots - 1));

/**
 * The height the sidebar reserves for the combat column.
 *
 * This lives outside the toolbar implementation so placement can reserve the final fight layout without
 * eagerly loading the toolbar's icons, styling, and interaction code.
 */
export const toolbarColumnHeightPx = (slots: number = TOOLBAR_FULL_SLOTS): number =>
    toolbarColumnHeightForPx(Math.min(window.innerWidth / 1366, window.innerHeight / 768), slots);
