import effectsJson from "@heroesofcrypto/common/src/configuration/effects.json";

import { renderNote, type NoteLanguage, type NoteSpec } from "./format";

const EFFECT_NOTES: Readonly<Record<string, NoteSpec>> = {
    Stun: {
        en: () =>
            "The unit skips its next turn and can't retaliate until then — the skipped turn costs it 1 morale, like any skip; an active stun is never extended. Applied by Stun (Orc, Squire) — ×1.5 against Mechanism, lowered by status resistance — and by the stun outcome of a Blacksmith's Craft, which status resistance doesn't lower.",
        ru: () =>
            "Юнит пропускает следующий ход и до него не может отвечать — пропущенный ход стоит ему 1 морали, как любой пропуск; действующее оглушение не продлевается. Накладывается способностью Stun (Orc, Squire) — ×1,5 против Mechanism, с учётом сопротивления статусам — и исходом «оглушение» у Craft Blacksmith, который сопротивление статусам не снижает.",
    },
    Freeze: {
        en: () =>
            "The unit skips its next 2 turns and can't retaliate; each skipped turn costs it 1 morale. Applied by Craft-forged Frozen Bow and Frozen Sword — ×1.5 against Mechanism, lowered by status resistance; magic resistance doesn't help.",
        ru: () =>
            "Юнит пропускает 2 следующих хода и не может отвечать; каждый пропущенный ход стоит ему 1 морали. Накладывается выкованными Craft Frozen Bow и Frozen Sword — ×1,5 против Mechanism, с учётом сопротивления статусам; сопротивление магии не помогает.",
    },
    Blindness: {
        en: () =>
            "The unit skips its next 2 turns and can't retaliate — each skipped turn costs it 1 morale; taking damage doesn't wake it. Applied by the Unicorn's Blindness; mind resistance lowers the chance, and Madness and Mechanism units are immune.",
        ru: () =>
            "Юнит пропускает 2 следующих хода и не может отвечать — каждый пропущенный ход стоит ему 1 морали; полученный урон его не будит. Накладывается Blindness у Unicorn; сопротивление ментальным эффектам снижает шанс, у Madness и Mechanism иммунитет.",
    },
    "Boar Saliva": {
        en: ({ p, n }) =>
            `For 3 laps the unit misses (${n(p)} + the Boar's luck + Might's Abilities power synergy) × Boar stack power / 5 % of its melee attacks, shots and retaliations (${n(p)}% at full stack before luck and synergy), rolled separately from other misses. Every landed melee hit of the Frenzied Boar applies it unless it is already active; it is a Mind effect, so mind resistance can shrug it off and Madness and Mechanism are immune.`,
        ru: ({ p, n }) =>
            `3 круга юнит промахивается в (${n(p)} + удача Boar + синергия Силы «Сила способностей») × сила стека Boar / 5 % своих атак, выстрелов и ответов (${n(p)}% при полной силе без учёта удачи и синергии), отдельным броском от других промахов. Каждое попадание Frenzied Boar в ближнем бою накладывает его, если он ещё не действует; это ментальный эффект, поэтому сопротивление ментальным эффектам может его сбросить, а у Madness и Mechanism иммунитет.`,
    },
    "Shatter Armor": {
        en: () =>
            "Each melee attack by a Nomad strips stack power + luck / 10 armor (×1.5 against Mechanism) with no resist roll; the amounts stack, each hit resets the total to 3 laps, and armor never drops below 1.",
        ru: () =>
            "Каждая атака Nomad в ближнем бою снимает сила стека + удача / 10 брони (×1,5 против Mechanism) без броска сопротивления; величины складываются, каждое попадание заново выставляет сумме срок в 3 круга, а броня не опускается ниже 1.",
    },
    Poison: {
        en: () =>
            "Lasts the whole fight unless an allied Monk's Absolving Arrow lifts it. At the start of each of its turns — including the second one after an Hourglass wait — the unit loses the poison amount, ignoring armor and magic resistance. A hit from a unit inside a Wyvern's Venom Cloud poisons for 20% of the damage dealt (±1% per point of the hitter's luck); each later poisoning adds half its amount to the tick, or lifts the tick to the new amount if that is higher — a 40 tick hit by a 30 poison becomes 40 + 15 = 55, by a 100 poison 100. Mechanism units are immune.",
        ru: () =>
            "Действует до конца боя, если его не снимет Absolving Arrow союзного Monk. В начале каждого своего хода — включая второй после ожидания через Hourglass — юнит теряет величину яда без учёта брони и сопротивления магии. Удар юнита в Venom Cloud у Wyvern отравляет на 20% нанесённого урона (±1% за очко удачи ударившего); каждое следующее отравление добавляет к тику половину своей величины или поднимает тик до новой, если она больше, — тик 40 после яда 30 становится 40 + 15 = 55, после яда 100 — 100. У Mechanism иммунитет.",
    },
    "Pegasus Light": {
        en: ({ p }) =>
            `For 1 lap every unit that lands a hit on the marked enemy gains ${p} + the Pegasus's luck morale (units with locked morale gain nothing). Every landed melee hit or retaliation of a Pegasus applies it unless it is already on the target.`,
        ru: ({ p }) =>
            `1 круг каждый юнит, попавший по помеченному врагу, получает ${p} + удача Pegasus морали (юниты с зафиксированной моралью — ничего). Накладывается каждым попаданием Pegasus в ближнем бою или ответом, если метки на цели ещё нет.`,
    },
    Paralysis: {
        en: ({ p, n }) =>
            `For 1 lap the unit can't move, and its weapon hits — attacks, retaliations, shots, second strikes and splash — deal (${n(p)} + the Mantis's luck + Might's Abilities power synergy) × Mantis stack power / 5 % less (${n(p)}% at full stack before luck and synergy; ×1.5 against Mechanism). Spells and Fire Breath keep full damage. It can still strike adjacent enemies, shoot and cast.`,
        ru: ({ p, n }) =>
            `1 круг юнит не может двигаться, а его удары оружием — атаки, ответы, выстрелы, вторые удары и удары по площади — наносят на (${n(p)} + удача Mantis + синергия Силы «Сила способностей») × сила стека Mantis / 5 % меньше урона (${n(p)}% при полной силе без учёта удачи и синергии; ×1,5 против Mechanism). Заклинания и Fire Breath бьют в полную силу. Бить соседних врагов, стрелять и колдовать он по-прежнему может.`,
    },
    "Deep Wounds": {
        en: () =>
            "Not used up by the next attack: every melee hit or retaliation from a Deep Wounds unit adds its amount to the wounds and resets them to 3 laps, and every attacker holding a Deep Wounds card deals the wound total as extra percent damage to this target. Wounding Charm gives Level 1 to a whole army.",
        ru: () =>
            "Не тратится следующей атакой: каждый удар или ответ в ближнем бою юнита с Deep Wounds добавляет свою величину к ранам и заново выставляет им срок в 3 круга, а каждый атакующий с картой Deep Wounds наносит этой цели дополнительный урон в процентах, равный сумме ран. Wounding Charm даёт Level 1 всей армии.",
    },
    Aggr: {
        en: () =>
            "For 1 lap the unit may attack — melee, shots, targeted spells — and retaliate only against the Pikeman that provoked it, and can't attack the mountain; it ends early if that Pikeman dies. Mind: Madness and Mechanism units are immune.",
        ru: () =>
            "1 круг юнит может атаковать — в ближнем бою, выстрелом, заклинанием на цель — и отвечать только тому Pikeman, который его спровоцировал, и не может атаковать гору; эффект кончается раньше, если этот Pikeman погиб. Разум: у Madness и Mechanism иммунитет.",
    },
    Break: {
        en: () =>
            "For 2 laps all of the unit's abilities are off — including the auras and blessings it projects and its elemental and mind immunities — and it can't cast spells. Only attacks apply it, never spells: Chaos's Break on Attack synergy gives every weapon hit a chance. While it is active another Break can't land, except from a retaliation or counter-shot, which can renew it; a Broken Efreet or Black Dragon loses Fire Element.",
        ru: () =>
            "2 круга все способности юнита отключены — включая ауры и благословения, которые он даёт, и его стихийные и ментальные иммунитеты, — и он не может применять заклинания. Накладывается только атаками, не заклинаниями: синергия Хаоса «Разлом при атаке» даёт шанс каждому удару оружием. Пока действует, повторно не накладывается — кроме как ответом или ответным выстрелом, которые могут его обновить; Efreet или Black Dragon под Break теряют Fire Element.",
    },
    "Terrifying Gaze": {
        en: () =>
            "For 1 lap the unit can't attack, shoot at or retaliate against the Manticore that frightened it, but may attack anyone else; spells aren't blocked. Mind: Madness and Mechanism units are immune.",
        ru: () =>
            "1 круг юнит не может атаковать напугавшую его Manticore, стрелять в неё и отвечать ей, но может бить любого другого; заклинания не запрещены. Разум: у Madness и Mechanism иммунитет.",
    },
};

export const effectNote = (name: string, language: NoteLanguage): string | undefined => {
    const raw = (effectsJson as unknown as Record<string, { power?: number }>)[name];
    return renderNote(EFFECT_NOTES[name], raw?.power ?? 0, language);
};

/**
 * How effect durations count, shared by every effect and timed spell. A lap on an effect is a turn of the
 * unit carrying it, which is why "3 laps" can outlast three rounds when the unit waits or is skipped.
 */
export const DURATION_NOTE = {
    en: "An N-lap effect covers the holder's next N turns: it counts down when the holder ends a turn (a skipped turn counts, an Hourglass wait does not), and usually gets one lap more when applied to the unit whose turn it is. While a stack is on Morale its buffs don't count down; on Dismorale its debuffs and effects don't. 15 laps means the whole fight.",
    ru: "Эффект на N кругов покрывает следующие N ходов владельца: он убывает, когда владелец заканчивает ход (пропущенный ход считается, ожидание через Hourglass — нет), и обычно длится на круг дольше, если наложен на юнита, чей сейчас ход. Пока стек под Morale, его баффы не убывают; под Dismorale не убывают его дебаффы и эффекты. 15 кругов — это весь бой.",
};
