import { SpellHelper } from "@heroesofcrypto/common";

/**
 * The texture key for a spell's book icon.
 *
 * By default a spell's icon is named after the spell (`spellToTextureName`), and that is all the art a new
 * spell needs — the name beside it is drawn as text, not as a pre-baked strip. Cards remain selectable
 * while icons load. Keep the published asset catalog complete so every card receives its intended art.
 *
 * Two kinds of entry live here:
 *   • a spell whose shipped art is a GENERATED key rather than the plain name (Fire Strike, Meteorite);
 *   • a spell whose own art has not been drawn yet, standing in with its closest cousin so the spell is
 *     playable meanwhile. Delete such an entry the moment the real icon lands in the art Drive — leaving it
 *     would keep the placeholder forever.
 */
const SPELL_ICON_KEYS: Readonly<Record<string, string>> = {
    "Fire Strike": "fire_strike_chaos_256_v1",
    Meteorite: "meteorite_chaos_256_v1",
};

export const spellIconTextureKey = (spellName: string): string =>
    SPELL_ICON_KEYS[spellName] ?? SpellHelper.spellToTextureName(spellName);

export const SPELL_BOOK_FURNITURE = {
    cell: "spell_cell_260",
    scrollBadge: "spell_cast_wax_seal_blank_v1",
    innerFrame: "spell_inner_frame_linework_v2",
    stackRail: "spell_stack_rail_variant2",
    stackFillGreen: "spell_stack_fill_green_variant2",
    stackFillRed: "spell_stack_fill_red_variant2",
} as const;

export const spellBookTextureKeys = (spellNames: readonly string[]): string[] => [
    ...new Set([...Object.values(SPELL_BOOK_FURNITURE), ...spellNames.map(spellIconTextureKey)]),
];

/** Spells drawn with a stand-in icon, so a missing-art audit can find them. Empty is the healthy state. */
export const SPELLS_AWAITING_OWN_ICON: readonly string[] = [];
