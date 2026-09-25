import effectsJson from "@heroesofcrypto/common/src/configuration/effects.json";
import { ARTIFACT_POWER } from "@heroesofcrypto/common/src/artifacts/artifact_properties";

import type { NoteSpec } from "./format";

const effectPower = (name: string): number =>
    (effectsJson as unknown as Record<string, { power?: number }>)[name]?.power ?? 0;

const dualStrike = ARTIFACT_POWER.DUAL_STRIKE_SECOND_ATTACK_PERCENT;

/** Deep Wounds reads the same for every level; only the per-stack-power amount differs. */
const deepWounds: NoteSpec = {
    en: ({ p, n }) =>
        `Every landed melee hit — attack, retaliation, second strike or spin — adds ${n(p / 5)} per stack power (${n(p)} at full stack) plus 1 per point of luck to the target's wounds, with no roll and no resistance. Wounds from every source add up without a cap and last the target's next 3 turns, refreshed by each new wound. Any attacker holding a Deep Wounds card deals that many percent more damage to the wounded target (Lightning Spin hits excepted), so a Deep Wounds army that focuses one stack snowballs; shots benefit but never add wounds. Wounding Charm's Level 1 adds to a higher native level (Griffin, Manticore, White Tiger, Behemoth); a Wolf, already Level 1, gains nothing from it.`,
    ru: ({ p, n }) =>
        `Каждое попадание в ближнем бою — атака, ответ, второй удар или удар вращением — добавляет цели ${n(p / 5)} за единицу силы стека (${n(p)} при полной силе) плюс 1 за очко удачи раны, без броска и без сопротивления. Раны из всех источников складываются без предела и держатся следующие 3 хода цели, обновляясь с каждой новой раной. Любой атакующий с картой Deep Wounds наносит раненой цели на столько же процентов больше урона (кроме ударов Lightning Spin), поэтому армия с Deep Wounds, бьющая один стек, набирает урон лавиной; выстрелы бонус получают, но ран не добавляют. Level 1 от Wounding Charm добавляется к более высокому своему уровню (Griffin, Manticore, White Tiger, Behemoth); Wolf, у которого уже Level 1, ничего не получает.`,
};

const craftedFrozen: NoteSpec = {
    en: ({ p, n }) =>
        `Permanent (forged by Craft). Every hit this unit lands — attacks and retaliations, melee or ranged, second strikes and splash or spin sub-hits — has ${n(p / 5)}% per stack power (${n(p)}% at full stack) plus 1% per point of luck, ×1.5 against Mechanism and lowered by status resistance, to Freeze the target: it skips its next 2 turns and cannot retaliate. Magic resistance does not block it.`,
    ru: ({ p, n }) =>
        `Навсегда (выковано Craft). Каждое попадание юнита — атаки и ответы, в ближнем бою и выстрелом, вторые удары и удары по площади или вращением — с шансом ${n(p / 5)}% за единицу силы стека (${n(p)}% при полной силе) плюс 1% за очко удачи, ×1,5 против Mechanism и с учётом сопротивления статусам, замораживает цель (Freeze): она пропускает 2 следующих хода и не может отвечать. Сопротивление магии не защищает.`,
};

export const ABILITY_NOTES_A_L: Readonly<Record<string, NoteSpec>> = {
    "Absolving Arrow": {
        en: ({ p, n }) =>
            `Every ally the Monk's arrow flies past — on its shots and counter-shots, hit or miss — rolls to shed a negative effect: the first at ${n(p / 5)}% per stack power (${n(p)}% at full stack) plus 1% per point of luck, each further one on the same ally at half the previous chance, rolled separately. Every status effect (Stun, Freeze, Blindness, Paralysis, Break, Aggr, Boar Saliva, Shatter Armor, Terrifying Gaze, Pegasus Light, Deep Wounds, Poison) goes before spell debuffs; aura penalties and cursed-artifact downsides can't be lifted.`,
        ru: ({ p, n }) =>
            `Каждый союзник, мимо которого пролетает стрела Monk — при выстреле и ответном выстреле, попала она или нет, — пытается избавиться от негативного эффекта: первого с шансом ${n(p / 5)}% за единицу силы стека (${n(p)}% при полной силе) плюс 1% за очко удачи, каждого следующего у того же союзника — вдвое реже предыдущего, отдельными бросками. Сначала снимаются эффекты-состояния (Stun, Freeze, Blindness, Paralysis, Break, Aggr, Boar Saliva, Shatter Armor, Terrifying Gaze, Pegasus Light, Deep Wounds, Poison), затем дебаффы заклинаний; штрафы аур и проклятых артефактов не снимаются.`,
    },
    "Absorb Penalties Aura": {
        en: ({ p, n }) =>
            `Covers allies within 2 cells, the Peasant included. When an enemy spell debuff, a Spit Ball debuff or Hamstring lands on one of them, the Peasant has ${n(p / 5)}% per stack power (${n(p)}% at full stack, shifted by luck) to take it instead. On-hit effects — Stun, Blindness, Freeze, Paralysis, Aggr, Poison — and the Vine Throw snare are never absorbed, and an absorbed Hamstring does nothing (the Peasant doesn't fly). An absorbed Castling swaps the Harpy with the Peasant.`,
        ru: ({ p, n }) =>
            `Действует на союзников в радиусе 2 клеток, включая самого Peasant. Когда на одного из них ложится вражеский дебафф заклинания, дебафф Spit Ball или Hamstring, Peasant с шансом ${n(p / 5)}% за единицу силы стека (${n(p)}% при полной силе, с поправкой на удачу) забирает его себе. Эффекты от ударов — Stun, Blindness, Freeze, Paralysis, Aggr, Poison — и захват Vine Throw не поглощаются никогда, а поглощённый Hamstring ничего не делает (Peasant не летает). Поглощённый Castling меняет местами Harpy и Peasant.`,
    },
    Aggr: {
        en: ({ p, n }) =>
            `Every landed melee hit — attack or retaliation — has ${n(p / 5)}% per stack power (${n(p)}% at full stack) plus 1% per point of luck, lowered by the target's mind resistance, to Aggr it until the end of its next turn: it may attack, shoot or cast spells at enemies only at this Pikeman (buffs and heals on its allies stay free), and retaliate only against it. It ends early if the Pikeman dies, isn't reapplied while active, and Madness and Mechanism units are immune.`,
        ru: ({ p, n }) =>
            `Каждое попадание в ближнем бою — атака или ответ — с шансом ${n(p / 5)}% за единицу силы стека (${n(p)}% при полной силе) плюс 1% за очко удачи, уменьшенным сопротивлением цели ментальным эффектам, накладывает Aggr до конца её следующего хода: она может атаковать, стрелять и применять заклинания на врагов только в этого Pikeman (баффы и лечение своих союзников не ограничены) и отвечать только ему. Эффект кончается раньше, если Pikeman погиб, не накладывается повторно, пока действует, а у юнитов с Madness и Mechanism иммунитет.`,
    },
    "AI Driven": {
        en: () =>
            "The owner never controls this stack: on its turn it charges the nearest enemy it can reach and never attacks the mountain; boxed in, it waits once, then defends. While it is Broken, its owner controls it.",
        ru: () =>
            "Владелец не управляет этим стеком: в свой ход он бросается на ближайшего достижимого врага и никогда не атакует гору; если он заперт, то один раз ждёт, а потом защищается. Пока на нём Break, им управляет владелец.",
    },
    "Angelic Host Blessing": {
        en: ({ p }) =>
            `While this Angel is alive and not Broken, every allied flying unit — the Angel included — gets +${p} attack, +${p} armor and +${p} movement. Walking units get nothing.`,
        ru: ({ p }) =>
            `Пока этот Angel жив и на нём нет Break, каждый союзный летающий юнит, включая самого Angel, получает +${p} к атаке, +${p} к броне и +${p} к движению. Наземные юниты не получают ничего.`,
    },
    "Arcane Ward Blessing": {
        en: ({ p }) =>
            `While a Squire lives and isn't Broken, every ally gets an extra magic-resistance roll of (${p} + the Squire's luck)%, combined with its own resistance as independent chances (15% own + 10% → 23.5%). Stack size doesn't change it, and several Squires don't stack — the strongest counts.`,
        ru: ({ p }) =>
            `Пока Squire жив и на нём нет Break, каждый союзник получает дополнительный бросок сопротивления магии в (${p} + удача Squire)%, который складывается с его собственным как независимые шансы (свои 15% + 10% → 23,5%). От размера стека не зависит; несколько Squire не складываются — действует сильнейший.`,
    },
    "Area Throw": {
        en: ({ p }) =>
            `The boulder flies over your own units and structures, lands on the first enemy in its flight path (or on the empty cell you aim at) and hits every unit in the 3×3 block around it — the target, other enemies and your own units — each for (${p} + luck)% of a normal hit with its own dodge roll; stack power does not scale it. It smashes barrels in the block. Only a throw aimed at a unit can be answered: the target shoots back once the boulder's damage has landed (on the Gargantuan, before its second boulder). An Angel with Arrows Wingshield Blessing that the boulder lands on takes it alone — and so does one standing anywhere in the block of a throw aimed at an empty cell or a barrel, even your own.`,
        ru: ({ p }) =>
            `Валун летит поверх ваших юнитов и построек, падает на первого врага на линии полёта (или на пустую клетку, в которую вы целитесь) и бьёт каждого юнита в блоке 3×3 вокруг — цель, других врагов и ваших юнитов — на (${p} + удача)% обычного удара, каждый со своим броском уклонения; сила стека на это не влияет. Он разбивает бочки в блоке. Ответить можно только на бросок в юнита: цель стреляет в ответ, когда урон валуна уже нанесён (у Gargantuan — до второго валуна). Angel с Arrows Wingshield Blessing, на которого упал валун, принимает его один — как и Angel в любой клетке блока при броске в пустую клетку или бочку, даже ваш собственный.`,
    },
    "Arrows Wingshield Blessing": {
        en: ({ p, n }) =>
            `While the Angel lives and isn't Broken, every ally gets extra armor against shots: ${n(p / 5)}% per Angel stack power (${n(p)}% at full stack), multiplied by (1 + the Angel's luck / 100); +25% armor means about 20% less damage from shots. The Angel also stops piercing shots: a Through Shot that reaches it hits it and stops, Large Caliber and Area Throw landing on it don't splash, and a Chakram can't bounce onto it — the flight ends there (a throw aimed at the Angel hits it and bounces on). Several Angels don't stack.`,
        ru: ({ p, n }) =>
            `Пока Angel жив и на нём нет Break, каждый союзник получает дополнительную броню от выстрелов: ${n(p / 5)}% за единицу силы стека Angel (${n(p)}% при полной силе), умноженные на (1 + удача Angel / 100); +25% брони — это примерно на 20% меньше урона от выстрелов. Кроме того, Angel останавливает пробивающие выстрелы: Through Shot, дойдя до него, попадает в него и останавливается, Large Caliber и Area Throw при попадании в него не бьют по площади, а Chakram не может отскочить на него — полёт на этом заканчивается (бросок прямо в Angel попадает и отскакивает дальше). Несколько Angel не складываются.`,
    },
    Backstab: {
        en: ({ p, n }) =>
            `+${n(p / 5)}% damage per stack power (+${n(p)}% at full stack) plus 1% per point of luck on melee attacks and retaliations when the Scavenger stands beyond its target along the line of advance — on the side nearer the target army's starting edge, diagonals included. Second strikes don't get it.`,
        ru: ({ p, n }) =>
            `+${n(p / 5)}% урона за единицу силы стека (+${n(p)}% при полной силе) плюс 1% за очко удачи к атакам и ответам в ближнем бою, когда Scavenger стоит за целью по линии наступления — со стороны, ближней к стартовому краю армии цели, диагонали тоже считаются. Вторые удары бонус не получают.`,
    },
    "Basic Tome of Battle Magic": {
        en: () =>
            "Spell book: Fire Strike ×3 and Meteorite ×1 per fight; Meteorite needs a full stack (stack power 5, measured against the strongest stack on the board — an enemy stack grown by Life's Supply synergy at level 3 can take it away). A damage spell deals its power per creature alive in the casting stack — stack power only decides whether it can be cast.",
        ru: () =>
            "Книга заклинаний: Fire Strike ×3 и Meteorite ×1 на бой; для Meteorite нужна полная сила стека (5; она считается от сильнейшего стека на поле — вражеский стек, выросший от синергии Жизни «Запас» 3 уровня, может её отнять). Урон заклинания — его сила за каждое живое существо в стеке заклинателя; сила стека лишь решает, можно ли его применить.",
    },
    "Battle Roar": {
        en: () =>
            "Once per fight, at stack power 3 or more: for 2 laps (the casting Behemoth included) every ally — except units with 100% magic resistance or already roaring — gets +1 movement per Behemoth alive in the casting stack and always rolls maximum damage — even when Cursed; Quagmire and Hamstrung cut the extra steps like any movement.",
        ru: () =>
            "Раз за бой при силе стека 3 и выше: на 2 круга (включая самого Behemoth) каждый союзник — кроме юнитов со 100% сопротивления магии и уже ревущих — получает +1 к движению за каждого живого Behemoth в стеке заклинателя и всегда наносит максимальный урон — даже под Curse; Quagmire и Hamstrung урезают добавочные шаги, как и любое движение.",
    },
    "Bitter Experience": {
        en: () =>
            "Whenever a single hit kills at least one Peasant and the stack survives, the stack permanently gains +1 base armor and +1 movement — once per hit, however many Peasants it killed. A hit that kills nobody gives nothing.",
        ru: () =>
            "Каждый раз, когда одно попадание убивает хотя бы одного Peasant, а стек выживает, стек навсегда получает +1 к базовой броне и +1 к движению — один раз за попадание, сколько бы Peasant ни погибло. Попадание без убитых ничего не даёт.",
    },
    "Blacksmith Tools": {
        en: () =>
            "Craft, once per fight at stack power 4+: every ally in the chosen 2×2 block, the Blacksmith included, gets one outcome — a second attack 40%, a frozen weapon (10 + luck)%, stunned (10 − luck)%, nothing 40% (stun and frozen stay within 0–20%, using the Blacksmith's luck). A unit with arrows left gets the Shot/Bow versions. A second attack or a frozen weapon lasts the whole fight, a stun one turn; a unit that already strikes twice gains nothing from a second attack, and the Craft stun ignores status and magic resistance. Stack power only gates the cast.",
        ru: () =>
            "Craft — раз за бой при силе стека 4 и выше: каждый союзник в выбранном блоке 2×2, включая самого Blacksmith, получает один исход — вторая атака 40%, замороженное оружие (10 + удача)%, оглушение (10 − удача)%, ничего 40% (оглушение и заморозка держатся в пределах 0–20% по удаче Blacksmith). Юнит, у которого остались стрелы, получает версии для выстрела и лука. Вторая атака или замороженное оружие действуют весь бой, оглушение — один ход; юнит, который уже бьёт дважды, от второй атаки ничего не получает, а оглушение от Craft игнорирует сопротивление статусам и магии. Сила стека лишь открывает применение.",
    },
    "Blind Fury": {
        en: () =>
            "Attack grows with the stack's losses: + (dead ÷ (alive + dead)) × base attack, so a stack that has lost half its creatures attacks at +50%. Revived creatures lower it again. Stack power and luck don't change it.",
        ru: () =>
            "Атака растёт с потерями стека: + (погибшие ÷ (живые + погибшие)) × базовая атака, так что стек, потерявший половину существ, атакует на +50%. Воскрешённые существа снова её снижают. Сила стека и удача на неё не влияют.",
    },
    Blindness: {
        en: ({ p, n }) =>
            `Every landed melee hit — attack or retaliation — has ${n(p / 5)}% per stack power (${n(p)}% at full stack) plus 1% per point of luck, lowered by mind resistance, to blind the target: it skips its next 2 turns and cannot retaliate, and taking damage doesn't wake it. Madness and Mechanism units are immune.`,
        ru: ({ p, n }) =>
            `Каждое попадание в ближнем бою — атака или ответ — с шансом ${n(p / 5)}% за единицу силы стека (${n(p)}% при полной силе) плюс 1% за очко удачи, уменьшенным сопротивлением ментальным эффектам, ослепляет цель: она пропускает 2 следующих хода и не может отвечать, а полученный урон её не будит. У юнитов с Madness и Mechanism иммунитет.`,
    },
    "Boar Saliva": {
        en: ({ n }) =>
            `Every landed melee hit applies Boar Saliva without a roll unless the target already has it (mind resistance can shrug it off; Madness and Mechanism are immune). For 3 laps the target misses ${n(effectPower("Boar Saliva") / 5)}% of its melee attacks, shots and retaliations per Boar stack power (${n(effectPower("Boar Saliva"))}% at full stack, shifted by luck), rolled separately from other miss chances — against a full Fairy stack (Small Specie, 50% against creatures bigger than one cell) a slobbered Behemoth misses 1 − 0.7 × 0.5 = 65% of the time.`,
        ru: ({ n }) =>
            `Каждое попадание в ближнем бою накладывает Boar Saliva без броска, если на цели его ещё нет (сопротивление ментальным эффектам может его сбросить; у Madness и Mechanism иммунитет). 3 круга цель промахивается ${n(effectPower("Boar Saliva") / 5)}% своих атак, выстрелов и ответов за единицу силы стека Boar (${n(effectPower("Boar Saliva"))}% при полной силе, с поправкой на удачу) — отдельным броском от других шансов промаха: по полному стеку Fairy (Small Specie, 50% против существ крупнее одной клетки) Behemoth под Boar Saliva промахивается в 1 − 0,7 × 0,5 = 65% случаев.`,
    },
    "Book of Chaos": {
        en: () =>
            "Spell book: Smoke ×1 (stack power 4+), Misfortune ×1, Fireforged Sword ×2 and Fireball ×1 (stack power 3+).",
        ru: () =>
            "Книга заклинаний: Smoke ×1 (сила стека 4+), Misfortune ×1, Fireforged Sword ×2 и Fireball ×1 (сила стека 3+).",
    },
    "Book of Healing": {
        en: () =>
            "Spell book: Heal ×4, Spiritual Armor ×2, Blessing ×2 (stack power 3+) and Mass Heal ×3 (stack power 3+). Healing grows with Healers alive, not with stack power.",
        ru: () =>
            "Книга заклинаний: Heal ×4, Spiritual Armor ×2, Blessing ×2 (сила стека 3+) и Mass Heal ×3 (сила стека 3+). Лечение растёт с числом живых Healer, а не с силой стека.",
    },
    "Book of Nightmares": {
        en: () => "Spell book: Fire Wall ×1 (stack power 4+) and Empower ×1.",
        ru: () => "Книга заклинаний: Fire Wall ×1 (сила стека 4+) и Empower ×1.",
    },
    "Boost Health": {
        en: ({ p, n }) =>
            `Each creature's max health is multiplied by 1 + ${n(p / 5)}% per stack power (+${n(p)}% at full stack, shifted by luck). It follows the current stack power, so losses shrink it.`,
        ru: ({ p, n }) =>
            `Максимальное здоровье каждого существа умножается на 1 + ${n(p / 5)}% за единицу силы стека (+${n(p)}% при полной силе, с поправкой на удачу). Бонус следует за текущей силой стека, поэтому потери его уменьшают.`,
    },
    "Borrowed Grace": {
        en: ({ p, n }) =>
            `Each landed shot or counter-shot has a chance to take one random buff off the target — any spell buff (runes included, which it keeps for good), Made of Fire and the like; never an aura, a creature's blessing (Angelic Host, Arcane Ward, Warding Mane, Arrows Wingshield), a Water Shield, an artifact or an augment — and wear it for the rest of its duration: 20% at stack power 1, +12.5% per further stack power (${n(p)}% at full stack), plus 1% per point of luck.`,
        ru: ({ p, n }) =>
            `Каждый попавший выстрел или ответный выстрел может забрать у цели один случайный бафф — любой бафф заклинания (включая руны, которые остаются навсегда), Made of Fire и подобные; никогда не ауру, благословение существа (Angelic Host, Arcane Ward, Warding Mane, Arrows Wingshield), Water Shield, артефакт или апгрейд — и носить его до конца срока: 20% при силе стека 1, +12,5% за каждую следующую единицу (${n(p)}% при полной силе), плюс 1% за очко удачи.`,
    },
    Castling: {
        en: () =>
            "Once per fight, at stack power 4+, while the Harpy can move: swaps places with an enemy of exactly the same footprint standing on a cell the Harpy could reach. The target's magic resistance can make it fail (the charge and the turn are still spent), and a Peasant's Absorb Penalties can redirect it.",
        ru: () =>
            "Раз за бой при силе стека 4+, пока Harpy может двигаться: меняется местами с врагом точно такого же размера, стоящим на клетке, куда Harpy могла бы дойти. Сопротивление магии цели может сорвать обмен (заряд и ход всё равно тратятся), а Absorb Penalties у Peasant может перенаправить его на себя.",
    },
    "Chain Lightning": {
        en: ({ p, n }) =>
            `After each landed melee hit — attack or retaliation — the struck enemy takes an extra Air hit of ${n(p)}% of that hit at full stack (shifted by luck), then the bolt jumps to touching enemies for ${n((p / 8) * 7)}%, ${n((p / 8) * 6)}% and ${n((p / 8) * 5)}%, each enemy once (${n(p / 5)}/${n((p / 40) * 7)}/${n((p / 40) * 6)}/${n((p / 40) * 5)}% at stack power 1). Each jump is cut by magic resistance and element — Earth Elements take ×1.5, a Wind Element takes nothing and stops the chain — Heavy Armor takes extra, and 100%-magic-resistance units are skipped and don't relay it. It can't be dodged and Flesh Shield never absorbs the arcs, though they are priced from the hit after Flesh Shield took its share (a fully absorbed hit fires none); magic-damage bonuses such as Empower raise it, and a Double Punch second strike doesn't fire it.`,
        ru: ({ p, n }) =>
            `После каждого попадания в ближнем бою — атаки или ответа — поражённый враг получает дополнительный удар стихии воздуха в ${n(p)}% этого удара при полной силе стека (с поправкой на удачу), затем молния перескакивает на соседних врагов с ${n((p / 8) * 7)}%, ${n((p / 8) * 6)}% и ${n((p / 8) * 5)}%, каждого по разу (${n(p / 5)}/${n((p / 40) * 7)}/${n((p / 40) * 6)}/${n((p / 40) * 5)}% при силе стека 1). Каждый скачок режется сопротивлением магии и стихией — Earth Element получает ×1,5, Wind Element не получает ничего и обрывает цепь, — Heavy Armor получает больше, а юниты со 100% сопротивления магии пропускаются и молнию не передают. Уклониться нельзя, и Flesh Shield не поглощает сами разряды, но они считаются от удара уже после доли, забранной Flesh Shield (полностью поглощённый удар молнию не вызывает); бонусы к магическому урону вроде Empower её усиливают, а второй удар Double Punch её не вызывает.`,
    },
    Chakram: {
        en: ({ p, n }) =>
            `The disc can hit one enemy per point of stack power (5 at full stack), the chosen target included, each for (${n(p)}% + luck) × stack power / 5 of a normal hit. From each enemy it hits it turns clockwise from its direction of flight to the first enemy one or two empty cells away — touching units and blocked gaps don't count: across a one-cell gap it keeps full damage, across a two-cell gap it deals half and the flight ends. A dodge ends it too; every enemy is hit at most once, allies never, and an Angel with Arrows Wingshield Blessing stops it. Counter-throws bounce as well.`,
        ru: ({ p, n }) =>
            `Диск может поразить одного врага за каждую единицу силы стека (5 при полной силе), включая выбранную цель, каждого на (${n(p)}% + удача) × сила стека / 5 обычного удара. От каждого поражённого врага он поворачивает по часовой стрелке от направления полёта к первому врагу через одну или две пустые клетки — вплотную стоящие юниты и перекрытые промежутки не считаются: через одну клетку урон остаётся полным, через две — половина, и полёт заканчивается. Уклонение тоже заканчивает полёт; каждого врага диск задевает не больше раза, союзников — никогда, а Angel с Arrows Wingshield Blessing его останавливает. Ответные броски тоже отскакивают.`,
    },
    Crusade: {
        en: () =>
            "Every cell the Champion walks — the approach of an attack included — permanently adds 0.1 per stack power (0.5 at full stack) to both its base attack and base armor, each capped at 50; the per-cell gain is rounded to 0.1, so luck only adds 0.1 at +10.",
        ru: () =>
            "Каждая клетка, пройденная Champion, — включая подход к атаке — навсегда добавляет 0,1 за единицу силы стека (0,5 при полной силе) и к базовой атаке, и к базовой броне, каждая не выше 50; прибавка за клетку округляется до 0,1, поэтому удача добавляет 0,1 только при +10.",
    },
    "Crafted Double Punch": {
        en: ({ p, n }) =>
            `Permanent (forged by Craft). After the target's retaliation the unit strikes again for ${n(p / 5)}% per stack power (${n(p)}% at full stack, shifted by luck), with its own dodge roll and on-hit effects. Dual Strike Charm makes the second strike +${dualStrike}%.`,
        ru: ({ p, n }) =>
            `Навсегда (выковано Craft). После ответа цели юнит бьёт ещё раз на ${n(p / 5)}% за единицу силы стека (${n(p)}% при полной силе, с поправкой на удачу), со своим броском уклонения и эффектами удара. Dual Strike Charm делает второй удар на ${dualStrike}% сильнее.`,
    },
    "Crafted Double Shot": {
        en: ({ p, n }) =>
            `Permanent (forged by Craft). On its own shots (not its counter-shots), after the target's counter-shot if there is one, the unit fires a second arrow for ${n(p / 5)}% per stack power (${n(p)}% at full stack, shifted by luck), spending another arrow, with its own dodge roll; if the first arrow killed the stack it hit, the second flies on to the next enemy before the stack you aimed at — none if that was the aimed stack. On a Cyclops or Zena the second shot is a whole second blast or disc throw. Dual Strike Charm makes the second shot +${dualStrike}%.`,
        ru: ({ p, n }) =>
            `Навсегда (выковано Craft). В собственных выстрелах (не в ответных), после ответного выстрела цели, если он был, юнит стреляет второй раз на ${n(p / 5)}% за единицу силы стека (${n(p)}% при полной силе, с поправкой на удачу), тратя ещё одну стрелу, со своим броском уклонения; если первая стрела убила стек, в который попала, вторая летит в следующего врага перед выбранной целью — или никуда, если убита сама цель. У Cyclops или Zena второй выстрел — это целый второй залп или бросок диска. Dual Strike Charm делает второй выстрел на ${dualStrike}% сильнее.`,
    },
    "Crafted Frozen Bow": craftedFrozen,
    "Crafted Frozen Sword": craftedFrozen,
    "Deep Wounds Level 1": deepWounds,
    "Deep Wounds Level 2": deepWounds,
    "Deep Wounds Level 3": deepWounds,
    "Dense Flesh": {
        en: ({ p }) => `Every enemy shot aimed at this unit spends ${p} arrows instead of one — except a Tsar Cannon's Through Shot, which always costs one.`,
        ru: ({ p }) => `Каждый вражеский выстрел в этого юнита тратит ${p} стрелы вместо одной — кроме Through Shot у Tsar Cannon, который всегда стоит одну.`,
    },
    "Devour Essence": {
        en: ({ p, n }) =>
            `When the Hydra's attack or retaliation (Lightning Spin included) destroys a whole enemy stack — one that will raise itself (an Angel with its Resurrection charge) doesn't count, as with Infest — its front Hydra is topped up to ${n(p / 5)}% of one Hydra's max health per stack power (full health at stack power 5, shifted by luck) — nothing if it is already above that. Dead Hydras stay dead.`,
        ru: ({ p, n }) =>
            `Когда атака или ответ Hydra (включая Lightning Spin) уничтожает вражеский стек целиком — стек, который поднимется сам (Angel с зарядом Resurrection), не считается, как и у Infest, — передняя Hydra восстанавливается до ${n(p / 5)}% максимального здоровья одной Hydra за единицу силы стека (до полного при силе 5, с поправкой на удачу) — ничего, если здоровья уже больше. Погибшие Hydra не возвращаются.`,
    },
    "Disguise Aura": {
        en: () =>
            "While no enemy stack stands within 3 cells, the White Tiger is Hidden: it can't be chosen as the target of attacks, shots or single-target spells. Splash, area spells, chain arcs, bounces and shots passing through still hit it. An enemy within range makes it Visible again; Might's Aura Range synergy widens that radius too.",
        ru: () =>
            "Пока в радиусе 3 клеток нет вражеского стека, White Tiger скрыт (Hidden): его нельзя выбрать целью атаки, выстрела или заклинания на одну цель. Удары по площади, заклинания по области, цепные молнии, отскоки и пролетающие насквозь выстрелы всё равно его задевают. Враг в радиусе снова делает его видимым (Visible); синергия Силы «Радиус аур» увеличивает и этот радиус.",
    },
    Dodge: {
        en: ({ p, n }) =>
            `${n(p / 5)}% per stack power (${n(p)}% at full stack) plus 1% per point of luck to dodge every physical hit — melee, shots, retaliations, second strikes and splash. Magic can't be dodged.`,
        ru: ({ p, n }) =>
            `${n(p / 5)}% за единицу силы стека (${n(p)}% при полной силе) плюс 1% за очко удачи уклониться от любого физического удара — ближнего, выстрела, ответа, второго удара и удара по площади. От магии уклониться нельзя.`,
    },
    "Double Punch": {
        en: ({ p, n }) =>
            `Only when attacking: after the target's retaliation the unit strikes a second time for ${n(p / 5)}% per stack power (${n(p)}% at full stack, shifted by luck), with its own dodge roll and on-hit effects. It is skipped if the retaliation stunned, blinded or froze the attacker, or the target died. A One in the Field target retaliates against the second strike too. Dual Strike Charm makes the second strike +${dualStrike}%.`,
        ru: ({ p, n }) =>
            `Только в атаке: после ответа цели юнит бьёт второй раз на ${n(p / 5)}% за единицу силы стека (${n(p)}% при полной силе, с поправкой на удачу), со своим броском уклонения и эффектами удара. Второго удара нет, если ответ оглушил, ослепил или заморозил атакующего либо цель погибла. Цель с One in the Field отвечает и на второй удар. Dual Strike Charm делает второй удар на ${dualStrike}% сильнее.`,
    },
    "Double Shot": {
        en: ({ p, n }) =>
            `On its own shots (not its counter-shots), after the target's counter-shot if there is one, the Elf fires a second arrow for ${n(p / 5)}% per stack power (${n(p)}% at full stack, shifted by luck), spending another arrow, with its own dodge roll; a stun, freeze or blindness from that counter-shot cancels it. If the first arrow killed the stack it hit, the second flies on to the next enemy before the stack you aimed at — none if that was the aimed stack. Barrels in the way: the two projectiles clear up to two of them for one arrow, and with one barrel the second still reaches the target. Dual Strike Charm makes the second shot +${dualStrike}%.`,
        ru: ({ p, n }) =>
            `В собственных выстрелах (не в ответных), после ответного выстрела цели, если он был, Elf стреляет второй раз на ${n(p / 5)}% за единицу силы стека (${n(p)}% при полной силе, с поправкой на удачу), тратя ещё одну стрелу, со своим броском уклонения; оглушение, заморозка или ослепление от ответного выстрела его отменяют. Если первая стрела убила стек, в который попала, вторая летит в следующего врага перед выбранной целью — или никуда, если убита сама цель. Бочки на пути: два снаряда сносят до двух бочек за одну стрелу, а при одной бочке второй всё равно долетает до цели. Dual Strike Charm делает второй выстрел на ${dualStrike}% сильнее.`,
    },
    "Double Throw": {
        en: ({ p }) =>
            `After the first boulder (and the target's counter-shot, if any) a second full Area Throw lands on the same stack: (${p} + luck)% of a normal hit, not scaled by stack power, with fresh dodge rolls. It isn't thrown if the first boulder killed the stack it was aimed at, and if that stack dodges it, the whole second boulder is lost. Each boulder costs a shot. Dual Strike Charm makes the second boulder +${dualStrike}%, splash included.`,
        ru: ({ p }) =>
            `После первого валуна (и ответного выстрела цели, если он был) второй полный Area Throw падает на тот же стек: (${p} + удача)% обычного удара, без масштаба силой стека, с новыми бросками уклонения. Его нет, если первый валун убил выбранный стек, а если этот стек уклонился, пропадает весь второй валун. Каждый валун тратит выстрел. Dual Strike Charm делает второй валун на ${dualStrike}% сильнее, включая удар по площади.`,
    },
    "Dulling Defense": {
        en: ({ p }) =>
            `Every landed melee hit on the Goblin Knight — including a retaliation against its own attack, second strikes and Lightning Spin hits — permanently lowers the striker's base attack by ${p} (never below 1). Stack power doesn't change the amount.`,
        ru: ({ p }) =>
            `Каждое попадание в Goblin Knight в ближнем бою — включая ответ на его собственную атаку, вторые удары и удары Lightning Spin — навсегда снижает базовую атаку ударившего на ${p} (не ниже 1). Сила стека на величину не влияет.`,
    },
    "Earth Element": {
        en: ({ p }) =>
            `Immune to Earth magic: Meteorite and Meteor Shower deal it nothing. Takes ${p}% more from Air: Thunderbird's attacks, Chain Lightning and Lightning Strike. Its own attacks deal ${p}% more to Wind Elements.`,
        ru: ({ p }) =>
            `Иммунитет к магии земли: Meteorite и Meteor Shower не наносят урона. Получает на ${p}% больше от воздуха: атак Thunderbird, Chain Lightning и Lightning Strike. Его собственные атаки наносят на ${p}% больше юнитам с Wind Element.`,
    },
    "Enchanted Skin": {
        en: () =>
            "100% magic resistance: immune to every spell from either side — buffs, heals and mass spells skip it too, though a Blacksmith's Craft still reaches it — to magic damage (Chain Lightning, Fire Breath, Fire Shield, Fireforged burns, Fire Wall) and to Rime Charm's slow. It does not stop on-hit effects (Stun, Blindness, Paralysis, Petrifying Gaze, Break), auras or blessings, and the stack can still be resurrected.",
        ru: () =>
            "100% сопротивления магии: иммунитет ко всем заклинаниям обеих сторон — баффы, лечение и массовые заклинания его тоже пропускают, но Craft у Blacksmith до него дотягивается — к магическому урону (Chain Lightning, Fire Breath, Fire Shield, поджоги Fireforged, Fire Wall) и к замедлению Rime Charm. Не защищает от эффектов ударов (Stun, Blindness, Paralysis, Petrifying Gaze, Break), аур и благословений, а стек по-прежнему можно воскресить.",
    },
    Enchants: {
        en: () =>
            "Spell book: 5 Armor Rune and 5 Weapon Rune casts per fight, on any ally or on itself. Each cast has a 50% chance to add a permanent +1 armor or +1 attack; a failed cast still uses the turn.",
        ru: () =>
            "Книга заклинаний: 5 Armor Rune и 5 Weapon Rune на бой, на любого союзника или на себя. Каждое применение с шансом 50% навсегда добавляет +1 к броне или +1 к атаке; неудачная попытка всё равно тратит ход.",
    },
    "Endless Quiver": {
        en: () => "Never runs out of arrows.",
        ru: () => "Стрелы никогда не кончаются.",
    },
    "Fire Breath": {
        en: ({ p, n }) =>
            `Each melee attack or retaliation also burns whoever stands directly behind the target on the line of the strike, friend or foe (1 cell behind a 1×1 target, 2 behind a 2×2), for ${n(p / 5)}% per stack power (${n(p)}% at full stack, shifted by luck) of the Dragon's melee damage against them — their armor applies — cut by their magic resistance. Fire Elements and 100%-magic-resistance units take nothing and block it. It fires even if the main blow is dodged, and magic-damage bonuses raise it. Because it is priced from the Dragon's melee damage, attack bonuses raise it too — the Might augment, attack auras and attack artifacts.`,
        ru: ({ p, n }) =>
            `Каждая атака или ответ в ближнем бою также обжигает того, кто стоит прямо за целью на линии удара, своего или чужого (на 1 клетку за целью 1×1, на 2 — за целью 2×2), на ${n(p / 5)}% за единицу силы стека (${n(p)}% при полной силе, с поправкой на удачу) урона дракона в ближнем бою по нему — его броня учитывается — с учётом его сопротивления магии. Юниты с Fire Element и со 100% сопротивления магии не получают урона и загораживают огонь. Дыхание срабатывает даже при уклонении от основного удара, а бонусы к магическому урону его усиливают. Раз оно считается от урона дракона в ближнем бою, его повышают и бонусы к атаке — апгрейд «Сила», ауры и артефакты атаки.`,
    },
    "Fire Element": {
        en: ({ p }) =>
            `Immune to fire: Fire Strike, Fireball, Ring of Fire, Fire Wall, Fireforged burns, Fire Breath and Fire Shield deal it nothing, and enemy fire spells can't target it. Takes ${p}% more from Water Element attacks. Its own attacks deal ${p}% more to Water Elements and pass through a Water Shield without breaking it.`,
        ru: ({ p }) =>
            `Иммунитет к огню: Fire Strike, Fireball, Ring of Fire, Fire Wall, поджоги Fireforged, Fire Breath и Fire Shield не наносят урона, а вражеские огненные заклинания не могут выбрать его целью. Получает на ${p}% больше от атак Water Element. Его собственные атаки наносят на ${p}% больше юнитам с Water Element и проходят сквозь Water Shield, не разрушая его.`,
    },
    "Fire Shield": {
        en: ({ p, n }) =>
            `Every landed melee hit on the Efreet — second strikes, spin hits and retaliations against its own attacks included, but not a Skewer Strike's pierce — burns the striker for ${n(p / 5)}% per stack power (${n(p)}% at full stack, shifted by luck) of the damage dealt, rounded up, as fire magic cut by the striker's magic resistance; Fire Elements take nothing. Shots and dodged hits don't trigger it, and magic-damage bonuses raise it.`,
        ru: ({ p, n }) =>
            `Каждое попадание по Efreet в ближнем бою — включая вторые удары, удары вращением и ответы на его собственные атаки, но не пробивающий удар Skewer Strike — обжигает ударившего на ${n(p / 5)}% за единицу силы стека (${n(p)}% при полной силе, с поправкой на удачу) нанесённого урона с округлением вверх, как магия огня с учётом сопротивления магии ударившего; Fire Element урона не получает. Выстрелы и удары, от которых Efreet уклонился, щит не вызывают, а бонусы к магическому урону его усиливают.`,
    },
    "Flesh Shield Aura": {
        en: ({ p, n }) =>
            `Allies within 2 cells (not the Abomination itself) have ${n(p / 5)}% per stack power (${n(p)}% at full stack, shifted by luck) of each physical hit moved onto the Abomination, re-priced against its armor and capped at the Abomination's remaining health — the rest stays on the ally, and absorbing can finish the Abomination off. Spells and magic damage are never absorbed, and only weapon hits are moved — attacks, retaliations, shots, splash, Lightning Spin and Skewer Strike hits; Armageddon, poison and Fire Wall burns land on the ally itself. Petrifying Gaze is priced from the full hit before the aura takes its share, so its extra kills and petrify roll still land on the ally. A hit the ally's own Water Shield will absorb isn't shared at all, and the share the Abomination takes never rolls Break on it.`,
        ru: ({ p, n }) =>
            `У союзников в радиусе 2 клеток (кроме самой Abomination) ${n(p / 5)}% за единицу силы стека (${n(p)}% при полной силе, с поправкой на удачу) каждого физического удара переносится на Abomination, пересчитывается под её броню и ограничивается её оставшимся здоровьем — остаток остаётся на союзнике, а поглощение может добить саму Abomination. Заклинания и магический урон не поглощаются никогда, а переносятся только удары оружием — атаки, ответы, выстрелы, удары по площади, Lightning Spin и Skewer Strike; Армагеддон, яд и ожоги Fire Wall союзник получает сам. Petrifying Gaze считается от полного удара до того, как аура заберёт свою долю, поэтому добивания и окаменение достаются союзнику целиком. Удар, который поглотит Water Shield самого союзника, не делится вовсе, а доля, принятая Abomination, никогда не накладывает на неё Break.`,
    },
    "Forest Spellbook": {
        en: () => "Spell book: Courage ×3, Helping Hand ×1 (stack power 4+) and Summon Wolves ×2.",
        ru: () => "Книга заклинаний: Courage ×3, Helping Hand ×1 (сила стека 4+) и Summon Wolves ×2.",
    },
    "Guiding Winds Aura": {
        en: ({ p, n }) =>
            `Ranged allies within 2 cells, the Dryad included, shoot ${n(p / 5)}% farther per stack power (${n(p)}% at full stack, shifted by luck; never more than 35%). Falloff bands are counted in whole cells, so the bonus only helps once it adds a whole cell (a stack-power-1 Dryad's 6.5 → 6.8 gains nothing); then it widens every band.`,
        ru: ({ p, n }) =>
            `Союзные стрелки в радиусе 2 клеток, включая Dryad, стреляют на ${n(p / 5)}% дальше за единицу силы стека (${n(p)}% при полной силе, с поправкой на удачу; не больше 35%). Полосы дальности считаются в целых клетках, поэтому бонус помогает, только когда добавляет целую клетку (у Dryad с силой стека 1 дистанция 6,5 → 6,8 ничего не меняет); тогда он расширяет каждую полосу.`,
    },
    Hamstring: {
        en: ({ p, n }) =>
            `Only on the Dryad's own attacks: ${n(p / 5)}% per stack power (${n(p)}% at full stack) plus 1% per point of luck to Hamstring a flying target — −30% movement for its next 3 turns. Magic resistance can resist it, a Peasant's Absorb Penalties can take it (where it does nothing — the Peasant doesn't fly), Magic Mirror can reflect it, and it isn't reapplied while active. With Quagmire (Rime Charm, Spit Ball) the slows multiply: ×0.7 × 0.75 = ×0.525 movement.`,
        ru: ({ p, n }) =>
            `Только в собственных атаках Dryad: ${n(p / 5)}% за единицу силы стека (${n(p)}% при полной силе) плюс 1% за очко удачи наложить Hamstrung на летающую цель — −30% движения на её следующие 3 хода. Сопротивление магии может его отразить, Absorb Penalties у Peasant — забрать (где он ничего не делает: Peasant не летает), Magic Mirror — вернуть; пока действует, повторно не накладывается. С Quagmire (Rime Charm, Spit Ball) замедления перемножаются: ×0,7 × 0,75 = ×0,525 движения.`,
    },
    Handyman: {
        en: () => "This shooter's melee hits — attacks and retaliations — deal full damage instead of half.",
        ru: () => "Удары этого стрелка в ближнем бою — атаки и ответы — наносят полный урон, а не половину.",
    },
    "Heavy Armor": {
        en: ({ p, n }) =>
            `+${n(p / 5)}% base armor per stack power (+${n(p)}% at full stack, shifted by luck). The same percentage is added to all magic damage it takes — damage spells, Fire Wall, Fireforged burns, Chain Lightning, Fire Breath and Fire Shield.`,
        ru: ({ p, n }) =>
            `+${n(p / 5)}% к базовой броне за единицу силы стека (+${n(p)}% при полной силе, с поправкой на удачу). Тот же процент добавляется ко всему магическому урону, который он получает, — от заклинаний урона, Fire Wall, поджогов Fireforged, Chain Lightning, Fire Breath и Fire Shield.`,
    },
    "In Its Own World": {
        en: () =>
            "Any vined cell — from either side's Vine Throw — costs the Trent no steps, straight or diagonal. An enemy vine it stops on can still snare it.",
        ru: () =>
            "Любая клетка с лозой — от Vine Throw любой стороны — не стоит Trent ни одного шага, ни по прямой, ни по диагонали. Вражеская лоза, на которой он остановился, всё равно может его опутать.",
    },
    Infest: {
        en: () =>
            "When this unit's attack or retaliation wipes out the stack it fought, a one-creature Arachna Spider (from a level 1–3 victim) or Arachna Queen (from a level 4 victim) appears on your side, if there is room. A stack that resurrects (Angel) isn't wiped out, so it gives nothing — killing it again after its Resurrection is spent does.",
        ru: () =>
            "Когда атака или ответ этого юнита уничтожает стек противника целиком, на вашей стороне появляется Arachna Spider из одного существа (если жертва 1–3 уровня) или Arachna Queen (если жертва 4 уровня), если есть место. Воскресший стек (Angel) не уничтожен, поэтому ничего не даёт — повторное убийство после траты Resurrection даёт.",
    },
    "Large Caliber": {
        en: ({ p, n }) =>
            `Every unit in the 3×3 block around the landing cell — the target, other enemies and your own units — takes ${n(p / 5)}% per stack power (${n(p)}% at full stack, shifted by luck) of a normal shot, each with its own dodge roll. The shell flies over structures and smashes barrels in the block; a target that can shoot answers after all the damage lands.`,
        ru: ({ p, n }) =>
            `Каждый юнит в блоке 3×3 вокруг клетки попадания — цель, другие враги и ваши юниты — получает ${n(p / 5)}% за единицу силы стека (${n(p)}% при полной силе, с поправкой на удачу) обычного выстрела, каждый со своим броском уклонения. Снаряд летит поверх построек и разбивает бочки в блоке; цель, способная стрелять, отвечает после всего урона.`,
    },
    "Leather Armor": {
        en: ({ p }) => `Against shots this unit's base armor counts ${p}% lower (armor buffs and debuffs count in full), so shots hurt it noticeably more.`,
        ru: ({ p }) => `Против выстрелов базовая броня этого юнита считается на ${p}% ниже (баффы и дебаффы брони учитываются полностью), поэтому выстрелы ранят его заметно сильнее.`,
    },
    "Lightning Spin": {
        en: () =>
            "Every attack and retaliation strikes all enemies touching the Hydra — except a Manticore whose Terrifying Gaze has frightened it — each with its own dodge roll, and the Hydra's attacks can't be answered.",
        ru: () =>
            "Каждая атака и каждый ответ бьют всех врагов, стоящих вплотную к Hydra, — кроме Manticore, чей Terrifying Gaze её напугал, — каждого со своим броском уклонения, а на атаки Hydra нельзя ответить.",
    },
    "Limited Supply": {
        en: () =>
            "The quiver holds only its full size × stack power / 5 arrows, rounded down — 2/4/6/8/10 of the Arbalester's 10 at stack power 1–5 — plus any Rallying Volley arrows; arrows above a lowered cap are lost for good.",
        ru: () =>
            "Колчан вмещает лишь полный запас × сила стека / 5 стрел с округлением вниз — 2/4/6/8/10 из 10 у Arbalester при силе стека 1–5, — плюс стрелы от Rallying Volley; стрелы сверх сниженного предела пропадают навсегда.",
    },
    "Luck Aura": {
        en: () =>
            "Allies within 2 cells, the Leprechaun included, have their luck fixed at +10 instead of the lap roll; Misfortune drops them to 0. +10 luck means about 10% less attack damage taken and +10 points on the stack's ability chances. The aura doesn't depend on stack power, so a split Leprechaun projects it at full strength around both halves (the same aura doesn't add up on a cell), though its own Lucky Strike weakens with the split.",
        ru: () =>
            "У союзников в радиусе 2 клеток, включая Leprechaun, удача зафиксирована на +10 вместо броска круга; Misfortune опускает её до 0. +10 удачи — это примерно на 10% меньше урона от атак и +10 пунктов к шансам способностей стека. Аура не зависит от силы стека, поэтому разделённый Leprechaun даёт её в полную силу вокруг обеих половин (одна и та же аура на клетке не складывается), хотя его собственный Lucky Strike после разделения слабеет.",
    },
    "Lucky Strike": {
        en: ({ p, n }) =>
            `Every hit — shots, retaliations, second strikes, splash and spin hits — has ${n(p / 5)}% per stack power plus 1% per point of luck to deal ${n(p / 5)}% per stack power plus 1% per point of luck more damage: ${n(p)}% for +${n(p)}% at full stack.`,
        ru: ({ p, n }) =>
            `Каждое попадание — выстрелы, ответы, вторые удары, удары по площади и вращением — с шансом ${n(p / 5)}% за единицу силы стека плюс 1% за очко удачи наносит на ${n(p / 5)}% за единицу силы стека плюс 1% за очко удачи больше урона: ${n(p)}% на +${n(p)}% при полной силе стека.`,
    },
};
