import { ARTIFACT_POWER as A } from "@heroesofcrypto/common/src/artifacts/artifact_properties";

import { formatNumber, type NoteLanguage } from "./format";
import { MAGIC_DAMAGE_SPELLS } from "./unit-counters";
import { allUnits, type Unit } from "../units-data";

const MAGIC_DAMAGE_ABILITIES = ["Chain Lightning", "Fire Breath", "Fire Shield"];
const SPLASH_ABILITIES = ["Area Throw", "Large Caliber", "Chakram", "Lightning Spin", "Skewer Strike", "Through Shot"];
const MIND_ABILITIES = ["Blindness", "Aggr", "Boar Saliva", "Terrifying Gaze", "Petrifying Gaze"];
const TOME_BUFF_SPELLS = ["Riot", "Mass Riot", "Spiritual Armor", "Magic Mirror", "Mass Magic Mirror", "Empower", "Fireforged Sword", "Helping Hand"];

const draftable = (): Unit[] => allUnits.filter((unit) => !unit.summonedOnly);
const hasAbility = (unit: Unit, names: readonly string[]): boolean => unit.abilities.some((ability) => names.includes(ability.name));
const spellsOf = (unit: Unit): string[] => unit.spells.map((entry) => entry.replace(/^[^:]+:/, ""));
const carriers = (names: readonly string[]): string[] => draftable().filter((unit) => hasAbility(unit, names)).map((unit) => unit.name);

const list = (items: readonly string[], language: NoteLanguage): string => {
    const unique = [...new Set(items)];
    if (unique.length <= 1) {
        return unique.join("");
    }
    return `${unique.slice(0, -1).join(", ")} ${language === "ru" ? "и" : "and"} ${unique.at(-1)}`;
};

/** "Blindness (Unicorn), Aggr (Pikeman)…": an ability and the draftable units that carry it. */
const abilityCarriers = (names: readonly string[], language: NoteLanguage): string =>
    list(
        names
            .map((name) => ({ name, units: carriers([name]) }))
            .filter((entry) => entry.units.length)
            .map((entry) => `${entry.name} (${entry.units.join(", ")})`),
        language,
    );

/** Skewer Strike reaches only the unit behind a one-cell target, so the Pikeman is a splash unit only there. */
const skewerNote = (language: NoteLanguage): string => {
    const skewers = carriers(["Skewer Strike"]);
    if (!skewers.length) {
        return "";
    }
    return language === "ru"
        ? ` (у ${list(skewers, language)} — только для юнита, пронзённого позади одноклеточной цели)`
        : ` (${list(skewers, language)}: only the unit skewered behind a one-cell target)`;
};

/** An enemy Giant's Maul against Amulet of Resolve: its impact bonus first, then the status resistance. */
const maulAgainstAmulet = (language: NoteLanguage): string =>
    formatNumber(Math.round((1 + A.GIANTS_MAUL_AOE_PERCENT / 100) * (1 - A.AMULET_OF_RESOLVE_RESIST_PERCENT / 100) * 100) / 100, language);

type Fit = (language: NoteLanguage, n: (value: number) => string) => string;

const FITS: Record<string, Fit> = {
    "Veteran Helm": (language, n) =>
        language === "ru"
            ? `Каждый юнит получает примерно на ${n(100 - 10000 / (100 + A.VETERAN_HELM_PERCENT))}% меньше физического урона (урон делится на броню), какой бы ни была его броня, — небольшая ровная защита. Смягчает и Fire Breath, который считается как атака, но не помогает против заклинаний и Fire Shield.`
            : `Every unit takes about ${n(100 - 10000 / (100 + A.VETERAN_HELM_PERCENT))}% less physical damage (damage is divided by armor), whatever its armor — a small, even defense. It also softens Fire Breath, which is priced like an attack, but does nothing against cast spells or Fire Shield.`,
    "Amulet of Resolve": (language) =>
        language === "ru"
            ? `Против оглушения и паралича — ${abilityCarriers(["Stun", "Paralysis"], language)} — и физических ударов по площади и по линии: ${list(carriers(SPLASH_ABILITIES), language)}${skewerNote(language)}; вражеский Giant's Maul с ним даёт лишь ×${maulAgainstAmulet(language)}. Ваших юнитов с Mechanism он защищает сильнее всех (их ×1,5 от ударов по площади становится ×1,25). Против ментальных эффектов и магии не помогает.`
            : `Best against stuns and paralysis — ${abilityCarriers(["Stun", "Paralysis"], language)} — and physical area and line attacks: ${list(carriers(SPLASH_ABILITIES), language)}${skewerNote(language)}; an enemy Giant's Maul nets only ×${maulAgainstAmulet(language)} against it. It shields your own Mechanism units most (their ×1.5 from splash becomes ×1.25). Nothing against Mind effects or magic.`,
    "Swift Boots": (language, n) => {
        const walkers = draftable().filter((unit) => unit.movementType !== "FLY" && unit.attackType === "MELEE");
        const chargers = walkers.filter((unit) => hasAbility(unit, ["Rapid Charge"])).map((unit) => unit.name);
        return language === "ru"
            ? `Даёт +${n(A.SWIFT_BOOTS_STEPS)}% шагов только нелетающим юнитам с обычным ближним боем: ${list(walkers.map((unit) => unit.name), language)}. Лучше всего с Rapid Charge (${list(chargers, language)}), где каждая лишняя клетка — это лишний урон.`
            : `+${n(A.SWIFT_BOOTS_STEPS)}% steps for non-flying plain-melee units only: ${list(walkers.map((unit) => unit.name), language)}. Best with Rapid Charge (${list(chargers, language)}), where every extra cell is extra damage.`;
    },
    "Winged Boots": (language, n) => {
        const flyers = draftable().filter((unit) => unit.movementType === "FLY").map((unit) => unit.name);
        return language === "ru"
            ? `Только летающим (+${n(A.WINGED_BOOTS_STEPS)} к движению и +${n(A.WINGED_BOOTS_ARMOR)} к броне): ${list(flyers, language)} — чем больше их в армии, тем больше пользы.`
            : `Flyers only (+${n(A.WINGED_BOOTS_STEPS)} movement, +${n(A.WINGED_BOOTS_ARMOR)} armor): ${list(flyers, language)} — the more of them you field, the more it gives.`;
    },
    "Dual Strike Charm": (language) =>
        language === "ru"
            ? `Работает только с Double Punch и Double Shot: ${list(carriers(["Double Punch", "Double Shot"]), language)}. Без них ничего не даёт.`
            : `Only does something with Double Punch or Double Shot: ${list(carriers(["Double Punch", "Double Shot"]), language)}. Nothing without them.`,
    "Wounding Charm": (language, n) => {
        const owners = carriers(["Deep Wounds Level 1"]);
        const higher = carriers(["Deep Wounds Level 2", "Deep Wounds Level 3"]);
        return language === "ru"
            ? `Для армий ближнего боя: раны добавляет каждый удар в ближнем бою, а стрелки (и Fire Breath) лишь пользуются уже нанесёнными — заклинания раны не учитывают; удача входит в каждую рану целиком. ${list(owners, language)} ничего не получает (эта карта у него уже есть); ${list(higher, language)} добавляют её ${n(A.WOUNDING_CHARM_DEEP_WOUNDS_PERCENT)} к своей.`
            : `Best with melee armies: every melee hit adds wounds, while shooters (and Fire Breath) only cash them in — spells ignore wounds; luck counts in full in every wound. ${list(owners, language)} gains nothing (it already owns this card); ${list(higher, language)} add its ${n(A.WOUNDING_CHARM_DEEP_WOUNDS_PERCENT)} on top of their own.`;
    },
    "Cursed Ward": (language, n) =>
        language === "ru"
            ? `Почти бесплатен рядом с синергией Жизни «Мораль и удача» 3 уровня (мораль ограничена +20, так что стек армии из одной Жизни опускается лишь до +18 — но без запаса на потери морали) и больнее всего там, где мораль и так низкая: каждый круг юнит с отрицательной моралью получает Dismorale с шансом, равным ей в процентах, — у юнита Хаоса (−1) шанс растёт с 1% до ${n(1 + A.CURSED_WARD_MORALE_PENALTY)}%. Его +${n(A.CURSED_WARD_LUCK)} к удаче почти теряются, если удача уже около +10 (Clover of Fortune, Luck Aura).`
            : `Costs little next to Life's Morale and Luck synergy at level 3 (morale is capped at +20, so an all-Life stack drops only to +18 — though it keeps no margin against morale losses) and hurts most where morale is already low: each lap a unit with negative morale rolls Dismorale at that many percent, so a Chaos unit (−1) goes from 1% to ${n(1 + A.CURSED_WARD_MORALE_PENALTY)}%. Its +${n(A.CURSED_WARD_LUCK)} luck is mostly lost where luck is already near +10 (Clover of Fortune, Luck Aura).`,
    "Hunter's Longbow": (language) => {
        const shooters = draftable().filter((unit) => unit.attackType === "RANGE" && unit.rangeShots > 0).map((unit) => unit.name);
        return language === "ru"
            ? `Для стай дешёвых стрелков: +1 к атаке за стек стрелков — большая доля низкой атаки (при 5 стеках стрелков Arbalester 7 → 12, +71%) и мелочь для Tsar Cannon (46 → 51); разделённые стеки стрелков тоже считаются. Стрелки: ${list(shooters, language)}.`
            : `Swarms of cheap shooters: +1 attack per ranged stack is a big share of a low attack (with 5 ranged stacks an Arbalester goes 7 → 12, +71%) and little on a Tsar Cannon (46 → 51); split shooter stacks count too. Shooters: ${list(shooters, language)}.`;
    },
    "Helm of Focus": (language) =>
        language === "ru"
            ? `Против ментальных способностей: ${abilityCarriers(MIND_ABILITIES, language)}. Против ментальных заклинаний (их отражает сопротивление магии) и эффектов Статуса не помогает.`
            : `Against Mind abilities: ${abilityCarriers(MIND_ABILITIES, language)}. Nothing against Mind spells (magic resistance handles those) or Status effects.`,
    "Warlord's Edge": (language, n) =>
        language === "ru"
            ? `+${n(A.WARLORDS_EDGE_PERCENT)}% базовой атаки каждому юниту, в ближнем бою и выстрелом, сверху — Riot и ауры атаки его не умножают; ровное усиление для любой армии, которая бьёт атаками (заклинания атаку не используют).`
            : `+${n(A.WARLORDS_EDGE_PERCENT)}% of base attack for every unit, melee and ranged, added on top — Riot and attack auras don't multiply it; an even boost for any army that fights with attacks (spells don't use attack).`,
    "Clover of Fortune": (language, n) =>
        language === "ru"
            ? `+${n(A.CLOVER_LUCK)} к удаче, но удача ограничена +10: юниты Природы начинают с +4 и получают около +6, остальные — около +9. Каждая атака по вашим юнитам наносит примерно на 1% меньше за очко удачи, а удача целиком входит в Deep Wounds (${list(carriers(["Deep Wounds Level 1", "Deep Wounds Level 2", "Deep Wounds Level 3"]), language)}), Piercing Spear и Boost Health (Centaur), Rapid Charge (${list(carriers(["Rapid Charge"]), language)} — при +10 удачи бонус за клетку удваивается) и процентные ауры. Отменяет вражеский Misfortune (удача 0 вместо −10). Бесполезен для Leprechaun и союзников в 2 клетках от него — его Luck Aura уже даёт ровно +10.`
            : `+${n(A.CLOVER_LUCK)} luck, but luck is capped at +10: Nature units start at +4 and gain about +6, the others about +9. Every attack on your units deals about 1% less per point of luck, and luck counts in full in Deep Wounds (${list(carriers(["Deep Wounds Level 1", "Deep Wounds Level 2", "Deep Wounds Level 3"]), language)}), Piercing Spear and Boost Health (Centaur), Rapid Charge (${list(carriers(["Rapid Charge"]), language)} — +10 luck doubles its per-cell bonus) and percentage auras. It cancels an enemy Misfortune (luck 0 instead of −10). Wasted on a Leprechaun and on allies within 2 cells of it — its Luck Aura already sets exactly +10.`,
    "Crown of Command": (language, n) =>
        language === "ru"
            ? `+${n(A.CROWN_STEPS)} к движению и +${n(A.CROWN_ARMOR)} к броне всем; +${n(A.CROWN_MORALE)} к морали — это чаще Morale, но мораль ограничена +20: рядом с синергией Жизни «Мораль и удача» 2 уровня (+13) он добавляет свежим существам Жизни, Силы, Природы и Хаоса лишь 3/5/6/8, а на 3 уровне — ничего, зато там +8 держат стек на +20 при потере ещё 8 очков морали; юниты с Madness и Mechanism морали не получают.`
            : `+${n(A.CROWN_STEPS)} movement and +${n(A.CROWN_ARMOR)} armor for everyone; its +${n(A.CROWN_MORALE)} morale means more Morale rolls, but morale caps at +20: next to Life's Morale and Luck synergy it adds only 3/5/6/8 to fresh Life/Might/Nature/Chaos creatures at level 2 (+13) and nothing at level 3 — there the +8 instead keeps a stack at +20 through 8 more points of morale loss — and Madness and Mechanism units get none.`,
    "Giant's Maul": (language) =>
        language === "ru"
            ? `Для армий с физическими ударами по площади и по линии: ${list(carriers(SPLASH_ABILITIES), language)}${skewerNote(language)}. Amulet of Resolve у соперника почти обнуляет его (×${maulAgainstAmulet(language)}). Держите свои стеки — особенно Tsar Cannon — вне 3×3 вокруг целей ваших ударов по площади.`
            : `Armies with physical area and line attacks: ${list(carriers(SPLASH_ABILITIES), language)}${skewerNote(language)}. An enemy Amulet of Resolve all but cancels it (×${maulAgainstAmulet(language)}). Keep your own stacks — a Tsar Cannon above all — out of the 3×3 around your own area targets.`,
    "Pendant of Vitality": (language, n) =>
        language === "ru"
            ? `+${n(A.PENDANT_HP_PERCENT)}% здоровья каждому существу ценой −${n(A.PENDANT_ATTACK_PENALTY_PERCENT)}% базовой атаки: для армий, которые побеждают, выживая, — меньше потерь держит и силу стека; урон атак всех юнитов при этом ниже, но заклинания атаку не используют, так что армиям заклинателей он почти ничего не стоит.`
            : `+${n(A.PENDANT_HP_PERCENT)}% health for every creature at −${n(A.PENDANT_ATTACK_PENALTY_PERCENT)}% base attack: for armies that win by lasting — fewer losses also keep stack power up; every unit's attack damage drops, but spells don't use attack, so it costs a caster army little.`,
    "Farsight Quiver": (language) => {
        const shooters = draftable().filter((unit) => unit.attackType === "RANGE" && unit.rangeShots > 0 && !hasAbility(unit, ["Sniper"]));
        const ranges = shooters
            .sort((a, b) => a.shotDistance - b.shotDistance)
            .map((unit) => `${unit.name} ${Math.floor(unit.shotDistance)} → ${Math.floor(unit.shotDistance * (1 + A.FARSIGHT_QUIVER_RANGE_PERCENT / 100))}`);
        return language === "ru"
            ? `Для стрелков с короткой дистанцией (ширина полосы в целых клетках): ${list(ranges, language)}. Arbalester ничего не получает — его Sniper и так отменяет штраф за дальность.`
            : `Short-range shooters gain most (band width in whole cells): ${list(ranges, language)}. Nothing for the Arbalester — its Sniper already ignores falloff.`;
    },
    "Berserker's Bond": (language, n) =>
        language === "ru"
            ? `+${n(A.BERSERKERS_BOND_ATTACK)} к базовой атаке и −${n(A.BERSERKERS_BOND_DEFENSE_PENALTY)} к броне всем: большая доля низкой атаки (Peasant 9 → 12, +33%) и мелочь на 4 уровне; −${n(A.BERSERKERS_BOND_DEFENSE_PENALTY)} брони сильнее бьёт по стекам с низкой бронёй.`
            : `+${n(A.BERSERKERS_BOND_ATTACK)} base attack and −${n(A.BERSERKERS_BOND_DEFENSE_PENALTY)} armor for everyone: a big share of a low attack (a Peasant's 9 → 12, +33%), little on a level-4 unit; the −${n(A.BERSERKERS_BOND_DEFENSE_PENALTY)} armor costs low-armor stacks the most.`,
    "Tome of Amplification": (language) => {
        const casters = draftable()
            .filter((unit) => spellsOf(unit).some((spell) => TOME_BUFF_SPELLS.includes(spell)) || hasAbility(unit, ["Battle Roar"]))
            .map((unit) => unit.name);
        return language === "ru"
            ? `Для заклинателей баффов: ${list(casters, language)}. С Wind Flow он сильнее замедляет ваших же летающих (−6).`
            : `Buff casters: ${list(casters, language)}. With Wind Flow it slows your own flyers harder (−6).`;
    },
    "Rime Charm": (language) =>
        language === "ru"
            ? `Для армий, которые бьют много разных стеков: уже замедленный стек нельзя заморозить снова или продлить, а каждый задетый ударом по площади или пробивающим выстрелом юнит бросает отдельно (${list(carriers(SPLASH_ABILITIES), language)}${skewerNote(language)}); −25% движения важнее всего против рывков ближнего боя.`
            : `Armies that hit many different stacks: a stack that is already slowed can't be chilled again or refreshed, and every unit struck by splash or a piercing shot rolls separately (${list(carriers(SPLASH_ABILITIES), language)}${skewerNote(language)}); −25% movement matters most against melee rushes.`,
    "Lava Striders": (language) =>
        language === "ru"
            ? "Только на FIRE PIT и только пока лава не высохнет (10-й круг, раньше после затянутых кругов): для армий, которые хотят рано занять центр, — перемещение через лаву ещё и даёт Made of Fire (+10% к характеристикам и способностям на 2 круга)."
            : "Only on FIRE PIT and only until the lava dries (lap 10, earlier after stalled laps): for armies that want the centre early — a move through lava also gives Made of Fire (+10% to stats and abilities for 2 laps).",
    "Keen Blade": (language, n) =>
        language === "ru"
            ? `Плоские +${n(A.KEEN_BLADE_FLAT)} к базовой атаке: заметны на стеках с низкой атакой (Arbalester 7 → 7,7, +10%) и почти ничего не дают юнитам 4 уровня (Black Dragon 48, +1,5%).`
            : `A flat +${n(A.KEEN_BLADE_FLAT)} base attack: worth most on low-attack stacks (an Arbalester's 7 → 7.7, +10%), close to nothing on a level-4 unit (a Black Dragon's 48, +1.5%).`,
    "Iron Plate": (language, n) =>
        language === "ru"
            ? `Плоские +${n(A.IRON_PLATE_FLAT)} к базовой броне: заметны на стеках с низкой бронёй (Peasant 7 → 8 — примерно на 12% меньше физического урона) и мало что дают бронированным (Black Dragon 40 → 41 — около 2%).`
            : `A flat +${n(A.IRON_PLATE_FLAT)} base armor: worth most on low-armor stacks (a Peasant's 7 → 8, about 12% less physical damage), little on armored ones (a Black Dragon's 40 → 41, about 2%).`,
    "Titan Plate": (language, n) =>
        language === "ru"
            ? `+${n(A.TITAN_PLATE_PERCENT)}% базовой брони каждому юниту — считается после апгрейда «Броня», Pegasus Might и Wind Flow и добавляется отдельным бонусом, поэтому процентные баффы брони его не умножают: примерно на ${n(100 - 10000 / (100 + A.TITAN_PLATE_PERCENT))}% меньше физического урона всем, какой бы ни была броня. Смягчает и Fire Breath, но не помогает против заклинаний и Fire Shield.`
            : `+${n(A.TITAN_PLATE_PERCENT)}% of base armor for every unit — counted after the Armor augment, Pegasus Might and Wind Flow, and added as its own bonus, so percentage armor buffs don't multiply it: about ${n(100 - 10000 / (100 + A.TITAN_PLATE_PERCENT))}% less physical damage for everyone, whatever their armor. It also softens Fire Breath, but does nothing against cast spells or Fire Shield.`,
    "Mage's Ring": (language) => magicDealersFit(language),
    "Archmage's Ring": (language) => magicDealersFit(language),
};

function magicDealersFit(language: NoteLanguage): string {
    const dealers = draftable()
        .filter((unit) => spellsOf(unit).some((spell) => MAGIC_DAMAGE_SPELLS.has(spell)) || hasAbility(unit, MAGIC_DAMAGE_ABILITIES))
        .map((unit) => unit.name);
    return language === "ru"
        ? `Для армий с магическим уроном: ${list(dealers, language)}. Складывается в одну сумму с апгрейдом «Магия» (Empower) и Sylvan Focus.`
        : `Armies with magic damage: ${list(dealers, language)}. It adds into one sum with the Empower augment and Sylvan Focus.`;
}

/** Which armies an artifact suits, and where it is wasted — from the units that actually carry what it boosts. */
export const artifactFit = (name: string, language: NoteLanguage): string | undefined =>
    FITS[name]?.(language, (value) => formatNumber(Math.round(value * 10) / 10, language));
