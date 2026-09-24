import type { NoteLanguage } from "./format";
import { spells as spellCatalog } from "../spells-data";
import type { Unit } from "../units-data";

/** Spells and abilities the Empower bonuses raise (common EMPOWERED_MAGIC_ABILITIES + damage spells). */
export const MAGIC_DAMAGE_SPELLS = new Set([
    ...["Fire Strike", "Fireball", "Meteorite", "Lightning Strike", "Ring of Fire", "Meteor Shower"],
    ...["Fire Wall", "Fireforged Sword"],
]);

/** Numbered buffs a unit casts on its own side — what Tome of Amplification strengthens. */
const TOME_BUFF_SPELLS = new Set(["Riot", "Mass Riot", "Spiritual Armor", "Magic Mirror", "Mass Magic Mirror", "Empower", "Fireforged Sword", "Helping Hand"]);
const NEVER_ANSWERED_ABILITIES = ["Shadow Touch", "Lightning Spin"];
/** Stack-powered abilities that take none of Might's Abilities power (or a share too small to matter). */
const NO_ABILITY_POWER_SYNERGY = new Set([
    "Magic Reflection",
    "Guiding Winds Aura",
    "Sylvan Focus Aura",
    "Battle Roar",
    "Crusade",
    "Wolf Trail Aura",
]);
/** Count abilities: they take a tenth of the synergy (+0.5/+0.8/+1.2). */
const TENTH_ABILITY_POWER_SYNERGY = new Set(["Sky Runner", "Miner", "Shatter Armor"]);
/** Stack power only unlocks their spells or caps their ammo; they get lines of their own. */
const NOT_SCALED_BY_STACK_POWER = /Book|Tome|Spellbook|Blacksmith Tools|Limited Supply/;
/** Its strength is the number of living creatures, not stack power; stack power only gates the cast. */
const COUNT_SCALED_ABILITIES = new Set(["Battle Roar"]);
/** Multi-target shots an unbroken Angel's Arrows Wingshield Blessing blunts. */
const ANGEL_BLUNTED_SHOTS = ["Large Caliber", "Area Throw", "Through Shot", "Chakram"];

/** The element table (common spell_damage elementalSpellMultiplier): immune to its own element, ×1.5 from its counter. */
const ELEMENT_LINES: Record<string, { en: string; ru: string }> = {
    "Fire Element": {
        en: "Fire Element: fire can't hurt it — Fire Strike, Fireball, Ring of Fire, Fire Wall, Fire Breath, Fire Shield and Fireforged burns deal it nothing.",
        ru: "Fire Element: огонь ему не вредит — Fire Strike, Fireball, Ring of Fire, Fire Wall, Fire Breath, Fire Shield и поджоги Fireforged не наносят ему урона.",
    },
    "Water Element": {
        en: "Water Element: fire deals it half again as much — Fire Strike, Fireball, Ring of Fire and Fire Wall hit it ×1.5.",
        ru: "Water Element: огонь наносит ему в полтора раза больше — Fire Strike, Fireball, Ring of Fire и Fire Wall бьют его ×1,5.",
    },
    "Wind Element": {
        en: "Wind Element: Lightning Strike and Chain Lightning deal it nothing, but Meteorite and Meteor Shower hit it ×1.5.",
        ru: "Wind Element: Lightning Strike и Chain Lightning не наносят ему урона, зато Meteorite и Meteor Shower бьют его ×1,5.",
    },
    "Earth Element": {
        en: "Earth Element: Meteorite and Meteor Shower deal it nothing, but Lightning Strike and Chain Lightning hit it ×1.5.",
        ru: "Earth Element: Meteorite и Meteor Shower не наносят ему урона, зато Lightning Strike и Chain Lightning бьют его ×1,5.",
    },
};

const stackPowerOf = (share: number): number => (share <= 0.2 ? 1 : share <= 0.4 ? 2 : share <= 0.6 ? 3 : share <= 0.8 ? 4 : 5);
/** The biggest drafted stack (1,000 experience rounded up to whole creatures) — the usual top of the board. */
const LARGEST_DRAFTED_STACK = 1_136;

/** Stack power of a part of a split: against the unsplit stack, and against the largest drafted stack. */
const splitPower = (part: number, count: number, experience: number): string => {
    const high = stackPowerOf(part / count);
    const low = stackPowerOf((part * experience) / Math.max(LARGEST_DRAFTED_STACK, count * experience));
    return low === high ? `${high}` : `${low}–${high}`;
};

/**
 * What beats a unit and what makes it better, derived from its traits (shooter, flyer, caster, aura,
 * Mechanism…). Every clause restates a mechanic from its own verified entry; nothing here is new.
 */
export function unitCounterLines(unit: Unit, language: NoteLanguage): string[] {
    const isRu = language === "ru";
    const names = unit.abilities.map((ability) => ability.name);
    const has = (name: string): boolean => names.includes(name);
    const mindImmune = has("Mechanism") || has("Madness");
    // Enchanted Skin becomes 100% magic resistance only once the fight computes stats; the card shows the base.
    const spellImmune = has("Enchanted Skin") || unit.magicResist >= 100;
    const spells = [...new Set(unit.spells.map((entry) => entry.replace(/^[^:]+:/, "")))];
    const lines: string[] = [];

    if (unit.rangeShots > 0 && unit.attackType === "RANGE") {
        const melee = has("No Melee")
            ? ""
            : has("Handyman")
              ? isRu
                  ? " Handyman: в ближнем бою бьёт в полную силу (другие стрелки — вполсилы)."
                  : " Handyman: it hits at full strength in melee (other shooters deal half)."
              : isRu
                ? " В ближнем бою бьёт вполсилы."
                : " In melee it deals half damage.";
        const rangebane = mindImmune ? "" : isRu ? ", а Rangebane (Spit Ball у Beholder) — на круг" : ", and Rangebane (the Beholder's Spit Ball) for a lap";
        // Through Shot units never answer with a counter-shot, so there is nothing to stop.
        const shootsBack = !has("Through Shot");
        const denseFlesh = has("Endless Quiver")
            ? ""
            : isRu
              ? "; большинство выстрелов по Abomination (Dense Flesh) стоят 2 стрелы"
              : "; most shots at an Abomination (Dense Flesh) cost 2 arrows";
        const helpers = has("Sniper")
            ? isRu
                ? " Способность Sniper отменяет штраф за дальность, поэтому бонусы дальности (Farsight Quiver, Guiding Winds, дальность «Стрельбы») ему ничего не дают; помогают бонус атаки «Стрельбы» и Hunter's Longbow (атака за каждый стек стрелков в армии)."
                : " Its Sniper ability ignores range falloff, so range bonuses (Farsight Quiver, Guiding Winds, the Sniper augment's range) do nothing for it; the Sniper augment's attack bonus and Hunter's Longbow (attack per ranged stack in your army) still help."
            : isRu
              ? " Помогают: апгрейд «Стрельба» и Farsight Quiver удлиняют полосы дальности, Hunter's Longbow даёт атаку за каждый стек стрелков в армии, Guiding Winds (Dryad) позволяет стрелять дальше."
              : " Helpers: the Sniper augment and Farsight Quiver lengthen its range bands, Hunter's Longbow adds attack per ranged stack in your army, Guiding Winds (Dryad) lets it shoot farther.";
        lines.push(
            isRu
                ? `Стрелок: враг в любой соседней клетке не даёт ему стрелять; Range Null Field Aura (Griffin) запрещает ему стрелять${shootsBack ? " и отвечать выстрелом" : ""} в радиусе 2 клеток${rangebane}; Smoke вдвое ослабляет его выстрелы через облако${has("Sniper") ? " (и со Sniper)" : ""}; Arrows Wingshield Blessing (Angel) даёт армии соперника броню против выстрелов${denseFlesh}.${melee}${helpers}`
                : `Shooter: an enemy in any touching cell stops it shooting; Range Null Field Aura (Griffin) stops it shooting${shootsBack ? " or shooting back" : ""} within 2 cells${rangebane}; Smoke halves its shots through the cloud${has("Sniper") ? " (Sniper shots too)" : ""}; Arrows Wingshield Blessing (Angel) armors the enemy army against shots${denseFlesh}.${melee}${helpers}`,
        );
    }
    const blunted = ANGEL_BLUNTED_SHOTS.filter(has);
    if (blunted.length) {
        const parts = blunted
            .map((name) =>
                name === "Through Shot"
                    ? isRu
                        ? "Through Shot останавливается на нём"
                        : "a Through Shot stops at it"
                    : name === "Chakram"
                      ? isRu
                          ? "отскок Chakram на него не наносит урона и заканчивает полёт"
                          : "a Chakram bounce onto it lands no hit and ends the flight"
                      : isRu
                        ? `выстрел ${name}, попавший в него, не задевает соседей`
                        : `a ${name} shot that lands on it doesn't splash`,
            )
            .join(isRu ? "; " : "; ");
        lines.push(
            isRu
                ? `Angel без Break (Arrows Wingshield Blessing) гасит это: ${parts} — стреляйте по его соседям или сначала наложите Break.`
                : `An unbroken Angel (Arrows Wingshield Blessing) blunts it: ${parts} — aim at its neighbours, or Break it first.`,
        );
    }
    if (has("Limited Supply")) {
        lines.push(
            isRu
                ? "Limited Supply: в колчане не больше «выстрелы × сила стека ÷ 5» (с округлением вниз) — потери снижают этот предел, а потраченные стрелы не возвращаются."
                : "Limited Supply: its quiver holds at most shots × stack power ÷ 5, rounded down — losses lower that cap, and spent arrows don't come back.",
        );
    }

    if (unit.movementType === "FLY") {
        const windFlowGate = spellCatalog.find((spell) => spell.name === "Wind Flow")?.minimalCasterStackPower ?? 1;
        const slows = spellImmune
            ? isRu
                ? "; Hamstring и Wind Flow на него не действуют (100% сопротивления магии)"
                : "; Hamstring and Wind Flow can't touch it (100% magic resistance)"
            : isRu
              ? `; Hamstring (Dryad) может отнять 30% движения на 3 круга; Wind Flow (Valkyrie, сила стека ${windFlowGate}+) даёт всем летающим +4 к броне и −4 к движению на 3 круга`
              : `; Hamstring (Dryad) can take 30% of its movement for 3 laps; Wind Flow (Valkyrie, stack power ${windFlowGate}+) gives every flyer +4 armor and −4 movement for 3 laps`;
        lines.push(
            isRu
                ? `Летающий: Web Aura (Arachna Queen) не даёт ему двигаться, если ход начинается в радиусе 2 клеток от неё${slows}. Помогает синергия Природы «Броня летающих»: +15/24/35% брони в любой армии.`
                : `Flyer: Web Aura (Arachna Queen) keeps it from moving on a turn it starts within 2 cells of her${slows}. Helper: Nature's Flying Armor synergy gives it +15/24/35% armor in any army.`,
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
                ? "No Melee: не бьёт и не отвечает в ближнем бою — враг рядом не даёт ему стрелять и бьёт без ответа (Break снимает это на 2 круга)."
                : "No Melee: it can't strike or answer in melee — an enemy next to it stops it shooting and hits it without retaliation (Break lifts this for 2 laps).",
        );
    }

    if (spells.length) {
        const catalog = spells.map((name) => spellCatalog.find((spell) => spell.name === name)).filter((spell) => spell !== undefined);
        const damage = spells.some((spell) => MAGIC_DAMAGE_SPELLS.has(spell));
        // Fire Wall burns a share of health: neither magic resistance nor a mirror touches it.
        const resistedDamage = spells.some((spell) => MAGIC_DAMAGE_SPELLS.has(spell) && spell !== "Fire Wall");
        const debuffs = catalog.some((spell) => spell.polarity === "debuff");
        const buffs = spells.filter((spell) => TOME_BUFF_SPELLS.has(spell));
        const gated = catalog.filter((spell) => spell.minimalCasterStackPower > 1).map((spell) => `${spell.name} ${spell.minimalCasterStackPower}+`);
        const craft = spells.includes("Craft");
        const resistance = [
            ...(resistedDamage
                ? [
                      isRu
                          ? "сопротивление магии снижает урон его заклинаний, а Magic Mirror, Mass Magic Mirror (Ogre Mage) и Magic Reflection (Magic Dragon) возвращают ему часть этого урона"
                          : "magic resistance cuts its spell damage, and Magic Mirror, Mass Magic Mirror (Ogre Mage) or Magic Reflection (Magic Dragon) sends a share of it back",
                  ]
                : []),
            ...(debuffs
                ? [
                      isRu
                          ? "сопротивление магии может противостоять его дебаффам, а Magic Mirror — скопировать их обратно на него"
                          : "magic resistance can resist its debuffs, and Magic Mirror may copy them back onto it",
                  ]
                : []),
        ];
        const parts = isRu
            ? ["Break запрещает ему колдовать на 2 круга", `юниты с Enchanted Skin не подвержены его заклинаниям${craft ? " (кроме Craft)" : ""}`, ...resistance]
            : ["Break stops it casting for 2 laps", `units with Enchanted Skin ignore its spells${craft ? " (Craft excepted)" : ""}`, ...resistance];
        const extras = isRu
            ? [
                  ...(gated.length ? [` Часть заклинаний требует силы стека (${gated.join(", ")}): потери или разделение могут их закрыть.`] : []),
                  ...(spells.includes("Fire Wall")
                      ? [
                            " Его Fire Wall сжигает 25% полного здоровья стека, который через неё проходит, своего или чужого, — броня и сопротивление магии этого не снижают; существа с Fire Element (Efreet, Black Dragon) проходят невредимыми, а Water Element (Mermaid) получает в полтора раза больше.",
                        ]
                      : []),
                  ...(damage ? [" Магический урон повышают апгрейд «Магия» (Empower), Mage's Ring и Archmage's Ring."] : []),
                  ...(buffs.length ? [` Tome of Amplification делает ${buffs.join(", ")} на 50% сильнее.`] : []),
              ]
            : [
                  ...(gated.length ? [` Some spells need stack power (${gated.join(", ")}): losses or a split can lock them.`] : []),
                  ...(spells.includes("Fire Wall")
                      ? [
                            " Its Fire Wall burns 25% of a crossing stack's full health, friend or foe — armor and magic resistance don't reduce it; Fire Elements (Efreet, Black Dragon) cross it unharmed, and a Water Element (Mermaid) takes half again as much.",
                        ]
                      : []),
                  ...(damage ? [" The Empower augment, Mage's Ring and Archmage's Ring raise its magic damage."] : []),
                  ...(buffs.length ? [` Tome of Amplification makes its ${buffs.join(", ")} 50% stronger.`] : []),
              ];
        lines.push(`${isRu ? "Заклинатель" : "Caster"}: ${parts.join("; ")}.${extras.join("")}`);
    }

    const abilityCasts = unit.abilities
        .map((ability) => spellCatalog.find((spell) => spell.name === ability.name))
        .filter((spell) => spell !== undefined && spell.minimalCasterStackPower > 1);
    if (abilityCasts.length) {
        const gates = abilityCasts.map((spell) => `${spell.name} ${spell.minimalCasterStackPower}+`).join(", ");
        const castNames = abilityCasts.map((spell) => spell.name);
        const castExtras = isRu
            ? [
                  ...(castNames.includes("Castling") ? [" Castling меняет местами только с врагом точно такого же размера, а сопротивление магии цели может его сорвать."] : []),
                  ...(castNames.includes("Battle Roar") ? [" Battle Roar даёт +1 к движению за каждого живого Behemoth в стеке, поэтому слабеет с потерями."] : []),
              ]
            : [
                  ...(castNames.includes("Castling") ? [" Castling swaps only with an enemy of exactly the same footprint, and the target's magic resistance can make it fail."] : []),
                  ...(castNames.includes("Battle Roar") ? [" Battle Roar gives +1 movement per living Behemoth in the stack, so it shrinks with losses."] : []),
              ];
        lines.push(
            isRu
                ? `Для применения нужна сила стека (${gates}): потери или разделение могут закрыть ${abilityCasts.length === 1 ? "его" : "их"}.${castExtras.join("")}`
                : `Casting needs stack power (${gates}): losses or a split can lock ${abilityCasts.length === 1 ? "it" : "them"}.${castExtras.join("")}`,
        );
    }

    const auraAbilities = unit.abilities.filter((ability) => ability.name.endsWith(" Aura") && ability.name !== "Disguise Aura");
    if (auraAbilities.length) {
        const auras = auraAbilities.map((ability) => ability.name);
        const flat = auraAbilities.filter((ability) => !ability.isStackPowered).map((ability) => ability.name);
        const splitNote = flat.length
            ? isRu
                ? ` ${flat.join(", ")} не ${flat.length === 1 ? "зависит" : "зависят"} от силы стека: разделённый носитель даёт ${flat.length === 1 ? "её" : "их"} в полную силу вокруг каждой части (одна аура на клетке не складывается).`
                : ` ${flat.join(", ")} ${flat.length === 1 ? "doesn't" : "don't"} depend on stack power, so a split projects ${flat.length === 1 ? "it" : "them"} at full strength around each part (the same aura doesn't add up on a cell).`
            : "";
        lines.push(
            isRu
                ? `Аура (${auras.join(", ")}): Break отключает её на 2 круга; синергия Силы «Радиус аур» расширяет её на 1/2/3 клетки.${splitNote}`
                : `Aura (${auras.join(", ")}): Break turns it off for 2 laps; Might's Aura Range synergy widens it by 1/2/3 cells.${splitNote}`,
        );
    }
    if (has("Disguise Aura")) {
        lines.push(
            isRu
                ? "Disguise Aura: пока юнит скрыт, его нельзя выбрать целью атаки или заклинания, но удары по площади и по линии его задевают; Break отключает ауру на 2 круга. Враги раскрывают его в радиусе 3 клеток — 3 + 1/2/3, если у его армии есть синергия Силы «Радиус аур»."
                : "Disguise Aura: while Hidden it can't be singled out by attacks or spells, but area and line attacks still hit it; Break turns the aura off for 2 laps. Enemies reveal it within 3 cells — 3 + 1/2/3 if its own army has Might's Aura Range synergy.",
        );
    }
    const blessings = names.filter((name) => name.endsWith(" Blessing"));
    if (blessings.length) {
        lines.push(
            isRu
                ? `Благословение (${blessings.join(", ")}): Break отключает его на 2 круга, если в армии нет другого носителя без Break (разделённый стек его сохраняет).`
                : `Blessing (${blessings.join(", ")}): Break turns it off for 2 laps unless another unbroken carrier lives (a split stack keeps it).`,
        );
    }

    const stackPowered = unit.abilities
        .filter((ability) => ability.isStackPowered && !NOT_SCALED_BY_STACK_POWER.test(ability.name) && !COUNT_SCALED_ABILITIES.has(ability.name))
        .map((ability) => ability.name);
    if (stackPowered.length) {
        const one = stackPowered.length === 1;
        const full = stackPowered.filter((name) => !NO_ABILITY_POWER_SYNERGY.has(name) && !TENTH_ABILITY_POWER_SYNERGY.has(name) && !name.endsWith(" Blessing"));
        const tenth = stackPowered.filter((name) => TENTH_ABILITY_POWER_SYNERGY.has(name));
        const count = unit.draftedAmount;
        const low = Math.floor(count / 2);
        const high = Math.ceil(count / 2);
        const lowPower = splitPower(low, count, unit.experience);
        const highPower = splitPower(high, count, unit.experience);
        const split =
            count <= 0
                ? ""
                : count === 1
                  ? isRu
                      ? " Это одно существо: его нельзя разделить, и сила стека держится, пока оно живо (если на поле не появится стек крупнее)."
                      : " It is a single creature: it can't be split, and its stack power holds until it dies (unless a bigger stack appears on the board)."
                  : lowPower === highPower
                    ? isRu
                        ? ` Разделение пополам опускает обе половины до силы ${lowPower}.`
                        : ` Splitting it in half drops both halves to stack power ${lowPower}.`
                    : isRu
                      ? ` Разделение на ${low} и ${high} опускает части до силы ${lowPower} и ${highPower}.`
                      : ` Splitting it into ${low} and ${high} drops the parts to stack power ${lowPower} and ${highPower}.`;
        const loses =
            count === 1
                ? ""
                : isRu
                  ? ` ${one ? "слабеет" : "слабеют"}, когда стек теряет существ (сила стека — доля от сильнейшего стека на поле).`
                  : ` ${one ? "weakens" : "weaken"} as the stack loses creatures (stack power is a share of the strongest stack on the board).`;
        const synergy = [
            ...(full.length ? [isRu ? `+5/+8/+12 очков к ${full.join(", ")}` : `+5/+8/+12 points to ${full.join(", ")}`] : []),
            ...(tenth.length ? [isRu ? `десятую часть этого (+0,5/+0,8/+1,2) к ${tenth.join(", ")}` : `a tenth of that (+0.5/+0.8/+1.2) to ${tenth.join(", ")}`] : []),
        ];
        const synergyText = synergy.length
            ? isRu
                ? ` Синергия Силы «Сила способностей» добавляет ${synergy.join(" и ")}.`
                : ` Might's Abilities power synergy adds ${synergy.join(" and ")}.`
            : "";
        lines.push(
            isRu
                ? `От силы стека ${one ? "зависит" : "зависят"} ${stackPowered.join(", ")}${loses ? `:${loses}` : "."}${split}${synergyText}`
                : `Stack-powered: ${stackPowered.join(", ")}${loses || "."}${split}${synergyText}`,
        );
    }

    if (has("AI Driven")) {
        lines.push(
            isRu
                ? "AI Driven: стеком играет игра — в свой ход он бросается на ближайшего достижимого врага; пока на нём Break, им управляете вы."
                : "AI Driven: the game plays this stack — on its turn it charges the nearest enemy it can reach; while it is Broken, you control it.",
        );
    }
    if (has("Mechanism")) {
        lines.push(
            isRu
                ? "Mechanism: иммунитет к ментальным способностям и заклинаниям и к яду, мораль всегда 0; лечить нельзя (Resurrection работает); шанс Stun и Freeze ×1,5, Paralysis и Shatter Armor на 50% сильнее, а от физических атак по площади и по линии — на 50% больше урона (Amulet of Resolve частично это гасит). Break снимает всё это на 2 круга."
                : "Mechanism: immune to Mind abilities and spells and to poison, morale always 0; can't be healed (Resurrection still works); Stun and Freeze land 1.5× as often, Paralysis and Shatter Armor are 50% stronger, and it takes 50% more from physical area and line attacks (Amulet of Resolve offsets part of it). Break lifts all of this for 2 laps.",
        );
    }
    if (has("Madness")) {
        lines.push(
            isRu
                ? "Madness: иммунитет к ментальным способностям и заклинаниям; мораль всегда 0 — ни Morale, ни Dismorale. Break снимает это на 2 круга."
                : "Madness: immune to Mind abilities and spells; morale is always 0, so no Morale or Dismorale. Break lifts this for 2 laps.",
        );
    }
    if (has("Enchanted Skin")) {
        lines.push(
            isRu
                ? "Enchanted Skin: иммунитет ко всем заклинаниям обеих сторон (Craft у Blacksmith — способность — до него всё же достаёт) и к магическому урону (Chain Lightning, Fire Breath, Fire Shield, поджоги Fireforged); физические атаки, эффекты ударов (Stun, Blindness, Paralysis, Petrifying Gaze, Break), ауры и благословения на него действуют."
                : "Enchanted Skin: immune to every spell from either side (the Blacksmith's Craft, an ability, still reaches it) and to magic damage (Chain Lightning, Fire Breath, Fire Shield, Fireforged burns); physical attacks, on-hit effects (Stun, Blindness, Paralysis, Petrifying Gaze, Break), auras and blessings still reach it.",
        );
    }
    for (const element of Object.keys(ELEMENT_LINES)) {
        if (has(element)) {
            lines.push(isRu ? ELEMENT_LINES[element].ru : ELEMENT_LINES[element].en);
        }
    }
    if (has("Wild Regeneration")) {
        lines.push(
            isRu
                ? "Wild Regeneration: в начале каждого своего хода раненое переднее существо восстанавливается полностью, поэтому засчитываются только убитые целиком — добивайте существ до его хода; Break отключает её на 2 круга."
                : "Wild Regeneration: at the start of each of its turns its wounded front creature heals to full, so only whole-creature kills stick — finish creatures off before its turn; Break turns it off for 2 laps.",
        );
    }
    if (has("Heavy Armor")) {
        lines.push(
            isRu
                ? "Heavy Armor: Chain Lightning, Fire Breath и Fire Shield наносят ему до 50% больше (по его силе стека и удаче); заклинания урона бьют как обычно."
                : "Heavy Armor: Chain Lightning, Fire Breath and Fire Shield deal it up to 50% more (by its stack power and luck); damage spells hit it normally.",
        );
    }
    if (has("Leather Armor")) {
        lines.push(
            isRu
                ? "Leather Armor: против выстрелов его базовая броня на 50% ниже — вражеские стрелки его естественная контра."
                : "Leather Armor: its base armor counts 50% lower against shots — enemy shooters are its natural counter.",
        );
    }
    if (has("Small Specie")) {
        lines.push(
            isRu
                ? "Small Specie: уклонение работает только против существ больше одной клетки — одноклеточные бьют его как обычно."
                : "Small Specie: its dodge works only against creatures bigger than one cell — one-cell attackers hit it normally.",
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
