import effectsJson from "@heroesofcrypto/common/src/configuration/effects.json";
import { ARTIFACT_POWER } from "@heroesofcrypto/common/src/artifacts/artifact_properties";

import type { NoteSpec } from "./format";

const effectPower = (name: string): number =>
    (effectsJson as unknown as Record<string, { power?: number }>)[name]?.power ?? 0;

const dualStrike = ARTIFACT_POWER.DUAL_STRIKE_SECOND_ATTACK_PERCENT;

/** Deep Wounds reads the same for every level; only the per-stack-power amount differs. */
const deepWounds: NoteSpec = {
    en: ({ p, n }) =>
        `Every landed melee hit — attack, retaliation, second strike or spin — adds ${n(p / 5)} per stack power (${n(p)} at full stack) plus 1 per point of luck to the target's wounds, with no roll and no resistance. Wounds from every source add up without a cap and last the target's next 3 turns, refreshed by each new wound. Any attacker holding a Deep Wounds card deals that many percent more damage to the wounded target, so a Deep Wounds army that focuses one stack snowballs; shots benefit but never add wounds. A unit holding several cards (a native one plus Wounding Charm's) adds them together.`,
    ru: ({ p, n }) =>
        `Каждое попадание в ближнем бою — атака, ответ, второй удар или удар вращением — добавляет цели ${n(p / 5)} за единицу силы стека (${n(p)} при полной силе) плюс 1 за очко удачи раны, без броска и без сопротивления. Раны из всех источников складываются без предела и держатся следующие 3 хода цели, обновляясь с каждой новой раной. Любой атакующий с картой Deep Wounds наносит раненой цели на столько же процентов больше урона, поэтому армия с Deep Wounds, бьющая один стек, набирает урон лавиной; выстрелы бонус получают, но ран не добавляют. Если у юнита несколько карт (своя и от Wounding Charm), они суммируются.`,
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
            `Every ally the Monk's arrow flies past — on its shots and counter-shots, hit or miss — rolls to shed a negative effect: the first at ${n(p / 5)}% per stack power (${n(p)}% at full stack) plus 1% per point of luck, each further one on the same ally at half the previous chance, rolled separately. Combat effects (Stun, Freeze, Blindness, Paralysis, Break, Deep Wounds, Poison) go before spell debuffs; aura penalties and cursed-artifact downsides can't be lifted.`,
        ru: ({ p, n }) =>
            `Каждый союзник, мимо которого пролетает стрела Monk — при выстреле и ответном выстреле, попала она или нет, — пытается избавиться от негативного эффекта: первого с шансом ${n(p / 5)}% за единицу силы стека (${n(p)}% при полной силе) плюс 1% за очко удачи, каждого следующего у того же союзника — вдвое реже предыдущего, отдельными бросками. Сначала снимаются боевые эффекты (Stun, Freeze, Blindness, Paralysis, Break, Deep Wounds, Poison), затем дебаффы заклинаний; штрафы аур и проклятых артефактов не снимаются.`,
    },
    "Absorb Penalties Aura": {
        en: ({ p, n }) =>
            `Covers allies within 2 cells, the Peasant included. When an enemy spell debuff, a Spit Ball debuff or Hamstring lands on one of them, the Peasant has ${n(p / 5)}% per stack power (${n(p)}% at full stack, shifted by luck) to take it instead. On-hit effects — Stun, Blindness, Freeze, Paralysis, Aggr, Poison — are never absorbed. An absorbed Castling swaps the Harpy with the Peasant.`,
        ru: ({ p, n }) =>
            `Действует на союзников в радиусе 2 клеток, включая самого Peasant. Когда на одного из них ложится вражеский дебафф заклинания, дебафф Spit Ball или Hamstring, Peasant с шансом ${n(p / 5)}% за единицу силы стека (${n(p)}% при полной силе, с поправкой на удачу) забирает его себе. Эффекты от ударов — Stun, Blindness, Freeze, Paralysis, Aggr, Poison — не поглощаются никогда. Поглощённый Castling меняет местами Harpy и Peasant.`,
    },
    Aggr: {
        en: ({ p, n }) =>
            `Every landed melee hit — attack or retaliation — has ${n(p / 5)}% per stack power (${n(p)}% at full stack) plus 1% per point of luck, lowered by the target's mind resistance, to Aggr it until the end of its next turn: it may attack, shoot or cast targeted spells only at this Pikeman, and retaliate only against it. It ends early if the Pikeman dies, isn't reapplied while active, and Madness and Mechanism units are immune.`,
        ru: ({ p, n }) =>
            `Каждое попадание в ближнем бою — атака или ответ — с шансом ${n(p / 5)}% за единицу силы стека (${n(p)}% при полной силе) плюс 1% за очко удачи, уменьшенным сопротивлением цели ментальным эффектам, накладывает Aggr до конца её следующего хода: она может атаковать, стрелять и применять заклинания на цель только в этого Pikeman и отвечать только ему. Эффект кончается раньше, если Pikeman погиб, не накладывается повторно, пока действует, а у юнитов с Madness и Mechanism иммунитет.`,
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
            `The boulder lands on the first enemy in its flight path (or on the empty cell you aim at) and hits every unit in the 3×3 block around it — the target, other enemies and your own units — each for (${p} + luck)% of a normal hit with its own dodge roll; stack power does not scale it. It flies over units and structures and smashes barrels in the block. Only a throw aimed at a unit can be answered, and the target shoots back after all the damage lands. Landing on an Angel with Arrows Wingshield Blessing hits only the Angel.`,
        ru: ({ p }) =>
            `Валун падает на первого врага на линии полёта (или на пустую клетку, в которую вы целитесь) и бьёт каждого юнита в блоке 3×3 вокруг — цель, других врагов и ваших юнитов — на (${p} + удача)% обычного удара, каждый со своим броском уклонения; сила стека на это не влияет. Он летит поверх юнитов и построек и разбивает бочки в блоке. Ответить можно только на бросок в юнита, и цель стреляет в ответ после всего урона. Попадание в Angel с Arrows Wingshield Blessing бьёт только этого Angel.`,
    },
    "Arrows Wingshield Blessing": {
        en: ({ p, n }) =>
            `While the Angel lives and isn't Broken, every ally gets extra armor against shots: ${n(p / 5)}% per Angel stack power (${n(p)}% at full stack), multiplied by (1 + the Angel's luck / 100); +25% armor means about 20% less damage from shots. The Angel also stops piercing shots: a Through Shot that reaches it hits it and stops, Large Caliber and Area Throw landing on it don't splash, and a Chakram can't strike it and ends its flight there. Several Angels don't stack.`,
        ru: ({ p, n }) =>
            `Пока Angel жив и на нём нет Break, каждый союзник получает дополнительную броню от выстрелов: ${n(p / 5)}% за единицу силы стека Angel (${n(p)}% при полной силе), умноженные на (1 + удача Angel / 100); +25% брони — это примерно на 20% меньше урона от выстрелов. Кроме того, Angel останавливает пробивающие выстрелы: Through Shot, дойдя до него, попадает в него и останавливается, Large Caliber и Area Throw при попадании в него не бьют по площади, а Chakram не может его задеть и заканчивает на нём полёт. Несколько Angel не складываются.`,
    },
    Backstab: {
        en: ({ p, n }) =>
            `+${n(p / 5)}% damage per stack power (+${n(p)}% at full stack) plus 1% per point of luck on melee attacks and retaliations when the Scavenger stands beyond its target along the line of advance — on the side nearer the target army's starting edge, diagonals included. Second strikes don't get it.`,
        ru: ({ p, n }) =>
            `+${n(p / 5)}% урона за единицу силы стека (+${n(p)}% при полной силе) плюс 1% за очко удачи к атакам и ответам в ближнем бою, когда Scavenger стоит за целью по линии наступления — со стороны, ближней к стартовому краю армии цели, диагонали тоже считаются. Вторые удары бонус не получают.`,
    },
    "Basic Tome of Battle Magic": {
        en: () =>
            "Spell book: Fire Strike ×3 and Meteorite ×1 per fight; Meteorite needs a full stack (stack power 5). A damage spell deals its power per creature alive in the casting stack — stack power only decides whether it can be cast.",
        ru: () =>
            "Книга заклинаний: Fire Strike ×3 и Meteorite ×1 на бой; для Meteorite нужна полная сила стека (5). Урон заклинания — его сила за каждое живое существо в стеке заклинателя; сила стека лишь решает, можно ли его применить.",
    },
    "Battle Roar": {
        en: () =>
            "Once per fight, at stack power 3 or more: for 2 laps (3 for the casting Behemoth) every ally — except units with 100% magic resistance or already roaring — gets +1 movement per Behemoth alive in the casting stack and always rolls maximum damage. It overrides Curse; Quagmire and Hamstrung cut the extra steps like any movement.",
        ru: () =>
            "Раз за бой при силе стека 3 и выше: на 2 круга (3 для самого Behemoth, применившего способность) каждый союзник — кроме юнитов со 100% сопротивления магии и уже ревущих — получает +1 к движению за каждого живого Behemoth в стеке заклинателя и всегда наносит максимальный урон. Перекрывает Curse; Quagmire и Hamstrung урезают добавочные шаги, как и любое движение.",
    },
    "Bitter Experience": {
        en: () =>
            "Whenever a single hit kills at least one Peasant and the stack survives, the stack permanently gains +1 base armor and +1 movement — once per hit, however many Peasants it killed. A hit that kills nobody gives nothing (the game card says every hit counts; the engine counts only killing hits).",
        ru: () =>
            "Каждый раз, когда одно попадание убивает хотя бы одного Peasant, а стек выживает, стек навсегда получает +1 к базовой броне и +1 к движению — один раз за попадание, сколько бы Peasant ни погибло. Попадание без убитых ничего не даёт (карточка в игре говорит о каждом попадании, а движок считает только убивающие).",
    },
    "Blacksmith Tools": {
        en: () =>
            "Craft, once per fight at stack power 4+: every ally in the chosen 2×2 block, the Blacksmith included, gets one outcome — a second attack 40%, a frozen weapon (10 + luck)%, stunned (10 − luck)%, nothing 40% (stun and frozen stay within 0–20%, using the Blacksmith's luck). Shooters get the Shot/Bow versions. The results last the whole fight; a unit that already strikes twice gains nothing from a second attack, and the Craft stun ignores status resistance. Stack power only gates the cast.",
        ru: () =>
            "Craft — раз за бой при силе стека 4 и выше: каждый союзник в выбранном блоке 2×2, включая самого Blacksmith, получает один исход — вторая атака 40%, замороженное оружие (10 + удача)%, оглушение (10 − удача)%, ничего 40% (оглушение и заморозка держатся в пределах 0–20% по удаче Blacksmith). Стрелки получают версии для выстрела и лука. Результат действует весь бой; юнит, который уже бьёт дважды, от второй атаки ничего не получает, а оглушение от Craft игнорирует сопротивление статусам. Сила стека лишь открывает применение.",
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
            `Every landed melee hit applies Boar Saliva without a roll unless the target already has it (mind resistance can shrug it off; Madness and Mechanism are immune). For 3 laps the target misses ${n(effectPower("Boar Saliva") / 5)}% of its melee attacks, shots and retaliations per Boar stack power (${n(effectPower("Boar Saliva"))}% at full stack, shifted by luck), rolled separately from other miss chances.`,
        ru: ({ n }) =>
            `Каждое попадание в ближнем бою накладывает Boar Saliva без броска, если на цели его ещё нет (сопротивление ментальным эффектам может его сбросить; у Madness и Mechanism иммунитет). 3 круга цель промахивается ${n(effectPower("Boar Saliva") / 5)}% своих атак, выстрелов и ответов за единицу силы стека Boar (${n(effectPower("Boar Saliva"))}% при полной силе, с поправкой на удачу) — отдельным броском от других шансов промаха.`,
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
            `Each landed shot or counter-shot has a chance to take one random buff that was cast on the target — one with a finite duration, never an aura, blessing, artifact or augment — and wear it for the rest of its duration: 20% at stack power 1, +12.5% per further stack power (${n(p)}% at full stack), plus 1% per point of luck.`,
        ru: ({ p, n }) =>
            `Каждый попавший выстрел или ответный выстрел может забрать один случайный бафф, наложенный на цель заклинанием — с конечной длительностью, не ауру, благословение, артефакт или апгрейд, — и носить его до конца срока: 20% при силе стека 1, +12,5% за каждую следующую единицу (${n(p)}% при полной силе), плюс 1% за очко удачи.`,
    },
    Castling: {
        en: () =>
            "Once per fight, at stack power 4+, while the Harpy can move: swaps places with an enemy of exactly the same footprint standing on a cell the Harpy could reach. The target's magic resistance can make it fail (the charge and the turn are still spent), and a Peasant's Absorb Penalties can redirect it.",
        ru: () =>
            "Раз за бой при силе стека 4+, пока Harpy может двигаться: меняется местами с врагом точно такого же размера, стоящим на клетке, куда Harpy могла бы дойти. Сопротивление магии цели может сорвать обмен (заряд и ход всё равно тратятся), а Absorb Penalties у Peasant может перенаправить его на себя.",
    },
    "Chain Lightning": {
        en: ({ p, n }) =>
            `After each landed melee hit — attack or retaliation — the struck enemy takes an extra Air hit of ${n(p)}% of that hit at full stack, then the bolt jumps to touching enemies for ${n((p / 8) * 7)}%, ${n((p / 8) * 6)}% and ${n((p / 8) * 5)}%, each enemy once (${n(p / 5)}/${n((p / 40) * 7)}/${n((p / 40) * 6)}/${n((p / 40) * 5)}% at stack power 1). Each jump is cut by magic resistance and element — Earth Elements take ×1.5, a Wind Element takes nothing and stops the chain — Heavy Armor takes extra, and 100%-magic-resistance units are skipped and don't relay it. It can't be dodged, Flesh Shield doesn't absorb it, magic-damage bonuses such as Empower raise it, and a Double Punch second strike doesn't fire it.`,
        ru: ({ p, n }) =>
            `После каждого попадания в ближнем бою — атаки или ответа — поражённый враг получает дополнительный удар стихии воздуха в ${n(p)}% этого удара при полной силе стека, затем молния перескакивает на соседних врагов с ${n((p / 8) * 7)}%, ${n((p / 8) * 6)}% и ${n((p / 8) * 5)}%, каждого по разу (${n(p / 5)}/${n((p / 40) * 7)}/${n((p / 40) * 6)}/${n((p / 40) * 5)}% при силе стека 1). Каждый скачок режется сопротивлением магии и стихией — Earth Element получает ×1,5, Wind Element не получает ничего и обрывает цепь, — Heavy Armor получает больше, а юниты со 100% сопротивления магии пропускаются и молнию не передают. Уклониться нельзя, Flesh Shield её не поглощает, бонусы к магическому урону вроде Empower её усиливают, а второй удар Double Punch её не вызывает.`,
    },
    Chakram: {
        en: ({ p, n }) =>
            `The disc can hit one enemy per point of stack power (5 at full stack), the chosen target included, each for (${n(p)}% + luck) × stack power / 5 of a normal hit. From each enemy it hits it turns clockwise from its direction of flight to the first enemy one or two empty cells away — touching units and blocked gaps don't count: across a one-cell gap it keeps full damage, across a two-cell gap it deals half and the flight ends. A dodge ends it too; every enemy is hit at most once, allies never, and an Angel with Arrows Wingshield Blessing stops it. Counter-throws bounce as well. (The game card says "nearest"; the engine turns clockwise.)`,
        ru: ({ p, n }) =>
            `Диск может поразить одного врага за каждую единицу силы стека (5 при полной силе), включая выбранную цель, каждого на (${n(p)}% + удача) × сила стека / 5 обычного удара. От каждого поражённого врага он поворачивает по часовой стрелке от направления полёта к первому врагу через одну или две пустые клетки — вплотную стоящие юниты и перекрытые промежутки не считаются: через одну клетку урон остаётся полным, через две — половина, и полёт заканчивается. Уклонение тоже заканчивает полёт; каждого врага диск задевает не больше раза, союзников — никогда, а Angel с Arrows Wingshield Blessing его останавливает. Ответные броски тоже отскакивают. (Карточка в игре говорит «ближайшим», а движок поворачивает по часовой стрелке.)`,
    },
    Crusade: {
        en: () =>
            "Every cell the Champion walks — the approach of an attack included — permanently adds 0.1 per stack power (0.5 at full stack) plus 0.005 per point of luck to both its base attack and base armor, each capped at 50.",
        ru: () =>
            "Каждая клетка, пройденная Champion, — включая подход к атаке — навсегда добавляет 0,1 за единицу силы стека (0,5 при полной силе) плюс 0,005 за очко удачи и к базовой атаке, и к базовой броне, каждая не выше 50.",
    },
    "Crafted Double Punch": {
        en: ({ p, n }) =>
            `Permanent (forged by Craft). After the target's retaliation the unit strikes again for ${n(p / 5)}% per stack power (${n(p)}% at full stack), with its own dodge roll and on-hit effects. Dual Strike Charm does not boost it.`,
        ru: ({ p, n }) =>
            `Навсегда (выковано Craft). После ответа цели юнит бьёт ещё раз на ${n(p / 5)}% за единицу силы стека (${n(p)}% при полной силе), со своим броском уклонения и эффектами удара. Dual Strike Charm его не усиливает.`,
    },
    "Crafted Double Shot": {
        en: ({ p, n }) =>
            `Permanent (forged by Craft). After any counter-shot the unit fires a second arrow for ${n(p / 5)}% per stack power (${n(p)}% at full stack), spending another arrow (none left, no second shot), with its own dodge roll; if the first shot killed the target, the second flies on to the next enemy on the same line.`,
        ru: ({ p, n }) =>
            `Навсегда (выковано Craft). После ответного выстрела юнит стреляет второй раз на ${n(p / 5)}% за единицу силы стека (${n(p)}% при полной силе), тратя ещё одну стрелу (нет стрел — нет второго выстрела), со своим броском уклонения; если первый выстрел убил цель, второй летит в следующего врага на той же линии.`,
    },
    "Crafted Frozen Bow": craftedFrozen,
    "Crafted Frozen Sword": craftedFrozen,
    "Deep Wounds Level 1": deepWounds,
    "Deep Wounds Level 2": deepWounds,
    "Deep Wounds Level 3": deepWounds,
    "Dense Flesh": {
        en: ({ p }) => `Every enemy shot aimed at this unit spends ${p} arrows instead of one.`,
        ru: ({ p }) => `Каждый вражеский выстрел в этого юнита тратит ${p} стрелы вместо одной.`,
    },
    "Devour Essence": {
        en: ({ p, n }) =>
            `When the Hydra's attack or retaliation (Lightning Spin included) destroys a whole enemy stack, its wounded front Hydra heals by ${n(p / 5)}% of one Hydra's max health per stack power (fully at stack power 5), shifted by luck. Dead Hydras stay dead.`,
        ru: ({ p, n }) =>
            `Когда атака или ответ Hydra (включая Lightning Spin) уничтожает вражеский стек целиком, раненая передняя Hydra восстанавливает ${n(p / 5)}% максимального здоровья одной Hydra за единицу силы стека (полностью при силе 5), с поправкой на удачу. Погибшие Hydra не возвращаются.`,
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
            `Only when attacking: after the target's retaliation the unit strikes a second time for ${n(p / 5)}% per stack power (${n(p)}% at full stack), with its own dodge roll and on-hit effects. It is skipped if the retaliation stunned, blinded or froze the attacker, or the target died. A One in the Field target retaliates against the second strike too. Dual Strike Charm makes the second strike +${dualStrike}%.`,
        ru: ({ p, n }) =>
            `Только в атаке: после ответа цели юнит бьёт второй раз на ${n(p / 5)}% за единицу силы стека (${n(p)}% при полной силе), со своим броском уклонения и эффектами удара. Второго удара нет, если ответ оглушил, ослепил или заморозил атакующего либо цель погибла. Цель с One in the Field отвечает и на второй удар. Dual Strike Charm делает второй удар на ${dualStrike}% сильнее.`,
    },
    "Double Shot": {
        en: ({ p, n }) =>
            `After any counter-shot the Elf fires a second arrow for ${n(p / 5)}% per stack power (${n(p)}% at full stack), spending another arrow, with its own dodge roll; if the first shot killed the target, the second flies on to the next enemy on the same line. Against barrels it spends up to two arrows clearing them. Dual Strike Charm makes the second shot +${dualStrike}%.`,
        ru: ({ p, n }) =>
            `После ответного выстрела Elf стреляет второй раз на ${n(p / 5)}% за единицу силы стека (${n(p)}% при полной силе), тратя ещё одну стрелу, со своим броском уклонения; если первый выстрел убил цель, второй летит в следующего врага на той же линии. По бочкам тратит до двух стрел на расчистку. Dual Strike Charm делает второй выстрел на ${dualStrike}% сильнее.`,
    },
    "Double Throw": {
        en: ({ p }) =>
            `Every throw is followed by a second full Area Throw at the same spot: (${p} + luck)% of a normal hit, not scaled by stack power, with fresh dodge rolls. Each boulder costs a shot, so the Gargantuan's 14 shots make 7 double throws. Dual Strike Charm never boosts the second boulder.`,
        ru: ({ p }) =>
            `За каждым броском следует второй полный Area Throw в то же место: (${p} + удача)% обычного удара, без масштаба силой стека, с новыми бросками уклонения. Каждый валун тратит выстрел, поэтому 14 выстрелов Gargantuan — это 7 двойных бросков. Dual Strike Charm второй валун не усиливает.`,
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
            "100% magic resistance: immune to every spell from either side — buffs, heals and mass spells skip it too — and to magic damage (Chain Lightning, Fire Breath, Fire Shield, fire burns). It does not stop on-hit effects (Stun, Blindness, Paralysis, Petrifying Gaze, Break), auras or blessings, and the stack can still be resurrected.",
        ru: () =>
            "100% сопротивления магии: иммунитет ко всем заклинаниям обеих сторон — баффы, лечение и массовые заклинания его тоже пропускают — и к магическому урону (Chain Lightning, Fire Breath, Fire Shield, поджоги). Не защищает от эффектов ударов (Stun, Blindness, Paralysis, Petrifying Gaze, Break), аур и благословений, а стек по-прежнему можно воскресить.",
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
            `Each melee attack or retaliation also burns whoever stands directly behind the target on the line of the strike, friend or foe (1 cell behind a 1×1 target, 2 behind a 2×2), for ${n(p / 5)}% per stack power (${n(p)}% at full stack) of the Dragon's melee damage against them — their armor applies — cut by their magic resistance. Fire Elements and 100%-magic-resistance units take nothing and block it. It fires even if the main blow is dodged, and magic-damage bonuses raise it.`,
        ru: ({ p, n }) =>
            `Каждая атака или ответ в ближнем бою также обжигает того, кто стоит прямо за целью на линии удара, своего или чужого (на 1 клетку за целью 1×1, на 2 — за целью 2×2), на ${n(p / 5)}% за единицу силы стека (${n(p)}% при полной силе) урона дракона в ближнем бою по нему — его броня учитывается — с учётом его сопротивления магии. Юниты с Fire Element и со 100% сопротивления магии не получают урона и загораживают огонь. Дыхание срабатывает даже при уклонении от основного удара, а бонусы к магическому урону его усиливают.`,
    },
    "Fire Element": {
        en: ({ p }) =>
            `Immune to fire: Fire Strike, Fireball, Ring of Fire, Fire Wall, Fireforged burns, Fire Breath and Fire Shield deal it nothing, and fire spells can't target it. Takes ${p}% more from Water Element attacks and water magic. Its own attacks deal ${p}% more to Water Elements and pass through a Water Shield without breaking it.`,
        ru: ({ p }) =>
            `Иммунитет к огню: Fire Strike, Fireball, Ring of Fire, Fire Wall, поджоги Fireforged, Fire Breath и Fire Shield не наносят урона, а огненные заклинания не могут выбрать его целью. Получает на ${p}% больше от атак Water Element и магии воды. Его собственные атаки наносят на ${p}% больше юнитам с Water Element и проходят сквозь Water Shield, не разрушая его.`,
    },
    "Fire Shield": {
        en: ({ p, n }) =>
            `Every landed melee hit on the Efreet — second strikes, spin hits and retaliations against its own attacks included — burns the striker for ${n(p / 5)}% per stack power (${n(p)}% at full stack) of the damage dealt, rounded up, as fire magic cut by the striker's magic resistance; Fire Elements take nothing. Shots and dodged hits don't trigger it, and magic-damage bonuses raise it.`,
        ru: ({ p, n }) =>
            `Каждое попадание по Efreet в ближнем бою — включая вторые удары, удары вращением и ответы на его собственные атаки — обжигает ударившего на ${n(p / 5)}% за единицу силы стека (${n(p)}% при полной силе) нанесённого урона с округлением вверх, как магия огня с учётом сопротивления магии ударившего; Fire Element урона не получает. Выстрелы и удары, от которых Efreet уклонился, щит не вызывают, а бонусы к магическому урону его усиливают.`,
    },
    "Flesh Shield Aura": {
        en: ({ p, n }) =>
            `Allies within 2 cells (not the Abomination itself) have ${n(p / 5)}% per stack power (${n(p)}% at full stack, shifted by luck) of each physical hit moved onto the Abomination, re-priced against its armor and capped so the Abomination survives — the rest stays on the ally. Spells and magic damage are never absorbed.`,
        ru: ({ p, n }) =>
            `У союзников в радиусе 2 клеток (кроме самой Abomination) ${n(p / 5)}% за единицу силы стека (${n(p)}% при полной силе, с поправкой на удачу) каждого физического удара переносится на Abomination, пересчитывается под её броню и ограничивается так, чтобы она выжила, — остаток остаётся на союзнике. Заклинания и магический урон не поглощаются никогда.`,
    },
    "Forest Spellbook": {
        en: () => "Spell book: Courage ×3, Helping Hand ×1 (stack power 4+) and Summon Wolves ×2.",
        ru: () => "Книга заклинаний: Courage ×3, Helping Hand ×1 (сила стека 4+) и Summon Wolves ×2.",
    },
    "Guiding Winds Aura": {
        en: ({ p, n }) =>
            `Ranged allies within 2 cells, the Dryad included, shoot ${n(p / 5)}% farther per stack power (${n(p)}% at full stack, shifted by luck; never more than 35%). A longer shot distance widens every falloff band, not just the first.`,
        ru: ({ p, n }) =>
            `Союзные стрелки в радиусе 2 клеток, включая Dryad, стреляют на ${n(p / 5)}% дальше за единицу силы стека (${n(p)}% при полной силе, с поправкой на удачу; не больше 35%). Большая дистанция выстрела расширяет каждую полосу дальности, а не только первую.`,
    },
    Hamstring: {
        en: ({ p, n }) =>
            `Only on the Dryad's own attacks: ${n(p / 5)}% per stack power (${n(p)}% at full stack) plus 1% per point of luck to Hamstring a flying target — −30% movement for its next 3 turns. Magic resistance can resist it, a Peasant's Absorb Penalties can take it, Magic Mirror can reflect it, and it isn't reapplied while active.`,
        ru: ({ p, n }) =>
            `Только в собственных атаках Dryad: ${n(p / 5)}% за единицу силы стека (${n(p)}% при полной силе) плюс 1% за очко удачи наложить Hamstrung на летающую цель — −30% движения на её следующие 3 хода. Сопротивление магии может его отразить, Absorb Penalties у Peasant — забрать, Magic Mirror — вернуть; пока действует, повторно не накладывается.`,
    },
    Handyman: {
        en: () => "This shooter's melee hits — attacks and retaliations — deal full damage instead of half.",
        ru: () => "Удары этого стрелка в ближнем бою — атаки и ответы — наносят полный урон, а не половину.",
    },
    "Heavy Armor": {
        en: ({ p, n }) =>
            `+${n(p / 5)}% base armor per stack power (+${n(p)}% at full stack, shifted by luck). The same percentage is added to the damage it takes from Chain Lightning, Fire Breath and Fire Shield only; damage spells hit it normally.`,
        ru: ({ p, n }) =>
            `+${n(p / 5)}% к базовой броне за единицу силы стека (+${n(p)}% при полной силе, с поправкой на удачу). Тот же процент добавляется к урону, который он получает только от Chain Lightning, Fire Breath и Fire Shield; заклинания бьют его как обычно.`,
    },
    "In Its Own World": {
        en: () =>
            "Any vined cell — from either side's Vine Throw — costs the Trent no steps, straight or diagonal. An enemy vine it stops on can still snare it.",
        ru: () =>
            "Любая клетка с лозой — от Vine Throw любой стороны — не стоит Trent ни одного шага, ни по прямой, ни по диагонали. Вражеская лоза, на которой он остановился, всё равно может его опутать.",
    },
    Infest: {
        en: () =>
            "When this unit's attack or retaliation wipes out the stack it fought, a one-creature Arachna Spider (from a level 1–3 victim) or Arachna Queen (from a level 4 victim) appears on your side, if there is room.",
        ru: () =>
            "Когда атака или ответ этого юнита уничтожает стек противника целиком, на вашей стороне появляется Arachna Spider из одного существа (если жертва 1–3 уровня) или Arachna Queen (если жертва 4 уровня), если есть место.",
    },
    "Large Caliber": {
        en: ({ p, n }) =>
            `Every unit in the 3×3 block around the landing cell — the target, other enemies and your own units — takes ${n(p / 5)}% per stack power (${n(p)}% at full stack) of a normal shot, each with its own dodge roll. The shell flies over structures and smashes barrels in the block; a target that can shoot answers after all the damage lands.`,
        ru: ({ p, n }) =>
            `Каждый юнит в блоке 3×3 вокруг клетки попадания — цель, другие враги и ваши юниты — получает ${n(p / 5)}% за единицу силы стека (${n(p)}% при полной силе) обычного выстрела, каждый со своим броском уклонения. Снаряд летит поверх построек и разбивает бочки в блоке; цель, способная стрелять, отвечает после всего урона.`,
    },
    "Leather Armor": {
        en: ({ p }) => `This unit's armor against shots is ${p}% lower, so shots hurt it noticeably more.`,
        ru: ({ p }) => `Броня этого юнита против выстрелов на ${p}% ниже, поэтому выстрелы ранят его заметно сильнее.`,
    },
    "Lightning Spin": {
        en: () =>
            "Every attack and retaliation strikes all enemies touching the Hydra, each with its own dodge roll, and the Hydra's attacks can't be answered.",
        ru: () =>
            "Каждая атака и каждый ответ бьют всех врагов, стоящих вплотную к Hydra, каждого со своим броском уклонения, а на атаки Hydra нельзя ответить.",
    },
    "Limited Supply": {
        en: () =>
            "The quiver holds only its full size × stack power / 5 arrows, rounded down — 2/4/6/8/10 of the Arbalester's 10 at stack power 1–5 — plus any Rallying Volley arrows; arrows above a lowered cap are lost for good.",
        ru: () =>
            "Колчан вмещает лишь полный запас × сила стека / 5 стрел с округлением вниз — 2/4/6/8/10 из 10 у Arbalester при силе стека 1–5, — плюс стрелы от Rallying Volley; стрелы сверх сниженного предела пропадают навсегда.",
    },
    "Luck Aura": {
        en: () =>
            "Allies within 2 cells, the Leprechaun included, have their luck fixed at +10 instead of the lap roll; Misfortune drops them to 0. +10 luck means about 10% less attack damage taken and +10 points on the stack's ability chances.",
        ru: () =>
            "У союзников в радиусе 2 клеток, включая Leprechaun, удача зафиксирована на +10 вместо броска круга; Misfortune опускает её до 0. +10 удачи — это примерно на 10% меньше урона от атак и +10 пунктов к шансам способностей стека.",
    },
    "Lucky Strike": {
        en: ({ p, n }) =>
            `Every hit — shots, retaliations, second strikes, splash and spin hits — has ${n(p / 5)}% per stack power plus 1% per point of luck to deal ${n(p / 5)}% per stack power plus 1% per point of luck more damage: ${n(p)}% for +${n(p)}% at full stack.`,
        ru: ({ p, n }) =>
            `Каждое попадание — выстрелы, ответы, вторые удары, удары по площади и вращением — с шансом ${n(p / 5)}% за единицу силы стека плюс 1% за очко удачи наносит на ${n(p / 5)}% за единицу силы стека плюс 1% за очко удачи больше урона: ${n(p)}% на +${n(p)}% при полной силе стека.`,
    },
};
