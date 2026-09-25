import effectsJson from "@heroesofcrypto/common/src/configuration/effects.json";

import type { NoteSpec } from "./format";

const effectPower = (name: string): number =>
    (effectsJson as unknown as Record<string, { power?: number }>)[name]?.power ?? 0;

export const ABILITY_NOTES_M_Z: Readonly<Record<string, NoteSpec>> = {
    "Made of Fire": {
        en: () =>
            "On the FIRE PIT map this creature may cross and stand in the central lava (other walkers can't enter it; other flyers can fly over it but can't end a move there, and gain nothing from it). Any move whose path touches lava — starting in it, crossing it or ending in it — gives Made of Fire for 2 laps: +10% max health, attack, armor, movement, initiative, shot range and magic resistance, and its abilities work at 110% of their power. It isn't refreshed while active, standing still in lava does nothing, and the pool dries into normal ground at the start of lap 10 (earlier when stalled laps add extra rings).",
        ru: () =>
            "На карте FIRE PIT это существо может проходить по центральной лаве и стоять в ней (остальные наземные юниты войти в неё не могут; остальные летающие могут пролететь над ней, но не остановиться в ней, и ничего от неё не получают). Любое перемещение, путь которого касается лавы — начинается в ней, пересекает её или заканчивается в ней, — даёт Made of Fire на 2 круга: +10% к максимальному здоровью, атаке, броне, движению, инициативе, дистанции выстрела и сопротивлению магии, а способности работают на 110% силы. Пока эффект действует, он не обновляется, стояние в лаве ничего не даёт, а озеро высыхает в обычную землю в начале 10-го круга (раньше, если затянутые круги добавили кольца сужения).",
    },
    Madness: {
        en: () =>
            "Immune to Mind abilities and spells — Blindness, Aggr, Boar Saliva, Terrifying and Petrifying Gaze, Courage, Sadness, Misfortune, Rangebane, Cowardice. Its morale is always 0, so it never gets Morale or Dismorale.",
        ru: () =>
            "Иммунитет к ментальным способностям и заклинаниям — Blindness, Aggr, Boar Saliva, Terrifying и Petrifying Gaze, Courage, Sadness, Misfortune, Rangebane, Cowardice. Мораль всегда 0, поэтому Morale и Dismorale у него не срабатывают.",
    },
    "Magic Reflection": {
        en: ({ p, n }) =>
            `Each hostile spell that lands on the dragon has ${n(p / 5)}% per stack power (${n(p)}% at full stack) plus 1% per point of luck to rebound. The dragon still takes the whole spell. A rebounded damage spell hits the caster for that same percentage of the damage the dragon took, reduced by the caster's own element and magic resistance; a rebounded debuff (a spell, Spit Ball or Hamstring) lands on the caster as well. Magic damage from abilities — Fire Breath, Chain Lightning, Fire Shield, Fireforged Sword — isn't reflected. A Magic Mirror on the dragon doesn't add to it: a damage spell returns Reflection's share when it procs and the Mirror's otherwise, a debuff is copied at the higher of the two chances, and only the Mirror returns ability magic damage.`,
        ru: ({ p, n }) =>
            `Каждое враждебное заклинание, попавшее в дракона, с шансом ${n(p / 5)}% за единицу силы стека (${n(p)}% при полной силе) плюс 1% за очко удачи отражается. Дракон всё равно получает заклинание целиком. Отражённое заклинание урона бьёт заклинателя на тот же процент от урона, полученного драконом, с учётом стихии и сопротивления магии самого заклинателя; отражённый дебафф (заклинание, Spit Ball или Hamstring) ложится и на заклинателя. Магический урон от способностей — Fire Breath, Chain Lightning, Fire Shield, Fireforged Sword — не отражается. Magic Mirror на драконе с ней не складывается: заклинание урона возвращается по доле Reflection, если она сработала, иначе по доле Mirror, дебафф копируется с большим из двух шансов, а магический урон способностей возвращает только Mirror.`,
    },
    "Magic Shield": {
        en: ({ p, n }) =>
            `Adds ${n(p / 5)}% magic resistance per stack power (${n(p)}% at full stack, shifted by luck), combined with the unit's own as a separate roll: 15% own + 50% → 57.5%. It lowers magic damage and the chance that debuff spells land — Hamstring and the Vine Throw snare included, which roll against magic resistance too — but does nothing against Stun, Freeze, Paralysis, Blindness or the gazes. Off while Broken.`,
        ru: ({ p, n }) =>
            `Добавляет ${n(p / 5)}% сопротивления магии за единицу силы стека (${n(p)}% при полной силе, с поправкой на удачу), которое складывается с собственным как отдельный бросок: свои 15% + 50% → 57,5%. Снижает магический урон и шанс, что сработает дебафф заклинания, — включая Hamstring и захват Vine Throw, которые тоже бросаются против сопротивления магии, — но не защищает от Stun, Freeze, Paralysis, Blindness и взглядов. Под Break не работает.`,
    },
    Mechanism: {
        en: () =>
            "Immune to Mind abilities and spells and to poison; morale is always 0, so it never gets Morale or Dismorale. It can't be healed or resurrected. Status effects hit it harder: Stun and Freeze chances ×1.5, Paralysis and Shatter Armor 50% stronger. It takes 50% more damage from physical area and line attacks — Area Throw, Large Caliber, Chakram, Lightning Spin, Skewer Strike, Through Shot — which status resistance offsets point for point. With Amulet of Resolve both apply: an Orc's 35% Stun on a Tsar Cannon becomes 35 × 1.5 × 0.75 ≈ 39% (52.5% without the Amulet).",
        ru: () =>
            "Иммунитет к ментальным способностям, заклинаниям и яду; мораль всегда 0, поэтому Morale и Dismorale не срабатывают. Лечить и воскрешать его нельзя. Эффекты Статуса бьют сильнее: шанс Stun и Freeze ×1,5, Paralysis и Shatter Armor на 50% сильнее. Получает на 50% больше урона от физических атак по площади и по линии — Area Throw, Large Caliber, Chakram, Lightning Spin, Skewer Strike, Through Shot, — а сопротивление статусам компенсирует это пункт в пункт. С Amulet of Resolve действуют оба множителя: 35% шанс Stun у Orc по Tsar Cannon становится 35 × 1,5 × 0,75 ≈ 39% (52,5% без амулета).",
    },
    Miner: {
        en: ({ p, n }) =>
            `Each landed melee hit — retaliations included — permanently moves ${n(p / 5)} base armor per stack power (${n(p)} at full stack, ±0.1 per point of luck) from the target to the Troglodyte. The target never drops below 1 base armor, and the Troglodyte gains only what was actually removed.`,
        ru: ({ p, n }) =>
            `Каждое попадание в ближнем бою — включая ответы — навсегда переносит ${n(p / 5)} базовой брони за единицу силы стека (${n(p)} при полной силе, ±0,1 за очко удачи) с цели на Troglodyte. Базовая броня цели не опускается ниже 1, а Troglodyte получает только то, что реально снято.`,
    },
    "No Melee": {
        en: () =>
            "Has no melee attack and never retaliates against melee attacks. While an enemy stands next to it — so it cannot shoot — it cannot attack at all.",
        ru: () =>
            "Нет ближней атаки, и на удары в ближнем бою он никогда не отвечает. Пока рядом стоит враг — а значит, стрелять нельзя, — атаковать он не может вообще.",
    },
    "One in the Field": {
        en: () =>
            "Retaliates against every melee attack it receives, with no once-per-lap limit. The usual blockers (Stun, Blindness, Freeze, Shadow Touch, Terrifying Gaze) still stop a retaliation, and it never answers shots. Every answer rolls the Unicorn's Blindness, so against a Double Punch it answers both strikes unless its first answer blinds the attacker, which cancels the second.",
        ru: () =>
            "Отвечает на каждую атаку в ближнем бою, без ограничения раз за круг. Обычные запреты (Stun, Blindness, Freeze, Shadow Touch, Terrifying Gaze) по-прежнему мешают ответу, а на выстрелы он не отвечает. Каждый ответ бросает Blindness у Unicorn, поэтому против Double Punch он отвечает на оба удара, если только первый ответ не ослепит атакующего — тогда второго удара не будет.",
    },
    Paralysis: {
        en: ({ p, n }) =>
            `Each landed melee hit, retaliations included, has ${n((p * 2) / 5)}% per stack power (${n(p * 2)}% at full stack), plus 2% per point of luck and lowered by status resistance, to paralyse the target for 1 lap: it can't move, and its weapon hits — attacks, retaliations, shots, second strikes and splash — are cut by ${n(effectPower("Paralysis") / 5)}% per Mantis stack power (${n(effectPower("Paralysis"))}% at full stack, shifted by luck; ×1.5 against Mechanism). Spells and Fire Breath keep full damage. It can still strike adjacent enemies, shoot, cast and retaliate. It doesn't stack or refresh. Might's Abilities power synergy adds its points to the cut: a full Mantis stack cuts 45% at level 1 and 48% at level 2 (level 3 is an all-Might army, with no room for a Nature Mantis) — its chance is already 100%.`,
        ru: ({ p, n }) =>
            `Каждое попадание в ближнем бою, включая ответы, с шансом ${n((p * 2) / 5)}% за единицу силы стека (${n(p * 2)}% при полной силе), плюс 2% за очко удачи и с учётом сопротивления статусам, парализует цель на 1 круг: она не может двигаться, а её удары оружием — атаки, ответы, выстрелы, вторые удары и удары по площади — ослаблены на ${n(effectPower("Paralysis") / 5)}% за единицу силы стека Mantis (${n(effectPower("Paralysis"))}% при полной силе, с поправкой на удачу; ×1,5 против Mechanism). Заклинания и Fire Breath бьют в полную силу. Она всё ещё может бить соседних врагов, стрелять, применять заклинания и отвечать. Не складывается и не обновляется. Синергия Силы «Сила способностей» добавляет свои очки к снижению: полный стек Mantis ослабляет на 45% на 1 уровне и на 48% на 2 уровне (3 уровень — армия целиком из Силы, где Mantis из Природы нет места), а шанс и так 100%.`,
    },
    "Pegasus Light": {
        en: () =>
            `Each landed melee hit, retaliations included, marks the enemy with Pegasus Light for 1 lap (not refreshed while marked). Every unit that lands a hit on a marked enemy gains +${effectPower("Pegasus Light")} morale, plus 1 per point of the Pegasus's luck; units whose morale is locked (Madness, Mechanism, Courage, Sadness, Morale, Dismorale) gain nothing. Stack power doesn't change it.`,
        ru: () =>
            `Каждое попадание в ближнем бою, включая ответы, помечает врага Pegasus Light на 1 круг (пока метка есть, она не обновляется). Каждый юнит, попавший по помеченному врагу, получает +${effectPower("Pegasus Light")} морали плюс 1 за очко удачи Pegasus; юниты с зафиксированной моралью (Madness, Mechanism, Courage, Sadness, Morale, Dismorale) ничего не получают. Сила стека на это не влияет.`,
    },
    "Pegasus Might Aura": {
        en: ({ p }) => `Allies within 2 cells, the Pegasus included, get +${p} base attack and +${p} base armor.`,
        ru: ({ p }) =>
            `Союзники в радиусе 2 клеток, включая Pegasus, получают +${p} к базовой атаке и +${p} к базовой броне.`,
    },
    "Penetrating Bite": {
        en: ({ p, n }) =>
            `Each melee hit and retaliation adds flat damage equal to ${n(p / 5)}% per stack power (${n(p)}% at full stack; ±1% per point of luck) of ONE target creature's max health, after armor. It doesn't grow with either stack's size: +${n((200 * p) / 100)} per bite against a 200-health Arachna Queen, only a couple of points against a Fairy.`,
        ru: ({ p, n }) =>
            `Каждый удар и ответ в ближнем бою добавляет фиксированный урон в ${n(p / 5)}% за единицу силы стека (${n(p)}% при полной силе; ±1% за очко удачи) от максимального здоровья ОДНОГО существа цели, уже после брони. От размера стеков не растёт: +${n((200 * p) / 100)} за укус по Arachna Queen с 200 здоровья и лишь пара очков по Fairy.`,
    },
    "Petrifying Gaze": {
        en: ({ p, n }) =>
            `Every landed hit — shots, counter-shots and melee — does two things. First, extra kills: a random ⅔ to all of ${n(p / 5)}% per stack power (${n(p)}% at full stack, ±luck) of that hit's damage becomes whole creatures killed, never the last one. Then a petrify roll kills the front creature: at full stack ${Math.min(35, Math.round(p / 4))}% against level-1 targets, +4% per target level (${Math.min(35, Math.round(p / 4) + 12)}% against level 4); ${Math.round(p / 20)}–${Math.round(p / 20) + 12}% at stack power 1; ranged falloff multiplies the roll by 0.75 per step, and mind resistance lowers it. Madness and Mechanism units are immune to both. Against big lone creatures the petrify roll does the work; against large stacks of small ones the extra kills do. A Flesh Shield Aura doesn't soften it: the gaze is priced from the full hit before the aura takes its share.`,
        ru: ({ p, n }) =>
            `Каждое попадание — выстрелы, ответные выстрелы и ближний бой — делает две вещи. Сначала дополнительные убийства: случайные от ⅔ до всех ${n(p / 5)}% за единицу силы стека (${n(p)}% при полной силе, ±удача) урона этого удара превращаются в целиком убитых существ, но не последнего. Затем бросок окаменения убивает переднее существо: при полной силе ${Math.min(35, Math.round(p / 4))}% против целей 1 уровня, +4% за каждый уровень цели (${Math.min(35, Math.round(p / 4) + 12)}% против 4 уровня); ${Math.round(p / 20)}–${Math.round(p / 20) + 12}% при силе стека 1; штраф дальности умножает шанс на 0,75 за ступень, а сопротивление ментальным эффектам его снижает. У юнитов с Madness и Mechanism иммунитет к обоим. Против крупных одиночек работает окаменение, против больших стеков мелких существ — дополнительные убийства. Flesh Shield Aura его не смягчает: взгляд считается от полного удара до того, как аура заберёт свою долю.`,
    },
    "Piercing Spear": {
        en: ({ p, n }) =>
            `Ignores ${n(p / 5)}% of the target's armor per stack power (${n(p)}% at full stack, shifted by luck) on every attack, shot and retaliation. Damage is divided by armor, so at full stack this roughly doubles damage against any target.`,
        ru: ({ p, n }) =>
            `Игнорирует ${n(p / 5)}% брони цели за единицу силы стека (${n(p)}% при полной силе, с поправкой на удачу) в каждой атаке, выстреле и ответе. Урон делится на броню, поэтому при полной силе это примерно удваивает урон по любой цели.`,
    },
    "Predatory Assimilation": {
        en: ({ p, n }) =>
            `Each landed melee attack or retaliation has ${n(p / 5)}% per stack power (${n(p)}% at full stack) plus 1% per point of luck to take one random ability from the target that the Queen doesn't already have. The target loses it for the rest of the fight and the Queen uses it — with its aura and any remaining spell charges. Broken units can neither steal nor be robbed.`,
        ru: ({ p, n }) =>
            `Каждая атака или ответ в ближнем бою с шансом ${n(p / 5)}% за единицу силы стека (${n(p)}% при полной силе) плюс 1% за очко удачи забирает у цели одну случайную способность, которой у Queen ещё нет. Цель теряет её до конца боя, а Queen пользуется ею — вместе с аурой и оставшимися зарядами заклинаний. Юниты под Break не могут ни красть, ни быть обокраденными.`,
    },
    "Rallying Volley Aura": {
        en: ({ p }) =>
            `Once per fight, each allied ranged unit — Zena included — that stands within 2 cells of Zena gets +${p} shots added to its quiver. It is a one-time top-up: stepping out and back in, or a second Zena, adds nothing, and spent shots aren't refilled.`,
        ru: ({ p }) =>
            `Раз за бой каждый союзный стрелок — включая Zena, — оказавшийся в радиусе 2 клеток от Zena, получает +${p} выстрела в колчан. Это разовое пополнение: выйти и вернуться или добавить вторую Zena ничего не даёт, а потраченные выстрелы не восполняются.`,
    },
    "Range Null Field Aura": {
        en: () =>
            "Enemy shooters within 2 cells of the Griffin (more with Might's Aura Range synergy) can neither shoot nor return fire.",
        ru: () =>
            "Вражеские стрелки в радиусе 2 клеток от Griffin (больше с синергией Силы «Радиус аур») не могут ни стрелять, ни отвечать выстрелом.",
    },
    "Rapid Charge": {
        en: ({ p, n }) =>
            `The melee attack deals +${n(p / 5)}% damage per stack power (+${n(p)}% at full stack; ±1% per point of luck) for every cell of the charge, counting the cell it started from: at full stack a 2-cell move and strike is +${n(p * 3)}%, and a strike without moving +${n(p)}%. It never goes below ×1 and doesn't apply to retaliation.`,
        ru: ({ p, n }) =>
            `Атака в ближнем бою наносит +${n(p / 5)}% урона за единицу силы стека (+${n(p)}% при полной силе; ±1% за очко удачи) за каждую клетку разбега, считая стартовую: при полной силе ход на 2 клетки и удар — это +${n(p * 3)}%, удар без перемещения — +${n(p)}%. Множитель не бывает меньше ×1 и не действует на ответы.`,
    },
    Resurrection: {
        en: () =>
            "One use per fight, whichever comes first. (1) When the Angel stack is wiped out in combat, by Fire Wall or by the first Armageddon wave, half the fallen Angels (rounded down, at least 1) return at full health with all effects removed — not while Broken, and not after a death to poison, narrowing or a later Armageddon wave. (2) Cast on any allied stack with losses, itself included — never a Mechanism unit such as the Tsar Cannon — it restores health worth 1.5× the Angel stack's total max health (×1.25 on Morale, ×0.8 on Dismorale): the wounded creature first, then the dead, never more than died. Casting it gives up the self-resurrection. A stack that comes back isn't wiped out, so an enemy Infest gets nothing from it.",
        ru: () =>
            "Один раз за бой — что случится раньше. (1) Когда стек Angel уничтожен в бою, Fire Wall или первой волной Армагеддона, половина павших Angel (с округлением вниз, минимум 1) возвращается с полным здоровьем и без эффектов — но не под Break и не после гибели от яда, сужения или поздних волн Армагеддона. (2) Применённая к любому союзному стеку с потерями, включая себя, — но никогда к юниту с Mechanism вроде Tsar Cannon — она восстанавливает здоровье в 1,5× суммарного максимального здоровья стека Angel (×1,25 при Morale, ×0,8 при Dismorale): сначала раненое существо, потом погибшие, не больше, чем погибло. Применение отменяет самовоскрешение. Вернувшийся стек не считается уничтоженным, поэтому вражеский Infest ничего с него не получает.",
    },
    "Shadow Touch": {
        en: () => "Its attacks are never answered: the target can't retaliate — unless it is Broken, which switches this off for 2 laps.",
        ru: () => "На его атаки никогда не отвечают: цель не может нанести ответный удар — если только он не под Break, который отключает это на 2 круга.",
    },
    "Sharpened Weapons Aura": {
        en: ({ p, n }) =>
            `Allied non-ranged units — melee and magic, the Crusader included — within 2 cells get +${n(p / 5)}% base attack per stack power (+${n(p)}% at full stack; ±1% per point of the Crusader's luck). Several Crusaders don't stack.`,
        ru: ({ p, n }) =>
            `Союзные юниты без дальней атаки — ближнего боя и магии, включая Crusader, — в радиусе 2 клеток получают +${n(p / 5)}% к базовой атаке за единицу силы стека (+${n(p)}% при полной силе; ±1% за очко удачи Crusader). Несколько Crusader не складываются.`,
    },
    "Shatter Armor": {
        en: ({ p, n }) =>
            `Each landed melee attack (not retaliation) lowers the target's armor by ${n(p / 5)} per stack power (${n(p)} at full stack; ±1 per 10 luck; ×1.5 against Mechanism), with no resist roll. Hits add up, and each new hit resets the total to last 3 laps. Armor never drops below 1, and the lower armor helps every ally that hits that target.`,
        ru: ({ p, n }) =>
            `Каждая атака в ближнем бою (не ответ) снижает броню цели на ${n(p / 5)} за единицу силы стека (${n(p)} при полной силе; ±1 за 10 удачи; ×1,5 против Mechanism), без броска сопротивления. Попадания складываются, и каждое новое заново выставляет сумме срок в 3 круга. Броня не опускается ниже 1, а сниженная броня помогает каждому союзнику, бьющему эту цель.`,
    },
    "Skewer Strike": {
        en: ({ p, n }) =>
            `When it strikes a one-cell target, the thrust carries on to the cell directly behind it — even if the main blow misses — and strikes the enemy standing there (of any size) with a separate hit — its own dodge roll — for ${n(p / 5)}% per stack power (${n(p)}% at full stack), and the attacker's on-hit effects apply to it too. It never pierces past larger targets and never hits allies. It works on retaliation as well.`,
        ru: ({ p, n }) =>
            `Нанося удар по цели размером в одну клетку, удар проходит дальше в клетку прямо за ней — даже если основной удар промахнулся — и отдельным попаданием — со своим броском уклонения — бьёт стоящего там врага (любого размера) на ${n(p / 5)}% за единицу силы стека (${n(p)}% при полной силе), и эффекты удара атакующего действуют и на него. Сквозь цели крупнее одной клетки не проходит и союзников не задевает. Работает и при ответе.`,
    },
    "Sky Runner": {
        en: ({ p, n }) => `+${n(p / 5)} movement per stack power (+${n(p)} at full stack; ±1 at ±10 luck).`,
        ru: ({ p, n }) => `+${n(p / 5)} к движению за единицу силы стека (+${n(p)} при полной силе; ±1 при удаче ±10).`,
    },
    "Small Specie": {
        en: ({ p, n }) =>
            `Physical attacks from creatures bigger than one cell miss this unit ${n(p / 5)}% of the time per stack power (${n(p)}% at full stack; ±1% per point of the Fairy's luck) — melee, retaliation, shots and every splash or pierce hit. It rolls separately from other dodge chances, so miss chances multiply: a Behemoth under a full Boar Saliva (30%) swinging at a full Fairy stack misses 1 − 0.7 × 0.5 = 65% of the time.`,
        ru: ({ p, n }) =>
            `Физические атаки существ крупнее одной клетки промахиваются по этому юниту в ${n(p / 5)}% случаев за единицу силы стека (${n(p)}% при полной силе; ±1% за очко удачи Fairy) — ближний бой, ответы, выстрелы и каждый удар по площади или насквозь. Бросок отдельный от других шансов уклонения, поэтому шансы промаха перемножаются: Behemoth под полным Boar Saliva (30%), бьющий полный стек Fairy, промахивается в 1 − 0,7 × 0,5 = 65% случаев.`,
    },
    Sniper: {
        en: () =>
            "Its shots ignore range falloff entirely — full damage at any distance — though a shot that passes through Smoke is still halved.",
        ru: () =>
            "Его выстрелы полностью игнорируют штраф дальности — полный урон на любом расстоянии, — но выстрел сквозь Smoke всё равно наносит половину.",
    },
    "Spit Ball": {
        en: ({ p, n }) =>
            `After each landed shot, counter-shot or second shot, every listed debuff the target doesn't have rolls separately at ${n(p / 5)}% per stack power (${n(p)}% at full stack) plus 1% per point of luck; Rangebane is tried only against shooters. Each success must still pass the target's magic resistance, and Sadness, Rangebane and Cowardice (Mind) never land on Madness or Mechanism units. Curse, Sadness, Quagmire (−25% movement), Weakening Beam (−24% base armor) and Weakness (−30% base attack) last 3 laps; Rangebane and Cowardice 1 lap. Magic Mirror or Magic Reflection can bounce a debuff back onto the Beholder, and Absorb Penalties can take it.`,
        ru: ({ p, n }) =>
            `После каждого попавшего выстрела, ответного или второго выстрела каждый дебафф из списка, которого у цели нет, бросается отдельно с шансом ${n(p / 5)}% за единицу силы стека (${n(p)}% при полной силе) плюс 1% за очко удачи; Rangebane пробуется только против стрелков. Каждый успех ещё должен пройти сопротивление магии цели, а Sadness, Rangebane и Cowardice (Разум) не ложатся на юнитов с Madness и Mechanism. Curse, Sadness, Quagmire (−25% движения), Weakening Beam (−24% базовой брони) и Weakness (−30% базовой атаки) длятся 3 круга; Rangebane и Cowardice — 1 круг. Magic Mirror или Magic Reflection могут вернуть дебафф на Beholder, а Absorb Penalties — забрать его.`,
    },
    Stun: {
        en: ({ p, n }) =>
            `Every landed hit — attack, retaliation, shot, counter-shot or second strike — has ${n(p / 5)}% per stack power (${n(p)}% at full stack) plus 1% per point of luck, ×1.5 against Mechanism and lowered by status resistance, to stun: the target skips its next turn and can't retaliate until then. An active stun is never extended. In melee the target has already retaliated against the stunning blow.`,
        ru: ({ p, n }) =>
            `Каждое попадание — атака, ответ, выстрел, ответный выстрел или второй удар — с шансом ${n(p / 5)}% за единицу силы стека (${n(p)}% при полной силе) плюс 1% за очко удачи, ×1,5 против Mechanism и с учётом сопротивления статусам, оглушает: цель пропускает следующий ход и до него не может отвечать. Действующее оглушение не продлевается. В ближнем бою цель уже успела ответить на оглушающий удар.`,
    },
    "Sylvan Focus Aura": {
        en: ({ p }) =>
            `Allies within 2 cells of the Satyr, itself included, deal +${p}% magic damage, ±1% per point of the Satyr's luck (never below 0); stack size doesn't change it. It adds to Empower, the augment and the Mage's rings as one sum and raises spells, Fire Breath, Fire Shield, Chain Lightning, Fire Wall and Fireforged Sword. Several Satyrs don't stack.`,
        ru: ({ p }) =>
            `Союзники в радиусе 2 клеток от Satyr, включая его, наносят на ${p}% больше магического урона, ±1% за очко удачи Satyr (не ниже 0); от размера стека не зависит. Складывается с Empower, апгрейдом и кольцами магов в одну сумму и усиливает заклинания, Fire Breath, Fire Shield, Chain Lightning, Fire Wall и Fireforged Sword. Несколько Satyr не складываются.`,
    },
    "Terrifying Gaze": {
        en: ({ p, n }) =>
            `Each of the Manticore's own landed melee attacks (not retaliations) has ${n(p / 5)}% per stack power (${n(p)}% at full stack) plus 1% per point of luck, lowered by mind resistance, to frighten the target for 1 lap: it can't attack, shoot at or retaliate against this Manticore — a frightened Hydra's Lightning Spin passes it over too — but may attack anyone else, and spells aren't blocked. The target still retaliates against the frightening blow. Madness and Mechanism units are immune.`,
        ru: ({ p, n }) =>
            `Каждая собственная атака Manticore в ближнем бою (не ответ) с шансом ${n(p / 5)}% за единицу силы стека (${n(p)}% при полной силе) плюс 1% за очко удачи, уменьшенным сопротивлением ментальным эффектам, пугает цель на 1 круг: она не может атаковать эту Manticore, стрелять в неё и отвечать ей — Lightning Spin напуганной Hydra её тоже обходит, — но может бить любого другого, а заклинания не запрещены. На сам пугающий удар цель всё равно отвечает. У юнитов с Madness и Mechanism иммунитет.`,
    },
    "Through Shot": {
        en: ({ p }) =>
            `The shot flies on to the edge of the board and hits every enemy on the line — allies are passed over unharmed — each for (${p} + luck)% of a normal hit, not scaled by stack power, with its own dodge roll and distance falloff; everything past a Smoke cloud is halved. The mountain stops it, and so does an Angel's Arrows Wingshield. Its shots are never answered, and the Tsar Cannon never returns fire.`,
        ru: ({ p }) =>
            `Выстрел летит до края поля и поражает каждого врага на линии — союзников пролетает, не раня, — каждого на (${p} + удача)% обычного удара, без масштаба силой стека, со своим броском уклонения и своим штрафом дальности; всё за облаком Smoke получает половину. Гора его останавливает, как и Arrows Wingshield у Angel. На его выстрелы никогда не отвечают, и сама Tsar Cannon никогда не отвечает выстрелом.`,
    },
    "Tie up the Horses Aura": {
        en: ({ p }) => `Allied non-flying units within 2 cells, the Champion included, get +${p} movement.`,
        ru: ({ p }) => `Союзные нелетающие юниты в радиусе 2 клеток, включая Champion, получают +${p} к движению.`,
    },
    "Time Denial": {
        en: () =>
            "While a stack with Time Denial is alive and not Broken, no unit on either side can wait on the Hourglass.",
        ru: () =>
            "Пока жив стек с Time Denial и на нём нет Break, ни один юнит обеих сторон не может ждать через Hourglass.",
    },
    "Tome of Elements": {
        en: () =>
            "Spell book: Whirlpool ×1 (stack power 3+), Lightning Strike ×4, Ring of Fire ×2 (stack power 4+) and Meteor Shower ×1 (full stack, stack power 5 — measured against the strongest stack on the board, so an enemy stack grown by Life's Supply synergy at level 3 can take it away) per fight. It can't cast while Broken; if the tome is stolen, its remaining charges go with it.",
        ru: () =>
            "Книга заклинаний: Whirlpool ×1 (сила стека 3+), Lightning Strike ×4, Ring of Fire ×2 (сила стека 4+) и Meteor Shower ×1 (полная сила стека, 5 — она считается от сильнейшего стека на поле, так что вражеский стек, выросший от синергии Жизни «Запас» 3 уровня, может её отнять) на бой. Под Break колдовать нельзя; если книгу украдут, оставшиеся заряды уходят вместе с ней.",
    },
    "Tome of Might": {
        en: () =>
            "Spell book: Riot ×2, Magic Mirror ×2, Mass Riot ×1 and Mass Magic Mirror ×1 per fight; the Mass versions need stack power 4+.",
        ru: () =>
            "Книга заклинаний: Riot ×2, Magic Mirror ×2, Mass Riot ×1 и Mass Magic Mirror ×1 на бой; для массовых версий нужна сила стека 4+.",
    },
    "Unyielding Power": {
        en: () =>
            "Every lap from the first the Behemoth gains +1 movement, +2 base attack, +5 max health and +5 current health, for the rest of the fight. A lap spent under Break gives nothing (that gain is lost), and while Broken the extra max health is gone, so current health is cut down to fit.",
        ru: () =>
            "Каждый круг, начиная с первого, Behemoth получает +1 к движению, +2 к базовой атаке, +5 к максимальному и +5 к текущему здоровью — до конца боя. Круг под Break ничего не даёт (эта прибавка теряется), а пока Break действует, добавленное максимальное здоровье пропадает, и текущее урезается до нового предела.",
    },
    "Venom Cloud Aura": {
        en: ({ p }) =>
            `Allies within 2 cells of the Wyvern, itself included, poison whatever they damage — attacks, retaliations, shots, second hits, pierced and skewered units: ${p}% of the damage dealt (±1% per point of the hitter's luck) is dealt again at the start of each of the victim's turns for the rest of the fight, ignoring armor and magic resistance. Poisoning an already poisoned unit adds half the new poison to its tick (or lifts the tick to the new value if that is higher): a 40 tick hit by a 30 poison becomes 40 + 15 = 55, by a 100 poison 100. Mechanism units are immune, and two poison auras don't stack.`,
        ru: ({ p }) =>
            `Союзники в радиусе 2 клеток от Wyvern, включая её, отравляют всё, по чему наносят урон, — атаки, ответы, выстрелы, вторые удары, пробитые и нанизанные цели: ${p}% нанесённого урона (±1% за очко удачи ударившего) повторяется в начале каждого хода жертвы до конца боя, без учёта брони и сопротивления магии. Отравление уже отравленного юнита добавляет к тику половину нового яда (или поднимает тик до нового значения, если оно больше): тик 40 после яда 30 становится 40 + 15 = 55, после яда 100 — 100. У Mechanism иммунитет, а две ядовитые ауры не складываются.`,
    },
    "Vine Throw": {
        en: ({ p, n }) =>
            `Once per fight, at Trent stack power 3+: throws a vine at any enemy that no other creature screens — no range limit, terrain doesn't block — unless it has 100% magic resistance or is already snared. Every cell along the throw is vined for 3 laps (not the Trent's own cell, the mountain or holes), and any non-flying creature from either side — except the Trent itself — pays 1 extra step to enter a vined cell. The struck enemy loses ${n(p)} movement (never below 1) for 3 laps unless its magic resistance saves it; an enemy that ends a move on the vine — walking in to strike included — gets the same snare with no save. The vine never snares the Trent's own side.`,
        ru: ({ p, n }) =>
            `Раз за бой при силе стека Trent 3+: бросает лозу в любого врага, которого не заслоняет другое существо, — без ограничения дальности, местность не мешает, — если у него нет 100% сопротивления магии и он ещё не опутан. Каждая клетка на пути броска покрывается лозой на 3 круга (кроме клетки самого Trent, горы и провалов), и любое нелетающее существо любой стороны — кроме самого Trent — тратит 1 лишний шаг на вход в клетку с лозой. Поражённый враг теряет ${n(p)} движения (не ниже 1) на 3 круга, если сопротивление магии его не спасёт; враг, закончивший перемещение на лозе, — в том числе подходя для удара, — опутывается так же, без спасброска. Сторону Trent лоза не опутывает никогда.`,
    },
    "War Anger Aura": {
        en: ({ p, n }) =>
            `For each enemy stack within 2 cells of the cell the Valkyrie strikes from, she gets +${n(p / 5)}% of her base attack per stack power (+${n(p)}% at full stack; ±1% per point of luck). Her retaliations keep the count from before the attacker moved, so an enemy that walks in from farther away isn't counted for the answer. Off while Broken.`,
        ru: ({ p, n }) =>
            `За каждый вражеский стек в радиусе 2 клеток от клетки, с которой Valkyrie бьёт, она получает +${n(p / 5)}% базовой атаки за единицу силы стека (+${n(p)}% при полной силе; ±1% за очко удачи). В ответах она сохраняет счёт, сделанный до того, как атакующий подошёл, поэтому враг, пришедший издалека, в ответе не считается. Под Break не работает.`,
    },
    Wardguard: {
        en: ({ p, n }) =>
            `Adds ${n(p / 5)}% magic resistance per stack power (${n(p)}% at full stack, shifted by luck), combined with the unit's own as a separate roll. It lowers magic damage and the chance that debuff spells land (Hamstring and the Vine Throw snare included), with no effect on Stun, Freeze, Paralysis, Blindness or the gazes.`,
        ru: ({ p, n }) =>
            `Добавляет ${n(p / 5)}% сопротивления магии за единицу силы стека (${n(p)}% при полной силе, с поправкой на удачу), которое складывается с собственным как отдельный бросок. Снижает магический урон и шанс, что сработает дебафф заклинания (включая Hamstring и захват Vine Throw), но не защищает от Stun, Freeze, Paralysis, Blindness и взглядов.`,
    },
    "Warding Mane Blessing": {
        en: ({ p, n }) =>
            `While the Manticore lives and isn't Broken, every ally — the Manticore included — gains magic resistance of ${n(p / 5)}% per Manticore stack power (${n(p)}% at full stack), multiplied by (1 + the Manticore's luck / 100). It combines with each unit's own resistance as a separate roll (15% own + 25% → 36.25%), and several Manticores don't stack.`,
        ru: ({ p, n }) =>
            `Пока Manticore жива и на ней нет Break, каждый союзник — включая её — получает сопротивление магии ${n(p / 5)}% за единицу силы стека Manticore (${n(p)}% при полной силе), умноженное на (1 + удача Manticore / 100). Оно складывается с собственным сопротивлением юнита как отдельный бросок (свои 15% + 25% → 36,25%); несколько Manticore не складываются.`,
    },
    "Water Element": {
        en: ({ p }) =>
            `Immune to water magic: Whirlpool can't chain it. Takes ${p}% more from fire spells, Fire Element attacks, Fire Wall and Fireforged burns; its own attacks deal ${p}% more to Fire Elements.`,
        ru: ({ p }) =>
            `Иммунитет к магии воды: Whirlpool его не удержит. Получает на ${p}% больше от огненных заклинаний, атак Fire Element, Fire Wall и поджогов Fireforged; его собственные атаки наносят на ${p}% больше юнитам с Fire Element.`,
    },
    "Water Shield": {
        en: () =>
            "Once per battle, the first damage the Mermaid takes from any source — attack, retaliation, spell, splash, poison tick, Fire Wall, even an Armageddon wave — is reduced to 0 and the shield breaks; that hit's on-hit effects (stun, poison, petrify…) are cancelled too. Damage from Fire Element creatures ignores the shield without breaking it. While the Mermaid is Broken the shield neither absorbs nor breaks; it works again once Break wears off. Once broken it never comes back.",
        ru: () =>
            "Один раз за бой первый урон, который Mermaid получает из любого источника — атака, ответ, заклинание, удар по площади, тик яда, Fire Wall, даже волна Армагеддона, — становится 0, и щит разрушается; эффекты этого удара (оглушение, яд, окаменение…) тоже отменяются. Урон от существ с Fire Element проходит сквозь щит, не разрушая его. Пока Mermaid под Break, щит не поглощает урон и не разрушается — он снова работает, когда Break закончится. Разрушенный щит не восстанавливается.",
    },
    "Web Aura": {
        en: ({ p }) =>
            `Enemy flyers that start their turn within ${p} cells of the Arachna Queen can't move that turn, though they can still strike in place, shoot or cast.`,
        ru: ({ p }) =>
            `Вражеские летающие юниты, начинающие ход в радиусе ${p} клеток от Arachna Queen, не могут в этот ход двигаться, но могут бить с места, стрелять и применять заклинания.`,
    },
    "Wild Regeneration": {
        en: () =>
            "At the start of each of its turns the Troll's wounded front creature heals to full, before any poison tick; dead Trolls don't come back. Once per fight it can gift the ability to an allied level 1–3 stack that isn't a Troll and lacks it: the Troll loses it and the ally regenerates for the rest of the fight. Off while Broken.",
        ru: () =>
            "В начале каждого своего хода раненое переднее существо Troll полностью восстанавливается, ещё до тика яда; погибшие Troll не возвращаются. Раз за бой способность можно подарить союзному стеку 1–3 уровня, который не Troll и у которого её нет: Troll её теряет, а союзник регенерирует до конца боя. Под Break не работает.",
    },
    "Wind Element": {
        en: ({ p }) =>
            `Immune to Air magic: Lightning Strike can't target it, and a Chain Lightning that reaches it stops there. Earth spells (Meteorite, Meteor Shower) and Earth Element creatures deal it ${p}% more; its own attacks deal ${p}% more to Earth Elements.`,
        ru: ({ p }) =>
            `Иммунитет к магии воздуха: Lightning Strike не может выбрать его целью, а Chain Lightning, дойдя до него, обрывается. Заклинания земли (Meteorite, Meteor Shower) и существа с Earth Element наносят ему на ${p}% больше; его собственные атаки наносят на ${p}% больше юнитам с Earth Element.`,
    },
    "Wind Flow": {
        en: ({ p }) =>
            `Once per fight, and only at full stack (stack power 5, measured against the strongest stack on the board — an enemy stack grown by Life's Supply synergy at level 3 can take it away): every flying unit on the board — both sides, the Valkyrie included — gets +${p} base armor and −${p} movement (never below 1) for 3 laps. Flyers with 100% magic resistance or already under Wind Flow are skipped, and enemies can't resist it. With Tome of Amplification in the Valkyrie's army its own flyers get ×1.5 of the armor — +6 — while every flyer still loses ${p} movement and enemy flyers get +${p} armor.`,
        ru: ({ p }) =>
            `Раз за бой и только при полной силе стека (5; она считается от сильнейшего стека на поле — вражеский стек, выросший от синергии Жизни «Запас» 3 уровня, может её отнять): каждый летающий юнит на поле — обеих сторон, включая Valkyrie, — получает +${p} к базовой броне и −${p} к движению (не ниже 1) на 3 круга. Летающие юниты со 100% сопротивления магии или уже под Wind Flow пропускаются, а враги не могут сопротивляться. С Tome of Amplification в армии Valkyrie её собственные летающие получают броню ×1,5 — +6, — а движения каждый летающий по-прежнему теряет ${p}, и вражеские получают +${p} к броне.`,
    },
    "Wolf Trail Aura": {
        en: ({ p, n }) =>
            `Allies within 2 cells of the Wolf Rider, itself included, get +${n(p / 5)} movement per stack power (+${n(p)} at full stack). Movement is fractional — a diagonal step costs about 1.41 — so even a small bonus can open a cell. Several Wolf Riders don't stack.`,
        ru: ({ p, n }) =>
            `Союзники в радиусе 2 клеток от Wolf Rider, включая его, получают +${n(p / 5)} к движению за единицу силы стека (+${n(p)} при полной силе). Движение дробное — шаг по диагонали стоит около 1,41, — поэтому даже маленький бонус может открыть клетку. Несколько Wolf Rider не складываются.`,
    },
};
