import { ARTIFACT_POWER as A } from "@heroesofcrypto/common/src/artifacts/artifact_properties";

import { renderNote, type NoteLanguage, type NoteSpec } from "./format";

const physicalAreaAttacks = {
    en: "Area Throw, Large Caliber, Chakram, Lightning Spin, Through Shot and the unit behind a Skewer Strike",
    ru: "Area Throw, Large Caliber, Chakram, Lightning Spin, Through Shot и юнит за целью Skewer Strike",
};

const ARTIFACT_NOTES: Readonly<Record<string, NoteSpec>> = {
    "Veteran Helm": {
        en: ({ n }) =>
            `Every unit's armor is ${n(A.VETERAN_HELM_PERCENT)}% higher for the whole fight — a defense-only artifact.`,
        ru: ({ n }) =>
            `Броня каждого юнита на ${n(A.VETERAN_HELM_PERCENT)}% выше весь бой — артефакт только на защиту.`,
    },
    "Amulet of Resolve": {
        en: ({ n }) =>
            `${n(A.AMULET_OF_RESOLVE_RESIST_PERCENT)}% status resistance for every unit: Stun, Freeze and Paralysis land ${n(A.AMULET_OF_RESOLVE_RESIST_PERCENT)}% less often (the chance is multiplied by ${n(1 - A.AMULET_OF_RESOLVE_RESIST_PERCENT / 100)}), and physical area damage taken — ${physicalAreaAttacks.en} — is multiplied by ${n(1 - A.AMULET_OF_RESOLVE_RESIST_PERCENT / 100)}. That cancels most of an opponent's Giant's Maul. It does nothing against magic.`,
        ru: ({ n }) =>
            `${n(A.AMULET_OF_RESOLVE_RESIST_PERCENT)}% сопротивления статусам каждому юниту: Stun, Freeze и Paralysis срабатывают на ${n(A.AMULET_OF_RESOLVE_RESIST_PERCENT)}% реже (шанс умножается на ${n(1 - A.AMULET_OF_RESOLVE_RESIST_PERCENT / 100)}), а получаемый физический урон по площади — ${physicalAreaAttacks.ru} — умножается на ${n(1 - A.AMULET_OF_RESOLVE_RESIST_PERCENT / 100)}. Это гасит большую часть Giant's Maul соперника. Против магии не помогает.`,
    },
    "Keen Blade": {
        en: ({ n }) => `+${n(A.KEEN_BLADE_FLAT)} base attack for every unit, melee and ranged alike.`,
        ru: ({ n }) => `+${n(A.KEEN_BLADE_FLAT)} к базовой атаке каждому юниту — и в ближнем бою, и в дальнем.`,
    },
    "Iron Plate": {
        en: ({ n }) => `+${n(A.IRON_PLATE_FLAT)} base armor for every unit.`,
        ru: ({ n }) => `+${n(A.IRON_PLATE_FLAT)} к базовой броне каждому юниту.`,
    },
    "Swift Boots": {
        en: ({ n }) =>
            `Only non-flying units whose attack is plain melee get +${n(A.SWIFT_BOOTS_STEPS)}% of their steps — not flyers, shooters, casters (Healer, Satyr) or melee/magic units such as the Battle Mage, Troll, Ogre Mage or Behemoth.`,
        ru: ({ n }) =>
            `Только нелетающие юниты с обычной ближней атакой получают +${n(A.SWIFT_BOOTS_STEPS)}% своих шагов — не летающие, не стрелки, не маги (Healer, Satyr) и не юниты ближнего боя с магией вроде Battle Mage, Troll, Ogre Mage или Behemoth.`,
    },
    "Winged Boots": {
        en: ({ n }) =>
            `Every flying unit gets +${n(A.WINGED_BOOTS_STEPS)} movement and +${n(A.WINGED_BOOTS_ARMOR)} armor.`,
        ru: ({ n }) =>
            `Каждый летающий юнит получает +${n(A.WINGED_BOOTS_STEPS)} к движению и +${n(A.WINGED_BOOTS_ARMOR)} к броне.`,
    },
    "Dual Strike Charm": {
        en: ({ n }) =>
            `The second strike of Double Punch (Berserker, Crusader, Wolf) and the second arrow of Double Shot (Elf) deal +${n(A.DUAL_STRIKE_SECOND_ATTACK_PERCENT)}%. It does nothing for the Gargantuan's second boulder or a Craft-forged Double Punch, and nothing at all for an army without those abilities.`,
        ru: ({ n }) =>
            `Второй удар Double Punch (Berserker, Crusader, Wolf) и вторая стрела Double Shot (Elf) наносят на ${n(A.DUAL_STRIKE_SECOND_ATTACK_PERCENT)}% больше. Второму валуну Gargantuan и выкованному Craft Double Punch не помогает, а армии без этих способностей не даёт ничего.`,
    },
    "Wounding Charm": {
        en: () =>
            "Every unit in the army gets Deep Wounds Level 1: each landed melee hit adds 1.2 per stack power (6 at full stack) plus 1 per point of luck to the target's wounds for 3 laps, stacking; and every unit holding a Deep Wounds card deals that many percent more to the wounded target. Shots benefit from wounds but never add them; natives with a higher level add the two cards together.",
        ru: () =>
            "Каждый юнит армии получает Deep Wounds Level 1: каждое попадание в ближнем бою добавляет цели 1,2 за единицу силы стека (6 при полной силе) плюс 1 за очко удачи раны на 3 круга, с накоплением, а каждый юнит с картой Deep Wounds наносит раненой цели на столько же процентов больше. Выстрелы пользуются ранами, но не добавляют их; у юнитов со своей картой более высокого уровня карты суммируются.",
    },
    "Cursed Ward": {
        en: ({ n }) =>
            `+${n(A.CURSED_WARD_LUCK)} luck and −${n(A.CURSED_WARD_MORALE_PENALTY)} morale for every unit: less damage taken and better ability chances, paid for with more Dismorale rolls.`,
        ru: ({ n }) =>
            `+${n(A.CURSED_WARD_LUCK)} к удаче и −${n(A.CURSED_WARD_MORALE_PENALTY)} к морали каждому юниту: меньше получаемого урона и выше шансы способностей ценой частых срабатываний Dismorale.`,
    },
    "Hunter's Longbow": {
        en: ({ n }) =>
            `Every ranged unit gets +${n(A.LONGBOW_ATTACK_FLAT_PER_ARCHER)} base attack per ranged stack in the army (counted when the fight starts; split stacks count, deaths don't lower it), only while it shoots. No downside.`,
        ru: ({ n }) =>
            `Каждый стрелок получает +${n(A.LONGBOW_ATTACK_FLAT_PER_ARCHER)} к базовой атаке за каждый стек стрелков в армии (считается в начале боя; разделённые стеки считаются, гибель не уменьшает), только когда стреляет. Без недостатков.`,
    },
    "Helm of Focus": {
        en: ({ n }) =>
            `${n(A.HELM_OF_FOCUS_RESIST_PERCENT)}% mind resistance for every unit: Blindness, Aggr, Boar Saliva, Terrifying Gaze and the Petrifying Gaze petrify roll land ${n(A.HELM_OF_FOCUS_RESIST_PERCENT)}% less often. It is separate from magic resistance and doesn't reduce damage.`,
        ru: ({ n }) =>
            `${n(A.HELM_OF_FOCUS_RESIST_PERCENT)}% сопротивления ментальным эффектам каждому юниту: Blindness, Aggr, Boar Saliva, Terrifying Gaze и бросок окаменения Petrifying Gaze срабатывают на ${n(A.HELM_OF_FOCUS_RESIST_PERCENT)}% реже. Это не сопротивление магии, и урон оно не снижает.`,
    },
    "Mage's Ring": {
        en: ({ n }) =>
            `+${n(A.MAGES_RING_MAGIC_PERCENT)}% magic damage for the army — spells, Fire Wall, Fireforged Sword, Chain Lightning, Fire Breath and Fire Shield — added to the Empower augment, the Empower scroll and Sylvan Focus as one sum.`,
        ru: ({ n }) =>
            `+${n(A.MAGES_RING_MAGIC_PERCENT)}% к магическому урону армии — заклинания, Fire Wall, Fireforged Sword, Chain Lightning, Fire Breath и Fire Shield — в одной сумме с апгрейдом «Магия», свитком Empower и Sylvan Focus.`,
    },
    "Warlord's Edge": {
        en: ({ n }) =>
            `Every unit gets +${n(A.WARLORDS_EDGE_PERCENT)}% of its base attack as extra attack, melee and ranged; it is added on top rather than into base attack, so auras and Riot don't multiply it.`,
        ru: ({ n }) =>
            `Каждый юнит получает +${n(A.WARLORDS_EDGE_PERCENT)}% базовой атаки как дополнительную атаку, в ближнем и дальнем бою; она добавляется сверху, а не в базовую атаку, поэтому ауры и Riot её не умножают.`,
    },
    "Titan Plate": {
        en: ({ n }) => `Every unit's defense is ${n(A.TITAN_PLATE_PERCENT)}% higher against melee and shots alike.`,
        ru: ({ n }) => `Защита каждого юнита на ${n(A.TITAN_PLATE_PERCENT)}% выше — и от ближних атак, и от выстрелов.`,
    },
    "Clover of Fortune": {
        en: ({ n }) =>
            `+${n(A.CLOVER_LUCK)} luck for every unit. Luck is capped at +10, so most units sit at or near +10 every lap and other luck sources (Luck Aura, the Life synergy, Luck Shield) add little or nothing; Misfortune drops a Clover unit to 0 instead of −10.`,
        ru: ({ n }) =>
            `+${n(A.CLOVER_LUCK)} к удаче каждому юниту. Удача ограничена +10, поэтому большинство юнитов каждый круг держатся на +10 или рядом, а другие источники удачи (Luck Aura, синергия Жизни, Luck Shield) почти ничего не добавляют; Misfortune опускает такого юнита до 0, а не до −10.`,
    },
    "Crown of Command": {
        en: ({ n }) =>
            `Every unit gets +${n(A.CROWN_STEPS)} movement, +${n(A.CROWN_MORALE)} morale and +${n(A.CROWN_ARMOR)} armor. The morale means more frequent Morale rolls from the first lap.`,
        ru: ({ n }) =>
            `Каждый юнит получает +${n(A.CROWN_STEPS)} к движению, +${n(A.CROWN_MORALE)} к морали и +${n(A.CROWN_ARMOR)} к броне. Мораль даёт более частые срабатывания Morale с первого круга.`,
    },
    "Giant's Maul": {
        en: ({ n }) =>
            `Physical area damage your units deal is ×${n(1 + A.GIANTS_MAUL_AOE_PERCENT / 100)} for every unit hit — ${physicalAreaAttacks.en} — before the target's status resistance: an opponent's Amulet of Resolve takes most of it back.`,
        ru: ({ n }) =>
            `Физический урон по площади ваших юнитов умножается на ${n(1 + A.GIANTS_MAUL_AOE_PERCENT / 100)} для каждого поражённого — ${physicalAreaAttacks.ru} — до учёта сопротивления статусам цели: Amulet of Resolve соперника забирает большую часть бонуса.`,
    },
    "Pendant of Vitality": {
        en: ({ n }) =>
            `Every creature's max health is ${n(A.PENDANT_HP_PERCENT)}% higher and every unit's base attack ${n(A.PENDANT_ATTACK_PENALTY_PERCENT)}% lower.`,
        ru: ({ n }) =>
            `Максимальное здоровье каждого существа на ${n(A.PENDANT_HP_PERCENT)}% выше, а базовая атака каждого юнита на ${n(A.PENDANT_ATTACK_PENALTY_PERCENT)}% ниже.`,
    },
    "Farsight Quiver": {
        en: ({ n }) =>
            `Every shooter's shot distance grows by ${n(A.FARSIGHT_QUIVER_RANGE_PERCENT)}% of its base distance, widening every falloff band; it adds to the Sniper augment's bonus (both count from the base) rather than multiplying it.`,
        ru: ({ n }) =>
            `Дистанция выстрела каждого стрелка растёт на ${n(A.FARSIGHT_QUIVER_RANGE_PERCENT)}% базовой, расширяя каждую полосу дальности; бонус складывается с апгрейдом «Стрельба» (оба считаются от базы), а не умножается на него.`,
    },
    "Berserker's Bond": {
        en: ({ n }) =>
            `+${n(A.BERSERKERS_BOND_ATTACK)} base attack and −${n(A.BERSERKERS_BOND_DEFENSE_PENALTY)} defense for every unit.`,
        ru: ({ n }) =>
            `+${n(A.BERSERKERS_BOND_ATTACK)} к базовой атаке и −${n(A.BERSERKERS_BOND_DEFENSE_PENALTY)} к защите каждому юниту.`,
    },
    "Tome of Amplification": {
        en: ({ n }) =>
            `A buff your units cast on your own army — the caster included — works at ${n(100 + A.TOME_BUFF_POWER_PERCENT)}% of its number: Riot 30 → 45%, Spiritual Armor 30 → 45%, Magic Mirror 40 → 60%, Empower 25 → 37.5%, Fireforged Sword 20 → 30%, Helping Hand 30 → 45%. Heal and Resurrection are excluded, and buffs without a number (Blessing, Courage, runes) are unchanged.`,
        ru: ({ n }) =>
            `Бафф, который ваши юниты накладывают на свою армию — включая заклинателя, — действует на ${n(100 + A.TOME_BUFF_POWER_PERCENT)}% своего числа: Riot 30 → 45%, Spiritual Armor 30 → 45%, Magic Mirror 40 → 60%, Empower 25 → 37,5%, Fireforged Sword 20 → 30%, Helping Hand 30 → 45%. Heal и Resurrection не усиливаются, а баффы без числа (Blessing, Courage, руны) не меняются.`,
    },
    "Rime Charm": {
        en: ({ n }) =>
            `Every hit your units land — retaliations and each unit struck by splash or a piercing shot included — has ${n(A.RIME_PROC_PERCENT)}% to put Quagmire (−25% movement) on the target for ${n(A.RIME_SLOW_LAPS)} laps. It doesn't stack or refresh, and resistances don't reduce it.`,
        ru: ({ n }) =>
            `Каждое попадание ваших юнитов — включая ответы и каждого, кого задел удар по площади или пробивающий выстрел, — с шансом ${n(A.RIME_PROC_PERCENT)}% накладывает на цель Quagmire (−25% движения) на ${n(A.RIME_SLOW_LAPS)} круга. Не складывается и не обновляется, сопротивления его не снижают.`,
    },
    "Lava Striders": {
        en: () =>
            "Every unit may cross and stand in the FIRE PIT's central lava; a move that crosses or ends on lava gives Made of Fire for 2 laps (+10% health, attack, armor, movement, initiative, shot range, magic resistance and ability power), not refreshed while active. It matters only on FIRE PIT and only until the pool dries at the start of lap 10.",
        ru: () =>
            "Каждый юнит может проходить по центральной лаве FIRE PIT и стоять в ней; перемещение через лаву или с остановкой в ней даёт Made of Fire на 2 круга (+10% к здоровью, атаке, броне, движению, инициативе, дистанции выстрела, сопротивлению магии и силе способностей), не обновляясь, пока действует. Полезен только на FIRE PIT и только пока озеро не высохнет в начале 10-го круга.",
    },
    "Archmage's Ring": {
        en: ({ n }) =>
            `+${n(A.ARCHMAGES_RING_MAGIC_PERCENT)}% magic damage for the army — spells, Fire Wall, Fireforged Sword, Chain Lightning, Fire Breath and Fire Shield — added to the Empower augment, the Empower scroll and Sylvan Focus as one sum (with Empower level 3 that is +44%).`,
        ru: ({ n }) =>
            `+${n(A.ARCHMAGES_RING_MAGIC_PERCENT)}% к магическому урону армии — заклинания, Fire Wall, Fireforged Sword, Chain Lightning, Fire Breath и Fire Shield — в одной сумме с апгрейдом «Магия», свитком Empower и Sylvan Focus (с «Магией» 3 уровня это +44%).`,
    },
};

export const artifactNote = (name: string, language: NoteLanguage): string | undefined =>
    renderNote(ARTIFACT_NOTES[name], 0, language);
