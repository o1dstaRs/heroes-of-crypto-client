export interface PatchNote {
    version: string;
    date: string;
    commit: string;
    href: string;
    title: string;
    impact: string;
    stats: Array<{
        value: string;
        label: string;
    }>;
    sections: Array<{
        title: string;
        items: string[];
    }>;
    roster: Array<{
        faction: string;
        units: Array<{
            name: string;
            abilities: string;
        }>;
    }>;
    closing: string;
}

const releaseCandidateRoster: PatchNote["roster"] = [
    {
        faction: "Life",
        units: [
            { name: "Squire", abilities: "Stun" },
            { name: "Peasant", abilities: "Bitter Experience, Absorb Penalties Aura" },
            { name: "Arbalester", abilities: "Sniper, Leather Armor, Limited Supply" },
            { name: "Pikeman", abilities: "Aggr, Skewer Strike, Wardguard" },
            { name: "Valkyrie", abilities: "War Anger Aura, Wind Flow" },
            { name: "Healer", abilities: "Book of Healing; spells: Heal, Spiritual Armor, Blessing, Mass Heal" },
            { name: "Crusader", abilities: "Double Punch, Sharpened Weapons Aura" },
            { name: "Griffin", abilities: "Range Null Field Aura, Sky Runner, Deep Wounds Level 2" },
            { name: "Tsar Cannon", abilities: "Mechanism, No Melee, Through Shot" },
            { name: "Angel", abilities: "Resurrection, Arrows Wingshield Aura" },
        ],
    },
    {
        faction: "Nature",
        units: [
            { name: "Fairy", abilities: "Shadow Touch, Small Species" },
            { name: "Wolf", abilities: "Double Punch, Deep Wounds Level 1" },
            { name: "Leprechaun", abilities: "Luck Aura, Lucky Strike" },
            { name: "White Tiger", abilities: "Disguise Aura, Deep Wounds Level 2" },
            { name: "Elf", abilities: "Double Shot" },
            { name: "Satyr", abilities: "Forest Spellbook; spells: Courage, Helping Hand, Summon Wolves" },
            { name: "Unicorn", abilities: "One in the Field, Blindness" },
            { name: "Mantis", abilities: "Paralysis" },
            { name: "Gargantuan", abilities: "Double Shot, Area Throw" },
            { name: "Pegasus", abilities: "Pegasus Might Aura, Pegasus Light" },
        ],
    },
    {
        faction: "Chaos",
        units: [
            { name: "Scavenger", abilities: "Backstab, Dodge" },
            { name: "Orc", abilities: "Stun" },
            { name: "Troglodyte", abilities: "Madness, Blind Fury, Miner" },
            { name: "Medusa", abilities: "Endless Quiver, Petrifying Gaze" },
            { name: "Troll", abilities: "Wild Regeneration" },
            { name: "Beholder", abilities: "Spit Ball" },
            { name: "Efreet", abilities: "Fire Element, Made of Fire, Fire Shield" },
            { name: "Goblin Knight", abilities: "Heavy Armor" },
            { name: "Black Dragon", abilities: "Fire Element, Enchanted Skin, Fire Breath" },
            { name: "Hydra", abilities: "Lightning Spin" },
        ],
    },
    {
        faction: "Might",
        units: [
            { name: "Berserker", abilities: "AI Driven, Double Punch" },
            { name: "Centaur", abilities: "Handyman, Piercing Spear, Boost Health" },
            { name: "Wolf Rider", abilities: "Wolf Trail Aura, Rapid Charge" },
            { name: "Nomad", abilities: "Shatter Armor, Rapid Charge" },
            { name: "Harpy", abilities: "Shadow Touch, Castling" },
            { name: "Hyena", abilities: "Penetrating Bite" },
            { name: "Ogre Mage", abilities: "Tome of Might; spells: Riot, Magic Mirror, Mass Riot, Mass Magic Mirror" },
            { name: "Cyclops", abilities: "Large Caliber" },
            { name: "Thunderbird", abilities: "Wind Element, Chain Lightning" },
            { name: "Behemoth", abilities: "Unyielding Power, Battle Roar, Deep Wounds Level 3" },
        ],
    },
];

export const patchNotes = {
    en: [
        {
            version: "v0.1.4",
            date: "10/27/2024",
            commit: "97a9a2c",
            href: "https://github.com/o1dstaRs/heroes-of-crypto-client/commit/97a9a2c8885f1a095e0baae478af73f2f507d5b9",
            title: "Team augments and faction synergies",
            impact: "A strategy-layer update: teams now make meaningful pre-fight investment choices before the first unit moves.",
            stats: [
                { value: "6", label: "augment points per team" },
                { value: "5", label: "upgrade paths" },
                { value: "4", label: "faction synergy families" },
            ],
            sections: [
                {
                    title: "Major features",
                    items: [
                        "Team augments are live. Each team starts with 6 augment points to customize its strategy.",
                        "Placement upgrades improve board control with enhanced formation options.",
                        "Armor upgrades boost unit durability, reaching up to +21% armor.",
                        "Might upgrades strengthen melee combat, reaching up to +27% attack.",
                        "Sniper upgrades improve ranged pressure, reaching up to +24% attack and +70% range.",
                        "Movement upgrades increase tactical mobility, reaching up to +2 movement steps.",
                    ],
                },
                {
                    title: "Faction synergies",
                    items: [
                        "Life teams can unlock Supply Boost for stronger battle starts and Morale for army-wide power.",
                        "Chaos teams gain mobility bonuses and Break on Attack chances that can disable enemy abilities.",
                        "Might teams extend aura range and amplify stack-ability power.",
                        "Nature teams improve board control with additional placement and add armor for flying units.",
                    ],
                },
                {
                    title: "Placement and balance",
                    items: [
                        "Placement was simplified around upgradeable wide formations.",
                        "Synergy effects now scale with same-faction unit counts: 2, 4, and 6 units for levels 1, 2, and 3.",
                        "The augment-point system creates clearer resource allocation decisions before battle.",
                        "Placement upgrades are now tied into augments instead of living as a separate tactical layer.",
                    ],
                },
            ],
            roster: [],
            closing:
                "Choose augments carefully, stack faction bonuses deliberately, and the battlefield opens up in new ways.",
        },
        {
            version: "v0.1.3",
            date: "10/13/2024",
            commit: "a9c9b0d",
            href: "https://github.com/o1dstaRs/heroes-of-crypto-client/commit/a9c9b0ded050d62d3a78f5119734c3fb0f81a527",
            title: "Final release-candidate roster",
            impact: "The first release-candidate army list is locked: four factions, 40 units, and the ability set that defines the initial match meta.",
            stats: [
                { value: "20", label: "spells ready" },
                { value: "40", label: "units implemented" },
                { value: "8", label: "effects available" },
                { value: "10", label: "aura effects ready" },
                { value: "67", label: "unique abilities" },
            ],
            sections: [
                {
                    title: "Release-candidate scope",
                    items: [
                        "The final creature list for the first release candidate is in place.",
                        "Abilities, spells, auras, and effects now form the baseline content set for public match balancing.",
                        "The update also includes UI enhancements, bug fixes, gameplay balancing, new map types, and general polish.",
                    ],
                },
            ],
            roster: releaseCandidateRoster,
            closing:
                "This roster, spell, ability, and aura package is the final content baseline for the initial release candidate.",
        },
        {
            version: "v0.1.2",
            date: "06/12/2024",
            commit: "b779327",
            href: "https://github.com/o1dstaRs/heroes-of-crypto-client/commit/b7793274821690a0c7d707f9e8ff04f93426c9c1",
            title: "AI and core mechanics updates",
            impact: "A mechanics-heavy update focused on prediction battles, clearer turn pacing, new unit identities, and attack correctness.",
            stats: [
                { value: "5", label: "new units" },
                { value: "7", label: "new abilities" },
                { value: "60s", label: "max team lap" },
            ],
            sections: [
                {
                    title: "AI and battle flow",
                    items: [
                        "Predictable melee-unit AI was added for Prediction Battles.",
                        "The same auto-battle behavior is available behind a new AI button for testing.",
                        "Turn timing was recalculated with a max 60-second team lap, minimum 3-second action time, and maximum 15-second action time.",
                    ],
                },
                {
                    title: "New units",
                    items: [
                        "Хаос: Troll.",
                        "Хаос: Goblin Knight.",
                        "Хаос: Efreet.",
                        "Жизнь: Crusader.",
                        "Природа: Leprechaun.",
                    ],
                },
                {
                    title: "New abilities",
                    items: [
                        "Piercing Spear lets Centaur ignore enemy armor on any attack.",
                        "Boost Health increases Centaur HP by 10-50% based on stack power.",
                        "Heavy Armor gives Goblin Knight 50% more armor while taking 50% more spell damage.",
                        "Fire Element makes units resist Fire attacks while taking 50% more Water damage.",
                        "Fire Shield lets Efreet reflect up to 40% of incoming damage as Fire damage.",
                        "Wild Regeneration lets Troll recover to full HP at the beginning of its turn.",
                        "Stun gives Squire and Orc a 30% chance to disable an enemy.",
                    ],
                },
                {
                    title: "Fixes and improvements",
                    items: [
                        "Fixed Handyman behavior to prevent doubling ranged attacks.",
                        "Switched random number generation to crypto-based randomness.",
                        "Improved attack-animation handling so animation timing matches actual attacks.",
                        "Corrected double-shot and double-punch animations.",
                        "Double Shot can now affect multiple lined-up targets.",
                        "Orc no longer has the Handyman ability.",
                        "Minor unit-stat adjustments were applied across the roster.",
                    ],
                },
            ],
            roster: [],
            closing:
                "The result is a cleaner combat loop, more readable tests, and stronger foundations for AI battles.",
        },
        {
            version: "v0.1.1",
            date: "04/13/2024",
            commit: "",
            href: "",
            title: "New units and abilities",
            impact: "A content and performance update that added marquee abilities while making the game much lighter to load.",
            stats: [
                { value: "7x", label: "smaller game bundle" },
                { value: "2", label: "new late-game units" },
                { value: "6+", label: "ability and map fixes" },
            ],
            sections: [
                {
                    title: "New units and abilities",
                    items: [
                        "Added Angel for Life and Behemoth for Might.",
                        "Added Fire Breath for Black Dragon, dealing Fire damage to units behind the target, including teammates.",
                        "Added Lightning Spin for Hydra so it attacks or responds to all enemy targets around it.",
                        "Added Sniper so Arbalester deals full ranged damage regardless of distance.",
                        "Added Leather Armor so Arbalester has only 50% ranged armor.",
                        "Added Limited Supply so Arbalester shots scale from stack size: number_of_shots = stack_size * 2.",
                        "Updated Double Punch and Double Shot icons so they share the same design language.",
                    ],
                },
                {
                    title: "Map and gameplay polish",
                    items: [
                        "Units now move properly toward center when the map shrinks.",
                        "If a shrinking row or column is fully loaded, the unit there is destroyed.",
                        "Trees are replaced by space tiles as the map narrows.",
                        "Luck is now used as an addendum in total ability-power computation.",
                        "Full-damage areas for ranged units are visible before the fight starts.",
                    ],
                },
                {
                    title: "Performance and stability",
                    items: [
                        "All image assets moved from PNG to WebP, reducing the total game bundle size by 7x.",
                        "FPS and unit movement are smoother because web-app state reloads only when needed.",
                        "Major bug fixes and improvements moved the project closer to open source and AI Prediction Battles.",
                    ],
                },
            ],
            roster: [],
            closing:
                "This update made the game feel faster, clearer, and closer to the intended public combat experience.",
        },
        {
            version: "v0.1.0",
            date: "01/11/2024",
            commit: "",
            href: "",
            title: "First public testbed",
            impact: "The first public testbed opened the battlefield so players could try the core fight loop in-browser.",
            stats: [
                { value: "4", label: "factions" },
                { value: "3", label: "unit roles" },
                { value: "9", label: "initial abilities and spells" },
            ],
            sections: [
                {
                    title: "Initial testbed scope",
                    items: [
                        "Created the first public fight testbed where anyone could try the available factions and units.",
                        "Added Chaos, Might, Life, and Nature factions with their first unit sets.",
                        "Added ranged, melee, and magic unit roles.",
                        "Implemented early ability logic for One in the Field, Shadow Touch, Double Punch, Double Shot, Handyman, Endless Quiver, and Enchanted Skin.",
                        "Implemented early spell logic for Summon Wolves and Helping Hand.",
                    ],
                },
            ],
            roster: [],
            closing: "This was the foundation for the browser-first tactical game that the later releases built on.",
        },
    ] satisfies PatchNote[],
    ru: [
        {
            version: "v0.1.4",
            date: "27.10.2024",
            commit: "97a9a2c",
            href: "https://github.com/o1dstaRs/heroes-of-crypto-client/commit/97a9a2c8885f1a095e0baae478af73f2f507d5b9",
            title: "Командные апгрейды и фракционные синергии",
            impact: "Большой стратегический слой перед боем: команды теперь вкладывают очки в стиль игры еще до первого хода.",
            stats: [
                { value: "6", label: "очков апгрейдов на команду" },
                { value: "5", label: "веток улучшений" },
                { value: "4", label: "семейства синергий" },
            ],
            sections: [
                {
                    title: "Главные изменения",
                    items: [
                        "Система командных апгрейдов включена. Каждая команда начинает с 6 очками для настройки стратегии.",
                        "Апгрейды расстановки дают больше контроля над полем и формациями.",
                        "Апгрейды брони повышают выживаемость юнитов, до +21% брони.",
                        "Апгрейды ближнего боя усиливают ближний урон, до +27% атаки.",
                        "Апгрейды стрельбы усиливают дальний бой, до +24% атаки и +70% дальности.",
                        "Апгрейды движения повышают мобильность, до +2 шагов движения.",
                    ],
                },
                {
                    title: "Фракционные синергии",
                    items: [
                        "Жизнь открывает снабжение для сильного старта боя и бонусы морали для усиления всей армии.",
                        "Хаос получает бонусы к мобильности и срыв при атаке, который может отключать способности врагов.",
                        "Сила расширяет радиус аур и усиливает способности, зависящие от силы стека.",
                        "Природа добавляет контроль поля через дополнительные расстановки и броню для летающих юнитов.",
                    ],
                },
                {
                    title: "Расстановка и баланс",
                    items: [
                        "Система расстановки упрощена вокруг улучшаемых широких формаций.",
                        "Эффекты синергий теперь масштабируются от количества юнитов одной фракции: 2, 4 и 6 для уровней 1, 2 и 3.",
                        "Очки апгрейдов делают предбоевой выбор более понятным и важным.",
                        "Улучшения расстановки встроены в систему апгрейдов, а не живут отдельным правилом.",
                    ],
                },
            ],
            roster: [],
            closing:
                "Выбирайте апгрейды аккуратно, собирайте синергии осознанно, и поле боя раскрывается совсем иначе.",
        },
        {
            version: "v0.1.3",
            date: "13.10.2024",
            commit: "a9c9b0d",
            href: "https://github.com/o1dstaRs/heroes-of-crypto-client/commit/a9c9b0ded050d62d3a78f5119734c3fb0f81a527",
            title: "Финальный ростер релиз-кандидата",
            impact: "Состав первого релиз-кандидата зафиксирован: четыре фракции, 40 юнитов и набор способностей, который формирует стартовую мету матчей.",
            stats: [
                { value: "20", label: "заклинаний готовы" },
                { value: "40", label: "юнитов реализовано" },
                { value: "8", label: "эффектов доступны" },
                { value: "10", label: "эффектов аур готовы" },
                { value: "67", label: "уникальных способностей" },
            ],
            sections: [
                {
                    title: "Состав релиз-кандидата",
                    items: [
                        "Финальный список существ для первого релиз-кандидата готов.",
                        "Способности, заклинания, ауры и эффекты теперь задают базовый контент для баланса публичных матчей.",
                        "Обновление также включает улучшения интерфейса, исправления, баланс геймплея, новые типы карт и общую полировку.",
                    ],
                },
            ],
            roster: releaseCandidateRoster,
            closing:
                "Этот ростер, заклинания, способности и ауры становятся финальной контентной базой первого релиз-кандидата.",
        },
        {
            version: "v0.1.2",
            date: "12.06.2024",
            commit: "b779327",
            href: "https://github.com/o1dstaRs/heroes-of-crypto-client/commit/b7793274821690a0c7d707f9e8ff04f93426c9c1",
            title: "AI и обновления базовых механик",
            impact: "Механическое обновление про предсказательные бои, понятный темп хода, новые роли юнитов и корректность атак.",
            stats: [
                { value: "5", label: "новых юнитов" },
                { value: "7", label: "новых способностей" },
                { value: "60с", label: "максимум на круг команды" },
            ],
            sections: [
                {
                    title: "AI и темп боя",
                    items: [
                        "Добавлен предсказуемый AI для ближних юнитов в режиме предсказательных боев.",
                        "Та же логика автобоя доступна через новую AI-кнопку для тестирования.",
                        "Пересчитано время хода: максимум 60 секунд на круг команды, минимум 3 секунды на действие, максимум 15 секунд на действие.",
                    ],
                },
                {
                    title: "Новые юниты",
                    items: [
                        "Хаос: Troll.",
                        "Хаос: Goblin Knight.",
                        "Хаос: Efreet.",
                        "Жизнь: Crusader.",
                        "Природа: Leprechaun.",
                    ],
                },
                {
                    title: "Новые способности",
                    items: [
                        "Piercing Spear позволяет Centaur игнорировать броню врага при любой атаке.",
                        "Boost Health увеличивает здоровье Centaur на 10-50% в зависимости от силы стека.",
                        "Heavy Armor дает Goblin Knight +50% брони, но он получает на 50% больше урона от заклинаний.",
                        "Fire Element дает сопротивление огненным атакам, но увеличивает урон водой на 50%.",
                        "Fire Shield позволяет Efreet отражать до 40% входящего урона как огненный урон.",
                        "Wild Regeneration восстанавливает Troll до полного здоровья в начале его хода.",
                        "Stun дает Squire и Orc 30% шанс отключить врага.",
                    ],
                },
                {
                    title: "Исправления и улучшения",
                    items: [
                        "Исправлено поведение Handyman, чтобы не удваивать дальние атаки.",
                        "Генерация случайных чисел переведена на криптографическую случайность.",
                        "Анимации атак теперь лучше совпадают с реальными атаками.",
                        "Исправлены анимации Double Shot и Double Punch.",
                        "Double Shot теперь может задевать несколько целей на одной линии.",
                        "Orc больше не имеет способности Handyman.",
                        "Применены небольшие корректировки характеристик юнитов по ростеру.",
                    ],
                },
            ],
            roster: [],
            closing: "В итоге боевой цикл стал чище, тесты читаемее, а фундамент для AI-боев крепче.",
        },
        {
            version: "v0.1.1",
            date: "13.04.2024",
            commit: "",
            href: "",
            title: "Новые юниты и способности",
            impact: "Контентное и техническое обновление: больше выразительных способностей и заметно более легкая сборка игры.",
            stats: [
                { value: "7x", label: "меньше размер сборки" },
                { value: "2", label: "новых поздних юнита" },
                { value: "6+", label: "исправлений способностей и карт" },
            ],
            sections: [
                {
                    title: "Новые юниты и способности",
                    items: [
                        "Добавлены Angel для Жизни и Behemoth для Силы.",
                        "Добавлен Fire Breath для Black Dragon: огненный урон проходит по юнитам за целью, включая союзников.",
                        "Добавлен Lightning Spin для Hydra: она атакует или отвечает всем врагам вокруг себя.",
                        "Добавлен Sniper: Arbalester наносит полный дальний урон независимо от дистанции.",
                        "Добавлен Leather Armor: у Arbalester только 50% брони против дальних атак.",
                        "Добавлен Limited Supply: количество выстрелов Arbalester зависит от размера стека.",
                        "Обновлены иконки Double Punch и Double Shot, чтобы они были в одной дизайн-системе.",
                    ],
                },
                {
                    title: "Карта и полировка геймплея",
                    items: [
                        "Юниты теперь корректно двигаются к центру при сужении карты.",
                        "Если сжимающийся ряд или колонка полностью заняты, юнит там уничтожается.",
                        "Деревья заменяются пустыми клетками, когда карта сужается.",
                        "Удача теперь учитывается как добавка при расчете общей силы способностей.",
                        "Зона полного урона для стрелков видна еще до начала боя.",
                    ],
                },
                {
                    title: "Производительность и стабильность",
                    items: [
                        "Все изображения переведены с PNG на WebP, размер игрового бандла уменьшился в 7 раз.",
                        "FPS и движения юнитов стали плавнее, потому что состояние веб-приложения перезагружается только когда нужно.",
                        "Крупные исправления и улучшения приблизили проект к открытому исходному коду и AI-боям.",
                    ],
                },
            ],
            roster: [],
            closing: "Это обновление сделало игру быстрее, понятнее и ближе к задуманному публичному боевому опыту.",
        },
        {
            version: "v0.1.0",
            date: "11.01.2024",
            commit: "",
            href: "",
            title: "Запуск публичного тестового поля",
            impact: "Первое публичное тестовое поле открыло бой в браузере, чтобы игроки могли попробовать базовый боевой цикл.",
            stats: [
                { value: "4", label: "фракции" },
                { value: "3", label: "роли юнитов" },
                { value: "9", label: "стартовых способностей и заклинаний" },
            ],
            sections: [
                {
                    title: "Состав первого тестового поля",
                    items: [
                        "Создано первое публичное тестовое поле боя, где любой мог попробовать доступные фракции и юниты.",
                        "Добавлены Хаос, Сила, Жизнь и Природа с первыми наборами юнитов.",
                        "Добавлены роли дальнего боя, ближнего боя и магии.",
                        "Реализована ранняя логика способностей: One in the Field, Shadow Touch, Double Punch, Double Shot, Handyman, Endless Quiver и Enchanted Skin.",
                        "Реализована ранняя логика заклинаний: Summon Wolves и Helping Hand.",
                    ],
                },
            ],
            roster: [],
            closing: "Это стало фундаментом браузерной тактической игры, на котором строились следующие релизы.",
        },
    ] satisfies PatchNote[],
};
