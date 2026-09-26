import spellsJson from "@heroesofcrypto/common/src/configuration/spells.json";
import { ARTIFACT_POWER } from "@heroesofcrypto/common/src/artifacts/artifact_properties";

import { abilityNote } from "./abilities";
import { renderNote, type NoteLanguage, type NoteSpec } from "./format";

const tome = ARTIFACT_POWER.TOME_BUFF_POWER_PERCENT;
/** A buff's number under Tome of Amplification, as the engine scales it. */
const amplified = (power: number): number => (power * (100 + tome)) / 100;

const damageTail = {
    en: "ignoring armor and cut by magic resistance",
    ru: "без учёта брони, с учётом сопротивления магии",
};

const SPELL_NOTES: Readonly<Record<string, NoteSpec>> = {
    Heal: {
        en: ({ p, n }) =>
            `Heals the target's wounded front creature by ${n(p)} per Healer alive in the casting stack (×1.25 on Morale, ×0.8 on Dismorale), rounded down — never past its max health and never raising the dead. Only wounded allies can be targeted; Mechanism units can't be healed and 100%-magic-resistance units can't be targeted.`,
        ru: ({ p, n }) =>
            `Лечит раненое переднее существо цели на ${n(p)} за каждого живого Healer в стеке заклинателя (×1,25 при Morale, ×0,8 при Dismorale), с округлением вниз — не выше его максимального здоровья и без воскрешения погибших. Целью может быть только раненый союзник; Mechanism вылечить нельзя, а юнитов со 100% сопротивления магии нельзя выбрать целью.`,
    },
    "Spiritual Armor": {
        en: ({ p, n }) =>
            `+${n(p)}% armor for 3 laps (one lap more when cast on itself) — about ${n(100 - 10000 / (100 + p))}% less physical damage taken, nothing against spells. Tome of Amplification makes it +${n(amplified(p))}%. On a flyer with Nature's Flying Armor synergy it doesn't add to that bonus: the flyer gets ${n(p)}% × (1 + the flying bonus) instead — +40.5% in place of +35% at synergy level 3.`,
        ru: ({ p, n }) =>
            `+${n(p)}% брони на 3 круга (на круг дольше, если применено на себя) — примерно на ${n(100 - 10000 / (100 + p))}% меньше физического урона, против заклинаний не помогает. С Tome of Amplification — +${n(amplified(p))}%. На летающем с синергией Природы «Броня летающих» бонусы не складываются: летающий получает ${n(p)}% × (1 + бонус синергии) — +40,5% вместо +35% на 3 уровне синергии.`,
    },
    Blessing: {
        en: () =>
            "For 3 laps the ally always rolls maximum damage on every attack and retaliation. It beats Curse: a stack that is both Blessed and Cursed still rolls maximum damage. It can't be recast on a stack that still carries it — a new cast never refreshes the 3 laps.",
        ru: () =>
            "3 круга союзник всегда наносит максимальный урон каждой атакой и каждым ответом. Сильнее Curse: стек под Blessing и Curse одновременно всё равно наносит максимальный урон. Нельзя наложить повторно, пока он ещё действует на стеке, — новое применение не обновляет 3 круга.",
    },
    Courage: {
        en: () =>
            "Fixes the ally's morale at +20 for 3 laps: a 20% Morale roll every lap (acting first with ×1.25 damage) and no morale loss meanwhile. With Sadness also on the stack, morale is fixed at 0 instead — no Morale or Dismorale — until one of them ends; Madness and Mechanism units are immune (Mind). In a stalled fight the +20 also becomes extra movement.",
        ru: () =>
            "Фиксирует мораль союзника на +20 на 3 круга: каждый круг 20% шанс Morale (ход первым с ×1,25 урона) и никаких потерь морали. Если на стеке ещё и Sadness, мораль вместо этого фиксируется на 0 — ни Morale, ни Dismorale, — пока один из них не закончится; у Madness и Mechanism иммунитет (Разум). В затянувшемся бою +20 ещё и превращается в дополнительное движение.",
    },
    "Helping Hand": {
        en: ({ p, n }) =>
            `For 3 laps the ally's creatures gain ${n(p)}% of one Satyr's max health and ${n(p)}% of its base armor, and the Satyr loses the same. It can't target the Satyr itself or another Satyr stack; Tome of Amplification makes the gift ${n(amplified(p))}% while the Satyr still pays ${n(p)}%.`,
        ru: ({ p, n }) =>
            `3 круга существа союзника получают ${n(p)}% максимального здоровья одного Satyr и ${n(p)}% его базовой брони, а Satyr теряет столько же. Нельзя применить на себя или на другой стек Satyr; с Tome of Amplification подарок — ${n(amplified(p))}%, а Satyr по-прежнему теряет ${n(p)}%.`,
    },
    "Mass Heal": {
        en: ({ p, n }) =>
            `Every ally, the caster included, heals its wounded front creature by ${n(p)} per Healer alive in the casting stack, rounded down; morale doesn't change it. It skips 100%-magic-resistance and Mechanism units and can be cast only while some ally is wounded.`,
        ru: ({ p, n }) =>
            `Каждый союзник, включая заклинателя, лечит раненое переднее существо на ${n(p)} за каждого живого Healer в стеке заклинателя, с округлением вниз; мораль на это не влияет. Пропускает юнитов со 100% сопротивления магии и Mechanism; применить можно, только пока кто-то из союзников ранен.`,
    },
    "Lightning Strike": {
        en: ({ p, n }) =>
            `Hits one enemy anywhere on the board — nothing blocks it — for ${n(p)} per creature alive in the casting stack, ${damageTail.en}. Air magic: a Wind Element (Thunderbird) can't be targeted, and Earth Elements (Trent, Gargantuan) take ×1.5.`,
        ru: ({ p, n }) =>
            `Бьёт одного врага в любой точке поля — ничто не блокирует — на ${n(p)} за каждое живое существо в стеке заклинателя, ${damageTail.ru}. Магия воздуха: Wind Element (Thunderbird) нельзя выбрать целью, а Earth Element (Trent, Gargantuan) получают ×1,5.`,
    },
    "Summon Wolves": {
        en: ({ p, n }) =>
            `Summons ${n(p)} Wolves per Satyr alive in the casting stack (rounded down) next to the caster for the rest of the fight — ordinary Wolves with Double Punch and Deep Wounds Level 1; a later cast adds to the existing summoned stack. Refused if there is no room. Summoned Wolves new to your army can raise the Nature synergy count.`,
        ru: ({ p, n }) =>
            `Призывает рядом с заклинателем ${n(p)} Wolf за каждого живого Satyr в стеке (с округлением вниз) до конца боя — обычных Wolf с Double Punch и Deep Wounds Level 1; повторный призыв пополняет уже призванный стек. Если места нет, заклинание не срабатывает. Призванные Wolf, новые для вашей армии, могут поднять счётчик синергии Природы.`,
    },
    Whirlpool: {
        en: () =>
            "Chains an enemy for 1 lap: it can't move and skips its next turn, but it still retaliates. Magic resistance can resist it; it is water magic, so a Water Element (Mermaid) can't be targeted. The skipped turn costs the victim 1 morale.",
        ru: () =>
            "Приковывает врага на 1 круг: он не может двигаться и пропускает следующий ход, но всё ещё отвечает на атаки. Сопротивление магии может защитить; это магия воды, поэтому Water Element (Mermaid) нельзя выбрать целью. Пропущенный ход стоит жертве 1 морали.",
    },
    "Meteor Shower": {
        en: ({ p, n }) =>
            `Hits every enemy in a 3×3 block centred on any cell — no line of sight needed, your own units are safe — for ${n(p)} per creature alive in the casting stack, ${damageTail.en}. The block must be on the board and cover at least one enemy, or the cast is refused without spending the charge. Earth magic: Earth Elements take nothing, Wind Elements ×1.5. It needs the caster at full stack (stack power 5), measured against the strongest stack on the board: losses or a split lock it, and so can an enemy stack grown by Life's Supply synergy at level 3 (9 Monks, 1,278 experience), which drops untouched stacks of up to 1,022 experience to stack power 4.`,
        ru: ({ p, n }) =>
            `Бьёт каждого врага в блоке 3×3 с центром в любой клетке — прямая видимость не нужна, ваши юниты в безопасности — на ${n(p)} за каждое живое существо в стеке заклинателя, ${damageTail.ru}. Блок должен быть на поле и накрывать хотя бы одного врага, иначе применение отклоняется без траты заряда. Магия земли: Earth Element не получают урона, Wind Element — ×1,5. Нужна полная сила стека заклинателя (5), а она считается от сильнейшего стека на поле: потери или разделение закрывают его, как и вражеский стек, выросший от синергии Жизни «Запас» 3 уровня (9 Monk, 1278 опыта), — он опускает нетронутые стеки до 1022 опыта до силы 4.`,
    },
    "Ring of Fire": {
        en: ({ p, n }) =>
            `Aimed at an enemy in line of sight, it burns every other unit on a cell touching that enemy — friend or foe, 8 cells around a 1×1 target, 12 around a 2×2 — for ${n(p)} per creature alive in the casting stack, ${damageTail.en}. The aimed enemy itself is not hurt and the caster never burns; if nobody stands next to the target, the scroll is wasted. Fire magic: Fire Elements are untouched, Water Elements take ×1.5.`,
        ru: ({ p, n }) =>
            `Нацеленное на врага в прямой видимости, оно обжигает всех остальных юнитов на клетках вплотную к нему — своих и чужих, 8 клеток вокруг цели 1×1 и 12 вокруг 2×2 — на ${n(p)} за каждое живое существо в стеке заклинателя, ${damageTail.ru}. Сам выбранный враг не получает урона, а заклинатель никогда не горит; если рядом с целью никого нет, свиток потрачен впустую. Магия огня: Fire Element не задевает, Water Element получает ×1,5.`,
    },
    Empower: {
        en: ({ p, n }) =>
            `For 3 laps the ally deals +${n(p)}% magic damage — spells, Fire Wall burns (fixed when the wall is cast), Chain Lightning, Fire Breath and Fire Shield — added to other magic-damage bonuses (the augment, the Mage's rings, Sylvan Focus) as one sum. Tome of Amplification makes it +${n(amplified(p))}%. Fireforged Sword is not raised.`,
        ru: ({ p, n }) =>
            `3 круга союзник наносит на ${n(p)}% больше магического урона — заклинания, горение Fire Wall (фиксируется при создании стены), Chain Lightning, Fire Breath и Fire Shield, — в одной сумме с другими бонусами к магическому урону (апгрейд, кольца магов, Sylvan Focus). С Tome of Amplification — +${n(amplified(p))}%. Fireforged Sword не усиливается.`,
    },
    "Fire Strike": {
        en: ({ p, n }) =>
            `A fireball at an enemy in line of sight: it flies over your own units, hits the first enemy in its path and deals ${n(p)} per creature alive in the casting stack, ${damageTail.en}. The mountain blocks it. Fire magic: Fire Elements can't be targeted, Water Elements take ×1.5.`,
        ru: ({ p, n }) =>
            `Огненный шар во врага в прямой видимости: пролетает над вашими юнитами, попадает в первого врага на пути и наносит ${n(p)} за каждое живое существо в стеке заклинателя, ${damageTail.ru}. Гора его останавливает. Магия огня: Fire Element нельзя выбрать целью, Water Element получает ×1,5.`,
    },
    Fireball: {
        en: ({ p, n }) =>
            `Deals ${n(p)} per creature alive in the casting stack to the enemy it strikes and to every unit touching it, friend or foe (never the caster), ${damageTail.en}. It flies like Fire Strike: the first enemy in its path takes it. Fire magic: Fire Elements take nothing, Water Elements ×1.5.`,
        ru: ({ p, n }) =>
            `Наносит ${n(p)} за каждое живое существо в стеке заклинателя врагу, в которого попал, и каждому юниту вплотную к нему, своему или чужому (но не заклинателю), ${damageTail.ru}. Летит как Fire Strike: удар принимает первый враг на пути. Магия огня: Fire Element не получает урона, Water Element — ×1,5.`,
    },
    "Fireforged Sword": {
        en: ({ p, n }) =>
            `For 3 laps the ally's melee and ranged attacks — retaliations included — set every unit they damage alight for ${n(p)}% of the damage that landed. Area attacks count: a pierce, a splash, a spin or a bounce burns each creature for its own share. Fire: armor doesn't reduce it, magic resistance does; Water Elements take ×1.5, Fire Elements nothing. Magic-damage bonuses do not raise the percentage. Tome of Amplification makes it ${n(amplified(p))}%.`,
        ru: ({ p, n }) =>
            `3 круга атаки союзника в ближнем и дальнем бою — включая ответы — поджигают каждого, по кому прошёл урон, на ${n(p)}% нанесённого урона. Удары по площади тоже: пробивание, залп, вращение и отскок поджигают каждое задетое существо на его собственную долю. Это огонь: броня его не снижает, сопротивление магии снижает; Water Element получает ×1,5, Fire Element — ничего. Бонусы к магическому урону процент не повышают. С Tome of Amplification — ${n(amplified(p))}%.`,
    },
    Riot: {
        en: ({ p, n }) =>
            `+${n(p)}% damage for 3 laps. It doesn't stack with Mass Riot: whichever is on the unit first stays (Riot can't be cast on a unit under Mass Riot, and Mass Riot skips a unit that has Riot); Tome of Amplification makes it +${n(amplified(p))}%.`,
        ru: ({ p, n }) =>
            `+${n(p)}% урона на 3 круга. Не складывается с Mass Riot: остаётся тот, что наложен первым (Riot нельзя применить к юниту под Mass Riot, а Mass Riot пропускает юнита с Riot); с Tome of Amplification — +${n(amplified(p))}%.`,
    },
    "Mass Riot": {
        en: ({ p, n }) =>
            `+${n(p)}% damage for every ally for 3 laps. It doesn't stack with Riot: allies that already have Riot keep it and are skipped; Tome of Amplification makes it +${n(amplified(p))}%.`,
        ru: ({ p, n }) =>
            `+${n(p)}% урона каждому союзнику на 3 круга. Не складывается с Riot: союзники, на которых уже есть Riot, сохраняют его и пропускаются; с Tome of Amplification — +${n(amplified(p))}%.`,
    },
    "Fire Wall": {
        en: ({ p, n }) =>
            `Lights up to 4 free cells in a straight line anywhere on the board until the third lap change after the cast. Every creature entering a burning cell — friend or foe — pays 1 extra step and loses ${n(p)}% of its stack's total max health (all living creatures, at least 1), raised by the caster's magic-damage bonuses at cast time. Armor doesn't reduce it; magic resistance does (100% blocks it), and Heavy Armor raises it. Fire Elements are immune, Water Elements take ×1.5, and a Water Shield absorbs one burn. Standing still in the fire is safe, but being pushed in by narrowing burns.`,
        ru: ({ p, n }) =>
            `Поджигает до 4 свободных клеток по прямой в любом месте поля до третьей смены круга после применения. Каждое существо, входящее в горящую клетку, — своё или чужое — тратит 1 лишний шаг и теряет ${n(p)}% суммарного максимального здоровья своего стека (всех живых существ, минимум 1), с повышением от бонусов заклинателя к магическому урону на момент применения. Броня его не снижает, а сопротивление магии снижает (100% блокирует), Heavy Armor повышает. Fire Element неуязвим, Water Element получает ×1,5, а Water Shield поглощает одно горение. Стоять в огне безопасно, но выталкивание в него сужением обжигает.`,
    },
    "Magic Mirror": {
        en: ({ p, n }) =>
            `For 3 laps the holder still takes every hit in full, but the attacker also takes ${n(p)}% of the magic damage that landed — reduced by its own element and magic resistance; a Water Shield can absorb it — including Fire Breath, Chain Lightning, Fire Shield and Fireforged burns. A debuff spell (or a Spit Ball or Hamstring debuff) has ${n(p)}% to be copied onto its caster as well; the holder keeps it. Status effects, Castling and the Vine snare aren't mirrored. It doesn't stack with Mass Magic Mirror: whichever is on the unit first stays; Tome of Amplification makes it ${n(amplified(p))}%. On a Magic Dragon it doesn't add to Magic Reflection: a damage spell returns Reflection's share when that procs and the Mirror's otherwise.`,
        ru: ({ p, n }) =>
            `3 круга владелец по-прежнему получает каждый удар целиком, но атакующий тоже получает ${n(p)}% прошедшего магического урона — с учётом своей стихии и сопротивления магии; Water Shield может его поглотить, — включая Fire Breath, Chain Lightning, Fire Shield и поджоги Fireforged. Дебафф заклинания (или Spit Ball и Hamstring) с шансом ${n(p)}% копируется и на заклинателя; у владельца он остаётся. Эффекты Статуса, Castling и захват лозой не отражаются. Не складывается с Mass Magic Mirror: остаётся тот, что наложен первым; с Tome of Amplification — ${n(amplified(p))}%. На Magic Dragon не складывается с Magic Reflection: заклинание урона возвращается по доле Reflection, если она сработала, иначе по доле Mirror.`,
    },
    "Mass Magic Mirror": {
        en: ({ p, n }) =>
            `Magic Mirror at ${n(p)}% on every ally for 3 laps: attackers also take ${n(p)}% of the magic damage that lands, and debuffs have ${n(p)}% to be copied onto their caster. It doesn't stack with Magic Mirror: allies that already have it keep it and are skipped; Tome of Amplification makes it ${n(amplified(p))}%.`,
        ru: ({ p, n }) =>
            `Magic Mirror в ${n(p)}% на каждом союзнике на 3 круга: атакующие тоже получают ${n(p)}% прошедшего магического урона, а дебаффы с шансом ${n(p)}% копируются на заклинателя. Не складывается с Magic Mirror: союзники, на которых он уже есть, сохраняют его и пропускаются; с Tome of Amplification — ${n(amplified(p))}%.`,
    },
    Meteorite: {
        en: ({ p, n }) =>
            `Hits every enemy under a 2×2 block anywhere on the board for ${n(p)} per creature alive in the casting stack, ${damageTail.en}; the block must be on the board and cover an enemy, or the cast is refused. Earth magic: Earth Elements take nothing, Wind Elements ×1.5. It needs the caster at full stack (stack power 5), measured against the strongest stack on the board: losses or a split lock it, and so can an enemy stack grown by Life's Supply synergy at level 3 (9 Monks, 1,278 experience), which drops untouched stacks of up to 1,022 experience to stack power 4.`,
        ru: ({ p, n }) =>
            `Бьёт каждого врага под блоком 2×2 в любом месте поля на ${n(p)} за каждое живое существо в стеке заклинателя, ${damageTail.ru}; блок должен быть на поле и накрывать врага, иначе применение отклоняется. Магия земли: Earth Element не получает урона, Wind Element — ×1,5. Нужна полная сила стека заклинателя (5), а она считается от сильнейшего стека на поле: потери или разделение закрывают его, как и вражеский стек, выросший от синергии Жизни «Запас» 3 уровня (9 Monk, 1278 опыта), — он опускает нетронутые стеки до 1022 опыта до силы 4.`,
    },
    Misfortune: {
        en: () =>
            "Sets the target's luck to −10 for 3 laps (to 0 if it has Luck Aura or Clover of Fortune); nothing raises it meanwhile, not even Luck Shield. Mind: Madness and Mechanism units are immune, and magic resistance can resist it. −10 luck means about 10% more attack damage taken and −10 points on the target's ability chances.",
        ru: () =>
            "Устанавливает удачу цели в −10 на 3 круга (в 0, если у неё Luck Aura или Clover of Fortune); ничто не поднимает её в это время, даже Luck Shield. Разум: у Madness и Mechanism иммунитет, а сопротивление магии может защитить. −10 удачи — это примерно на 10% больше урона от атак и −10 пунктов к шансам способностей цели.",
    },
    Smoke: {
        en: () =>
            "Fills a 3×3 block of empty cells anywhere with smoke for 3 laps. Any shot whose path crosses a smoked cell — from either side — has its range divisor doubled (full → ½, ½ → ¼, at most ⅛), Sniper shots included. A creature that ends its move on a smoked cell clears that cell.",
        ru: () =>
            "Заполняет дымом блок 3×3 из пустых клеток в любом месте поля на 3 круга. У любого выстрела — любой стороны, — путь которого пересекает задымлённую клетку, делитель дальности удваивается (полный → ½, ½ → ¼, не больше ⅛), выстрелы Sniper тоже. Существо, закончившее перемещение на задымлённой клетке, развеивает дым в ней.",
    },
    Hamstrung: {
        en: ({ p, n }) =>
            `−${n(p)}% movement for 3 laps. The Dryad's Hamstring gives it only to flyers, though Magic Mirror can copy it back onto the Dryad itself; magic resistance can resist it, and it multiplies with Quagmire (×${n(1 - p / 100)} × 0.75).`,
        ru: ({ p, n }) =>
            `−${n(p)}% движения на 3 круга. Hamstring у Dryad накладывает его только на летающих, но Magic Mirror может скопировать его обратно на саму Dryad; сопротивление магии может защитить, а с Quagmire замедления перемножаются (×${n(1 - p / 100)} × 0,75).`,
    },
    Quagmire: {
        en: ({ p, n }) =>
            `−${n(p)}% movement for 3 laps, which also shrinks movement bonuses such as Chaos's Movement synergy. Applied by the Beholder's Spit Ball (magic resistance can resist it) and by the Rime Charm artifact (no resist roll, though 100% magic resistance blocks it). It multiplies with Hamstrung: ×0.75 × 0.7 = ×0.525 movement (−47.5%).`,
        ru: ({ p, n }) =>
            `−${n(p)}% движения на 3 круга; процент урезает и бонусы к движению, например синергию Хаоса «Передвижение». Накладывается Spit Ball у Beholder (сопротивление магии может защитить) и артефактом Rime Charm (без броска сопротивления, но 100% сопротивления магии его блокирует). С Hamstrung замедления перемножаются: ×0,75 × 0,7 = ×0,525 движения (−47,5%).`,
    },
    "Weakening Beam": {
        en: ({ p, n }) => `−${n(p)}% base armor for 3 laps; applied by the Beholder's Spit Ball.`,
        ru: ({ p, n }) => `−${n(p)}% базовой брони на 3 круга; накладывается Spit Ball у Beholder.`,
    },
    Weakness: {
        en: ({ p, n }) => `−${n(p)}% base attack for 3 laps; applied by the Beholder's Spit Ball.`,
        ru: ({ p, n }) => `−${n(p)}% базовой атаки на 3 круга; накладывается Spit Ball у Beholder.`,
    },
    Curse: {
        en: () =>
            "For 3 laps the target always rolls its minimum damage. Applied by the Beholder's Spit Ball. It loses to Blessing and Battle Roar: a stack under either of them still rolls maximum damage, Cursed or not.",
        ru: () =>
            "3 круга цель всегда наносит минимальный урон. Накладывается Spit Ball у Beholder. Проигрывает Blessing и Battle Roar: стек под любым из них всё равно наносит максимальный урон, даже под Curse.",
    },
    Sadness: {
        en: () =>
            "Fixes morale at −20 for 3 laps: a 20% Dismorale roll each lap (acting last with ×0.8 damage). With Courage also on the stack, morale is fixed at 0 instead — no Morale or Dismorale — until one of them ends; Mind — Madness and Mechanism units are immune.",
        ru: () =>
            "Фиксирует мораль на −20 на 3 круга: каждый круг 20% шанс Dismorale (ход последним с ×0,8 урона). Если на стеке ещё и Courage, мораль вместо этого фиксируется на 0 — ни Morale, ни Dismorale, — пока один из них не закончится; Разум — у Madness и Mechanism иммунитет.",
    },
    Cowardice: {
        en: () =>
            "For 1 lap the unit can't attack or retaliate against a stack with more total remaining health than its own; area shots aren't blocked. Mind.",
        ru: () =>
            "1 круг юнит не может атаковать стек с большим суммарным оставшимся здоровьем, чем у него, и отвечать ему; выстрелы по площади не запрещены. Разум.",
    },
    Rangebane: {
        en: () => "For 1 lap the unit can neither shoot nor return fire. Mind.",
        ru: () => "1 круг юнит не может ни стрелять, ни отвечать выстрелом. Разум.",
    },
    Morale: {
        en: () =>
            "A positive morale roll at lap start (chance = morale %): for that lap the stack acts before the regular turn order with ×1.25 damage — retaliations, damage spells, Heal and Resurrection included — its buffs don't count down and its morale can't change. It doesn't grant an extra turn.",
        ru: () =>
            "Положительный бросок морали в начале круга (шанс = мораль в %): в этом круге стек ходит раньше обычной очереди с ×1,25 урона — включая ответы, заклинания урона, Heal и Resurrection, — его баффы не убывают, а мораль не меняется. Дополнительного хода не даёт.",
    },
    Dismorale: {
        en: () =>
            "A negative morale roll at lap start (chance = |morale| %): for that lap the stack acts after every regular stack with ×0.8 damage — retaliations, damage spells, Heal and Resurrection included — its debuffs and effects don't count down, and its morale can't change. It still takes its turn.",
        ru: () =>
            "Отрицательный бросок морали в начале круга (шанс = |мораль| в %): в этом круге стек ходит после всех обычных стеков с ×0,8 урона — включая ответы, заклинания урона, Heal и Resurrection, — его дебаффы и эффекты не убывают, а мораль не меняется. Ход он всё равно делает.",
    },
    "Dulling Defense": {
        en: () =>
            "The total base attack this unit has permanently lost to Goblin Knights' Dulling Defense; it never falls below 1.",
        ru: () =>
            "Сколько базовой атаки юнит навсегда потерял от Dulling Defense у Goblin Knight; ниже 1 она не опускается.",
    },
    Miner: {
        en: () => "The total base armor this unit has permanently lost to Troglodytes' Miner; it keeps at least 1.",
        ru: () => "Сколько базовой брони юнит навсегда потерял от Miner у Troglodyte; не меньше 1 у него остаётся.",
    },
    Hidden: {
        en: () =>
            "Granted by the White Tiger's Disguise Aura while no enemy stack stands within 3 cells (more with Might's Aura Range synergy): the unit can't be chosen as the target of attacks, shots or single-target spells, though splash, area spells, chain arcs and passing shots still hit it.",
        ru: () =>
            "Даётся Disguise Aura у White Tiger, пока в радиусе 3 клеток (больше с синергией Силы «Радиус аур») нет вражеского стека: юнита нельзя выбрать целью атаки, выстрела или заклинания на одну цель, но удары по площади, заклинания по области, цепные молнии и пролетающие выстрелы его задевают.",
    },
    Visible: {
        en: () =>
            "The White Tiger is Visible while an enemy stack stands within 3 cells of it (more with Might's Aura Range synergy): its Disguise stops protecting it.",
        ru: () =>
            "White Tiger видим (Visible), пока в радиусе 3 клеток (больше с синергией Силы «Радиус аур») есть вражеский стек: Disguise Aura его не защищает.",
    },
    "Armor Rune": {
        en: () =>
            "Each cast has a 50% chance to add a permanent +1 armor to the target (the Blacksmith's Enchants carry 5 casts); a failed roll still uses the scroll and the turn. An enemy Monk's Borrowed Grace can take the whole rune bonus.",
        ru: () =>
            "Каждое применение с шансом 50% навсегда добавляет цели +1 к броне (у Enchants Blacksmith 5 применений); неудачный бросок всё равно тратит свиток и ход. Borrowed Grace вражеского Monk может забрать весь бонус рун.",
    },
    "Weapon Rune": {
        en: () =>
            "Each cast has a 50% chance to add a permanent +1 attack to the target (the Blacksmith's Enchants carry 5 casts); a failed roll still uses the scroll and the turn. An enemy Monk's Borrowed Grace can take the whole rune bonus.",
        ru: () =>
            "Каждое применение с шансом 50% навсегда добавляет цели +1 к атаке (у Enchants Blacksmith 5 применений); неудачный бросок всё равно тратит свиток и ход. Borrowed Grace вражеского Monk может забрать весь бонус рун.",
    },
};

/** Spells that are the ability of the same (or a related) name — the ability's note is the right one. */
const SPELL_TO_ABILITY: Readonly<Record<string, string>> = {
    "Angelic Host Blessing": "Angelic Host Blessing",
    "Arcane Ward Blessing": "Arcane Ward Blessing",
    "Arrows Wingshield Blessing": "Arrows Wingshield Blessing",
    "Warding Mane Blessing": "Warding Mane Blessing",
    "Battle Roar": "Battle Roar",
    Castling: "Castling",
    Resurrection: "Resurrection",
    "Vine Throw": "Vine Throw",
    "Wild Regeneration": "Wild Regeneration",
    "Wind Flow": "Wind Flow",
    "Made of Fire": "Made of Fire",
    "Water Shield": "Water Shield",
    Craft: "Blacksmith Tools",
};

const spellPower = (name: string): number => {
    const books = spellsJson as unknown as Record<string, Record<string, { power?: number }> | number>;
    for (const book of Object.values(books)) {
        if (typeof book === "object" && book[name]) {
            return book[name].power ?? 0;
        }
    }
    return 0;
};

export const spellNote = (name: string, language: NoteLanguage): string | undefined => {
    const own = SPELL_NOTES[name];
    if (own) {
        return renderNote(own, spellPower(name), language);
    }
    const abilityName = SPELL_TO_ABILITY[name];
    return abilityName ? abilityNote(abilityName, language) : undefined;
};
