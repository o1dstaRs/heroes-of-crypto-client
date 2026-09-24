import type { NoteLanguage } from "./format";
import type { Unit } from "../units-data";

/** Spells and abilities the Empower bonuses raise (common EMPOWERED_MAGIC_ABILITIES + damage spells). */
export const MAGIC_DAMAGE_SPELLS = new Set([
    ...["Fire Strike", "Fireball", "Meteorite", "Lightning Strike", "Ring of Fire", "Meteor Shower"],
    ...["Fire Wall", "Fireforged Sword"],
]);

/** Buffs Tome of Amplification strengthens, as its note lists them. */
const TOME_BUFF_SPELLS = new Set(["Riot", "Spiritual Armor", "Magic Mirror", "Empower", "Fireforged Sword", "Helping Hand"]);
const NEVER_ANSWERED_ABILITIES = ["Shadow Touch", "Lightning Spin"];
const NO_ABILITY_POWER_SYNERGY = new Set(["Magic Reflection", "Guiding Winds Aura", "Sylvan Focus Aura"]);

/**
 * What beats a unit and what makes it better, derived from its traits (shooter, flyer, caster, aura,
 * Mechanism…). Every clause restates a mechanic from its own verified entry; nothing here is new.
 */
export function unitCounterLines(unit: Unit, language: NoteLanguage): string[] {
    const isRu = language === "ru";
    const names = unit.abilities.map((ability) => ability.name);
    const has = (name: string): boolean => names.includes(name);
    const spells = [...new Set(unit.spells.map((entry) => entry.replace(/^[^:]+:/, "")))];
    const lines: string[] = [];
    if (unit.rangeShots > 0 && unit.attackType === "RANGE") {
        const melee = has("No Melee")
            ? ""
            : has("Handyman")
            ? isRu
                ? "Handyman: в ближнем бою бьёт в полную силу (другие стрелки — вполсилы)."
                : "Handyman: it hits at full strength in melee (other shooters deal half)."
            : isRu
              ? "В ближнем бою бьёт вполсилы."
              : "In melee it deals half damage.";
        lines.push(
            isRu
                ? `Стрелок: враг в любой соседней клетке не даёт ему стрелять; Range Null Field Aura (Griffin) запрещает ему стрелять и отвечать выстрелом в радиусе 2 клеток, а Rangebane — на круг; Smoke вдвое ослабляет его выстрелы${has("Sniper") ? " (и со Sniper)" : ""}; Arrows Wingshield Blessing (Angel) даёт армии соперника броню против выстрелов; большинство выстрелов по Abomination (Dense Flesh) стоят 2 стрелы.${has("Sniper") ? " Способность Sniper отменяет штраф за дальность." : ""}${melee ? ` ${melee}` : ""} Помогают: апгрейд «Стрельба» и Farsight Quiver удлиняют полосы дальности, Hunter's Longbow даёт атаку за каждый стек стрелков в армии, Guiding Winds (Dryad) позволяет стрелять дальше.`
                : `Shooter: an enemy in any touching cell stops it shooting; Range Null Field Aura (Griffin) stops it shooting or shooting back within 2 cells, and Rangebane for a lap; Smoke halves its shots${has("Sniper") ? " (Sniper shots too)" : ""}; Arrows Wingshield Blessing (Angel) armors the enemy army against shots; most shots at an Abomination (Dense Flesh) cost 2 arrows.${has("Sniper") ? " Its Sniper ability ignores range falloff." : ""}${melee ? ` ${melee}` : ""} Helpers: the Sniper augment and Farsight Quiver lengthen its range bands, Hunter's Longbow adds attack per ranged stack in your army, Guiding Winds (Dryad) lets it shoot farther.`,
        );
    }
    if (unit.movementType === "FLY") {
        const windFlow =
            unit.magicResist >= 100
                ? ""
                : isRu
                  ? "; Wind Flow (Valkyrie) даёт всем летающим +4 к броне и −4 к движению на 3 круга"
                  : "; Wind Flow (Valkyrie) gives every flyer +4 armor and −4 movement for 3 laps";
        lines.push(
            isRu
                ? `Летающий: Web Aura (Arachna Queen) не даёт ему двигаться, если ход начинается в радиусе 2 клеток от неё; Hamstring (Dryad) может отнять 30% движения на 3 хода${windFlow}. Помогает синергия Природы «Броня летающих»: +15/24/35% брони в любой армии.`
                : `Flyer: Web Aura (Arachna Queen) keeps it from moving on a turn it starts within 2 cells of her; Hamstring (Dryad) can take 30% of its movement for 3 turns${windFlow}. Helper: Nature's Flying Armor synergy gives it +15/24/35% armor in any army.`,
        );
    }
    const neverAnswered = NEVER_ANSWERED_ABILITIES.filter(has);
    if (neverAnswered.length) {
        lines.push(
            isRu
                ? `На атаки с ${neverAnswered.join(" и ")} не отвечают: он обменивается ударами без ответного урона.`
                : `Its ${neverAnswered.join(" and ")} attacks are never answered, so it trades blows without taking retaliation.`,
        );
    }
    if (has("No Melee")) {
        lines.push(
            isRu
                ? "No Melee: не бьёт и не отвечает в ближнем бою — враг рядом не даёт ему стрелять и бьёт без ответа."
                : "No Melee: it can't strike or answer in melee — an enemy next to it stops it shooting and hits it without retaliation.",
        );
    }
    if (spells.length) {
        const damage = spells.some((spell) => MAGIC_DAMAGE_SPELLS.has(spell));
        const buffs = spells.filter((spell) => TOME_BUFF_SPELLS.has(spell));
        lines.push(
            isRu
                ? `Заклинатель: Break запрещает ему колдовать на 2 круга; юниты с Enchanted Skin не подвержены его заклинаниям; сопротивление магии снижает урон его заклинаний и может отразить его дебаффы; Magic Mirror может скопировать его дебаффы обратно на него.${damage ? " Магический урон повышают апгрейд «Магия» (Empower), Mage's Ring и Archmage's Ring." : ""}${buffs.length ? ` Tome of Amplification делает ${buffs.join(", ")} на 50% сильнее.` : ""}`
                : `Caster: Break stops it casting for 2 laps; units with Enchanted Skin ignore its spells; magic resistance cuts its spell damage and can resist its debuffs; Magic Mirror may copy its debuffs back onto it.${damage ? " The Empower augment, Mage's Ring and Archmage's Ring raise its magic damage." : ""}${buffs.length ? ` Tome of Amplification makes its ${buffs.join(", ")} 50% stronger.` : ""}`,
        );
    }
    const auras = names.filter((name) => name.endsWith(" Aura"));
    if (auras.length) {
        lines.push(
            isRu
                ? `Аура (${auras.join(", ")}): Break отключает её на 2 круга; синергия Силы «Радиус аур» расширяет её на 1/2/3 клетки.`
                : `Aura (${auras.join(", ")}): Break turns it off for 2 laps; Might's Aura Range synergy widens it by 1/2/3 cells.`,
        );
    }
    const blessings = names.filter((name) => name.endsWith(" Blessing"));
    if (blessings.length) {
        lines.push(
            isRu
                ? `Благословение (${blessings.join(", ")}): Break отключает его на 2 круга.`
                : `Blessing (${blessings.join(", ")}): Break turns it off for 2 laps.`,
        );
    }
    // Spell books are stack-powered only in that stack power unlocks their spells; the caster line covers them.
    const stackPowered = unit.abilities
        .filter((ability) => ability.isStackPowered && !/Book|Tome|Spellbook/.test(ability.name))
        .map((ability) => ability.name);
    if (stackPowered.length) {
        const one = stackPowered.length === 1;
        const boosted = stackPowered.filter((name) => !NO_ABILITY_POWER_SYNERGY.has(name) && !name.endsWith(" Blessing"));
        lines.push(
            isRu
                ? `От силы стека ${one ? "зависит" : "зависят"} ${stackPowered.join(", ")}: ${one ? "слабеет" : "слабеют"}, когда стек теряет существ (сила стека — доля от сильнейшего стека на поле), а после разделения пополам обе половины опускаются до силы 3.${boosted.length ? ` Синергия Силы «Сила способностей» добавляет +5/+8/+12 очков к ${boosted.join(", ")}.` : ""}`
                : `Stack-powered: ${stackPowered.join(", ")} ${one ? "weakens" : "weaken"} as the stack loses creatures (stack power is a share of the strongest stack on the board), and both halves of a split drop to stack power 3.${boosted.length ? ` Might's Abilities power synergy adds +5/+8/+12 points to ${boosted.join(", ")}.` : ""}`,
        );
    }
    if (has("Mechanism")) {
        lines.push(
            isRu
                ? "Mechanism: иммунитет к ментальным способностям и заклинаниям и к яду, мораль всегда 0; лечить нельзя (Resurrection работает); шанс Stun и Freeze ×1,5, Paralysis и Shatter Armor на 50% сильнее, а от физических атак по площади и по линии — на 50% больше урона (Amulet of Resolve частично это гасит)."
                : "Mechanism: immune to Mind abilities and spells and to poison, morale always 0; can't be healed (Resurrection still works); Stun and Freeze land 1.5× as often, Paralysis and Shatter Armor are 50% stronger, and it takes 50% more from physical area and line attacks (Amulet of Resolve offsets part of it).",
        );
    }
    if (has("Madness")) {
        lines.push(
            isRu
                ? "Madness: иммунитет к ментальным способностям и заклинаниям; мораль всегда 0 — ни Morale, ни Dismorale."
                : "Madness: immune to Mind abilities and spells; morale is always 0, so no Morale or Dismorale.",
        );
    }
    if (has("Enchanted Skin")) {
        lines.push(
            isRu
                ? "Enchanted Skin: иммунитет ко всем заклинаниям обеих сторон и к магическому урону (Chain Lightning, Fire Breath, Fire Shield, поджоги Fireforged); физические атаки, эффекты ударов (Stun, Blindness, Paralysis, Petrifying Gaze, Break), ауры и благословения на него действуют."
                : "Enchanted Skin: immune to every spell from either side and to magic damage (Chain Lightning, Fire Breath, Fire Shield, Fireforged burns); physical attacks, on-hit effects (Stun, Blindness, Paralysis, Petrifying Gaze, Break), auras and blessings still reach it.",
        );
    }
    if (has("Water Shield")) {
        lines.push(
            isRu
                ? "Water Shield: первый урон в бою обнуляется — снимите щит дешёвым ударом перед главной атакой; урон существ с Fire Element проходит сквозь щит, не снимая его."
                : "Water Shield: the first damage it takes in the fight is reduced to 0 — pop it with a cheap hit before your main attack; Fire Element attackers go through it without breaking it.",
        );
    }
    return lines;
}
