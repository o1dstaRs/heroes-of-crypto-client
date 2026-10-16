import { SpellHelper } from "@heroesofcrypto/common";

/**
 * The texture key for a spell's book icon.
 *
 * By default a spell's icon is named after the spell (`spellToTextureName`), and that is all the art a new
 * spell needs — the name beside it is drawn as text, not as a pre-baked strip. But a MISSING icon is not a
 * missing picture: the spell card cannot be built without its texture, so the spell vanishes from the book
 * without a word. That is how the Wandering Mage once shipped with an empty spellbook, which is why this
 * mapping is one documented place rather than a conditional repeated at each call site.
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

/** Spells drawn with a stand-in icon, so a missing-art audit can find them. Empty is the healthy state. */
export const SPELLS_AWAITING_OWN_ICON: readonly string[] = [];
