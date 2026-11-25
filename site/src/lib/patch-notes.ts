export interface PatchNote {
    version: string;
    date: string;
    commit: string;
    href: string;
    /** Per-repo release commits (e.g. client + common); rendered instead of the single commit link. */
    commits?: Array<{
        label: string;
        commit: string;
        href: string;
    }>;
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
            version: "v0.1.8",
            date: "11/25/2026",
            commit: "f42c7343",
            href: "https://github.com/o1dstaRs/heroes-of-crypto-client/commit/f42c7343",
            commits: [
                {
                    label: "client",
                    commit: "f42c7343",
                    href: "https://github.com/o1dstaRs/heroes-of-crypto-client/commit/f42c7343",
                },
                {
                    label: "common",
                    commit: "b60b2ab6",
                    href: "https://github.com/o1dstaRs/heroes-of-crypto-common/commit/b60b2ab6c9516b1eaa5c8f286522dac4e4f797d4",
                },
            ],
            title: "Army blessings, a sharper AI, and flyers brought down to earth",
            impact: "Five creature auras now bless the whole army, the strongest AI reads your draft and plays against it, a flyer can be forced to walk, and a match downloads about a quarter of the art it used to.",
            stats: [
                { value: "57", label: "creatures" },
                { value: "109", label: "abilities" },
                { value: "60", label: "spells" },
                { value: "28", label: "artifacts" },
            ],
            sections: [
                {
                    title: "Blessings for the whole army",
                    items: [
                        "Five auras that reached allies within 2 cells now bless the whole army while their creature is alive, and only the strongest source of each counts. Crusader's Sharpened Weapons gives every allied melee and magic unit +18% base attack. Leprechaun's Luck gives every ally +2 to +10 luck by stack power, up to 10, while the Leprechaun is not Broken.",
                        "Satyr's Sylvan Focus adds 3% to 15% magic damage to every ally by stack power instead of a flat 15%. Wolf Rider's Wolf Trail gives every ally 0.2 to 1 movement. Champion's Tie up the Horses gives non-flying allies 0.42 to 2.1 movement by stack power, raised by the Champion's luck, instead of a flat 2 to allies nearby.",
                        "Hydra brings Ember Covenant: at the start of the battle every allied stack gets a shared ring of fire. Fire damage passes without breaking it. The first other hit is absorbed, and then every ring dissolves. Water attacks and water magic go straight through and break the rings. A summoned ally joins a ring that is still whole.",
                    ],
                },
                {
                    title: "Flyers, fire, and the rules",
                    items: [
                        "Gravebound, from the Gravechain artifact, and Hamstrung, from the Dryad's Hamstring, now ground a flying unit as well as slowing it by 25% and 30%. Until the debuff ends it cannot fly: it walks around units and obstacles, and the sidebar shows it as a walking unit. Quagmire still only slows.",
                        "Fireball blasts the 3×3 square centred on the cell it strikes, and a thrown fire spell stops at the first target in its path. Fire Wall burns a ground unit that cuts diagonally across its corner. Counter-shots from Cyclops and Gargantuan break the barrels caught in the blast.",
                        "When a Hydra's Lightning Spin hits a unit with Fire Shield, the burn it takes back is shown, with a number, a flame, and a death if it kills. The damage was always applied.",
                        "Rallying Volley no longer goes to units that cannot shoot. Thunderbird's Chain Lightning still arcs after a shield absorbs its blow. A Chakram stops at a unit under Arrows Wingshield. Dead stacks no longer block later arrows. A freely aimed Through Shot into empty ground is a legal shot, and Harpy's Castling reaches one cell past its movement, as the rules say.",
                    ],
                },
                {
                    title: "The same armies, tuned",
                    items: [
                        "Crusader: armor 26, damage 15–20. Arbalester: attack 8. Hydra: 180 health, armor 32, damage 40–60. Abomination: 525 health, armor 47. Cyclops: 75 health, armor 20, damage 19–23. Thunderbird: 140 health.",
                        "Battle Mage: 11 health, armor 8, damage 2–4. Blacksmith: armor 12. Healer: 14 health, armor 13. Mermaid: 12 health. Zena: attack 23. Satyr experience is 26.79, so 1,000 experience buys 38 creatures. Wandering Mage experience is 7.2, so it buys 139.",
                        "Aegis of the Arcane's separate magic-defense roll is 20%. Pendant of Vitality gives +22% health for −11% attack. Quiver of Echoes gives a 35% chance of an extra attack, plus luck.",
                    ],
                },
                {
                    title: "A stronger AI opponent",
                    items: [
                        "The Brutal AI takes each doctrine a third of the time and uses what that doctrine, the bans and the map let it see. Once your army reads melee it drafts counters, it plans its last level-4 pick as one, and it takes Magic Dragon against an Arachna Queen it can see.",
                        "It picks artifacts for the army it has, Crown of Command when it has fewer than two shooters, and never Lava Striders on a map without lava. An army without shooters spends its Sniper point on Movement. Against an army that isn't melee it rushes: Placement 2 and Movement 2, strikers on the front edge, and Valkyries with them.",
                        "In the fight it searches deeper, with each move capped at about 4 seconds. It no longer walks up to an enemy without attacking, ignores one-creature decoy stacks while a real stack is in reach, gives Wild Regeneration only to stronger creatures, and keeps its blessing carriers with the army early on.",
                    ],
                },
                {
                    title: "Draft, ranked, and Premium",
                    items: [
                        "Bans dock in a rail beside the board for Scout and Spymaster, with portraits 50% larger. Spymaster sees the map with the starting bundle choice; the other doctrines still see it at the first level-3 pick.",
                        "The results screen shows each army's doctrine, artifacts, and synergy levels, and after a game against the AI you can choose the doctrine for the next one. The player portal searches your match history by creature, artifact, or opponent.",
                        "A unit no longer loses its turn after a run of stun or blind skips, accepted matches reach the draft reliably, the game moves straight on past poison deaths, and public replays stay available after the session ends. Replays open on a still board and start sooner. A lobby that expires unfilled after 24 hours refunds its opening fee in gold.",
                        'Premium shows a movable draft planner board with the formation, upgrade plan, and stack splits, marks top picks with gold, silver, and bronze medals, and follows the current AI. "What should I do this turn?" returns one legal best turn, and shot advice accounts for barrels.',
                    ],
                },
                {
                    title: "What you see and hear",
                    items: [
                        "Dryad, Valkyrie, White Tiger, Wyvern, Griffin, and Pegasus have new aura art on the floor, and the Arachna Queen's web is rebuilt. About 35 abilities have their own effect art over the unit. Stun and Blindness show orbiting stars, Paralysis is an electric field under the unit, and \"Resist\" pops when an attack's debuff is resisted.",
                        "Damage numbers and effect icons sit in one row over the unit. Units and their portraits keep facing the way they last moved or attacked. Fireball visibly flies, Fireforged Sword leaves a hot slash, Harpy's Castling plays twice as fast, and close-range shots no longer fly backwards.",
                        "14 creatures have movement sounds, and Black Dragon, Behemoth, and Wolf Rider have a loop while their turn waits. Fireball, Fire Strike, Meteor Shower, Craft, misses, summons, splits, and shield breaks have sounds, and about 30 creatures have new attack and hurt recordings. Counterattacks are quiet. Music plays only in the Ranked Arena and in matches, 50% louder.",
                    ],
                },
                {
                    title: "Phones, accounts, and loading",
                    items: [
                        "Phones and tablets play in landscape with a touch top bar and action bar. In portrait the game turns itself, and a combat action is confirmed in a bubble where you tapped.",
                        "Crypto-wallet sign-in is gone: sign in with email and password or with Google. Season prizes go to verified email accounts that finished calibration.",
                        "A match downloads about 77 MB of art instead of 301 MB, creature textures take about half the memory, and a ranked match loads 2.1 MB of JavaScript instead of 5.2 MB for players without Premium. The loading bar finishes and fades into a ready board.",
                    ],
                },
                {
                    title: "The site",
                    items: [
                        "The top bar is Players, Seasons, Premium, News, and Knowledge Base, and the logo takes you to the game. Players is the former Top page. The homepage has a tavern hero with one Play Now button and a game modes section, and link previews use new art.",
                        "The rules page walks through your first match in six steps. The Knowledge Base adds battlefield footprints, Ember Covenant, and the new blessings. The Premium page has a crew planner: pick six units against an enemy crew for artifacts, synergies, a formation, and recorded battle history.",
                    ],
                },
            ],
            roster: [],
            closing:
                "Version 0.1.8 keeps the same four factions and 57 creatures, turns five auras into army blessings, and makes the strongest AI draft, set up, and fight against what you bring.",
        },
        {
            version: "v0.1.7",
            date: "10/20/2026",
            commit: "fcabde35",
            href: "https://github.com/o1dstaRs/heroes-of-crypto-client/commit/fcabde357cb811e175b10cd3b405b9f4df665cf0",
            commits: [
                {
                    label: "client",
                    commit: "fcabde35",
                    href: "https://github.com/o1dstaRs/heroes-of-crypto-client/commit/fcabde357cb811e175b10cd3b405b9f4df665cf0",
                },
                {
                    label: "common",
                    commit: "e9568286",
                    href: "https://github.com/o1dstaRs/heroes-of-crypto-common/commit/e95682869bcce881195a0a1d31208fe89189170c",
                },
            ],
            title: "Live aim, four artifacts, and a clearer board",
            impact: "You can see where the other player is aiming, new artifacts change how a fight ends, and the same board is easier to read on a smaller screen.",
            stats: [
                { value: "57", label: "creatures" },
                { value: "109", label: "abilities" },
                { value: "54", label: "spells" },
                { value: "28", label: "artifacts" },
            ],
            sections: [
                {
                    title: "A fight you can read",
                    items: [
                        "The other player's aim shows on your board: a move, a shot, a spell, and the direction of a Through Shot. Moving the pointer off the board clears the aimed cell, and an armed spell stays selected. A shot taken after a move is drawn from the landing footprint, not from the cell the shooter left.",
                        "A Cyclops shot that destroys more than one stack plays the burst for each stack it finishes. Area Throw and other area shots land on the first cell of a large body they touch, and an area counterattack records every victim.",
                        "An intact Water Shield still absorbs a non-fire hit. Fire spells, Fire Breath, Fire Shield, and a Fireforged burn pass through it. Helping Hand stays tied to the living stacks it binds.",
                        "Sidebars stay wide enough to read, at least 256 pixels when the screen can spare them. Ranked and premium controls wrap onto another line instead of shrinking away. While you choose augments, you can see the artifacts the other player drafted.",
                        "Splitting a stack copies its whole spellbook and quiver onto the new stack, including a one-creature split and a single-charge spell such as Resurrection. The original keeps its own casts and arrows. Merging keeps the larger remaining count of each spell and does not add the books or quivers together.",
                    ],
                },
                {
                    title: "Artifacts",
                    items: [
                        "Quiver of Echoes gives a ranged unit a 40% chance of one extra attack. Gravechain is cursed: an attack has a 50% chance per enemy to bind Gravebound along up to 3 links, slowing those units by 25% for 3 laps, and every unit in your army loses 1 movement step.",
                        "Aegis of the Arcane gives the whole army a separate 18% magic-defense roll, combined with the defense the unit already has. Last Fuse makes an enemy stack your army destroys explode into other enemies beside it, for 25% of the killing blow or 25 damage per point of the attacker's stack power, whichever is higher. Your own units are not hurt. Resurrection cancels the burst, and a Water Shield can absorb one.",
                        "Farsight Quiver lets allied archers ignore range falloff and deal full damage. A shot through Smoke is still halved. Tome of Amplification is a tier 1 artifact and raises non-healing buffs you cast on allies by 35%. Rime Charm is tier 1: a 30% chance, plus the attacker's luck, to slow the target for 3 laps.",
                    ],
                },
                {
                    title: "The same armies, tuned",
                    items: [
                        "Arachna Spider is attack 31 and damage 55–70. Arachna Queen keeps attack 32 and damage 54–78, with armor 40 and 200 health.",
                        "Cyclops is attack 22, damage 18–23, 72 health, and armor 19. Dryad experience is 11. Wandering Mage experience is 6.466, so 1,000 experience buys 155 creatures. Scavenger stays at 6.1.",
                    ],
                },
            ],
            roster: [],
            closing:
                "Version 0.1.7 keeps the same four factions and 57 creatures, and makes the aim, the artifacts, and the numbers on the board the ones the fight uses.",
        },
        {
            version: "v0.1.6",
            date: "10/04/2026",
            commit: "74ee648a",
            href: "https://github.com/o1dstaRs/heroes-of-crypto-client/commit/74ee648a73cb2fc241e19bbc939e4ef01bd31713",
            commits: [
                {
                    label: "client",
                    commit: "74ee648a",
                    href: "https://github.com/o1dstaRs/heroes-of-crypto-client/commit/74ee648a73cb2fc241e19bbc939e4ef01bd31713",
                },
                {
                    label: "common",
                    commit: "5b09bbd",
                    href: "https://github.com/o1dstaRs/heroes-of-crypto-common/commit/5b09bbd7269a73ed2e6e47498db1ed258220ad79",
                },
            ],
            title: "Barrels, blessings, and a ranked season on the record",
            impact: "The board is more physical, ranked play keeps a public account of leaving, reputation, and prizes, and the site answers questions about the game you are actually playing.",
            stats: [
                { value: "57", label: "creatures" },
                { value: "109", label: "abilities" },
                { value: "52", label: "spells" },
                { value: "24", label: "artifacts" },
            ],
            sections: [
                {
                    title: "A more physical board",
                    items: [
                        "Cemetery battles roll 9 to 12 barrels from the match itself, so both players and the server see the same obstacles. Barrel Barricade, a Tier 1 artifact, places two more barrels with the army that drafted it.",
                        "Skewer Strike, Fire Breath, Area Throw, Lightning Spin, and the Cyclops's Large Caliber shot strike barrels as well as units. Splash and lines still reach the units behind the barrel they hit.",
                        "Fire Wall is aimed as a line of four cells and burns a unit that crosses it, including every cell a large body enters. A flyer pays for the cells where it lands.",
                        "The Ash Moth is now the Wandering Mage and carries one bursting Fireball. Blindness blinds the enemy a Unicorn strikes. Castling swaps two units of the same footprint, up to one cell beyond the caster's movement.",
                        "Arcane Ward, Warding Mane, Arrows Wingshield, and Angelic Host are blessings on the whole army, and they last while the creature that grants them is alive. Offensive spell damage is the number of living creatures in the stack times the spell's power. Abomination no longer brings Stun Aura.",
                    ],
                },
                {
                    title: "Ranked, on the record",
                    items: [
                        "Leaving a ranked match has public rules. An early exit is stored with the casualties it resolved at, and the same rules are on the site and in the client.",
                        "Reputation, player reports, lock notices, and appeals are part of ranked play. Season prize rules say how a prize is claimed, and every finished season has a results page.",
                        "Profiles show doctrine, league, gold, and a fuller match history. Gold and prediction wording follows the glossary: you see total gold, and a wager spends gold that is available.",
                    ],
                },
                {
                    title: "Your screen and a shared sandbox",
                    items: [
                        "Choose which side of the battlefield your army sits on. The mirror is only on your screen; replays, spectators, and the other player keep the true sides. Your army can wear a colour you pick.",
                        "Combat plays creature sounds for the fight.",
                        "Invite a friend into a co-op sandbox, ready up, and fight the same board. A friend's live game can be spectated, a connection badge shows a drop, and a banner brings you back to a match you left.",
                    ],
                },
                {
                    title: "The site",
                    items: [
                        "The Knowledge Base was checked against the engine: abilities, spells, artifacts, counters, and which armies an artifact is best with. The Russian edition covers the same entries.",
                        "Ask the AI in English or Russian and the answer comes back in the language of the question.",
                        "In the player portal, hovering a unit, artifact, augment, synergy, or doctrine opens its card, and the header buttons take clicks again.",
                    ],
                },
            ],
            roster: [],
            closing:
                "Version 0.1.6 keeps the same four factions and 57 creatures, and makes the fights, the season, and the public rules agree with each other.",
        },
        {
            version: "v0.1.5",
            date: "08/16/2026",
            commit: "2c4952f6",
            href: "https://github.com/o1dstaRs/heroes-of-crypto-client/commit/2c4952f6bff904e820a9c5bad5a649870554a923",
            commits: [
                {
                    label: "client",
                    commit: "2c4952f6",
                    href: "https://github.com/o1dstaRs/heroes-of-crypto-client/commit/2c4952f6bff904e820a9c5bad5a649870554a923",
                },
                {
                    label: "common",
                    commit: "68b879b",
                    href: "https://github.com/o1dstaRs/heroes-of-crypto-common/commit/68b879bc779904e8d469be053ef28b129af74167",
                },
            ],
            title: "A new engine, ranked play, and an expanded battlefield",
            impact: "The largest Heroes of Crypto update yet: the battle client now runs on PixiJS, online ranked play is live, and every army has more ways to fight and progress.",
            stats: [
                { value: "57", label: "creatures" },
                { value: "110", label: "abilities" },
                { value: "49", label: "spells" },
                { value: "24", label: "artifacts" },
            ],
            sections: [
                {
                    title: "A rebuilt battle client",
                    items: [
                        "Combat presentation has moved to PixiJS, with smoother rendering, clearer targeting and effects, a redesigned HUD, and more faithful replays.",
                        "Ranked battles are now resolved authoritatively by the game server, with reconnect support and consistent recovery of the live match state.",
                        "New battlefields add obstacles, destructible terrain, elemental interactions, and Armageddon as fights run long.",
                    ],
                },
                {
                    title: "More ways to build an army",
                    items: [
                        "Seventeen creatures joined the four factions, including Blacksmith, Dryad, Arachna Queen, Abomination, Mermaid, and Frenzied Boar.",
                        "The catalog now contains 110 abilities and 49 spells, adding elemental attacks and defenses, crafting and runes, poison, vines, summons, fire terrain, new auras, and control effects.",
                        "Twenty-four Tier 1 and Tier 2 artifacts, including cursed tradeoffs, join doctrines, team augments, and faction synergies as meaningful pre-battle choices.",
                    ],
                },
                {
                    title: "Ranked, AI, and progression",
                    items: [
                        "Online ranked play now covers matchmaking, pick and ban, hidden army setup, placement, combat, reconnection, spectating, and replay.",
                        "Practice vs AI uses a new self-play-trained opponent with stronger drafting, placement, spell use, and combat decisions.",
                        "Calibration, leagues, promotions, seasonal gold, predictions, and optional gold wagers give every match a wider competitive context.",
                    ],
                },
                {
                    title: "Profiles and presentation",
                    items: [
                        "Player profiles now bring together rank, match history, replays, fight statistics, gold activity, and prediction records; friends and chat are available through the social dock.",
                        "The arena, draft, setup, combat interface, portal, and Knowledge Base were redesigned for clearer decisions across desktop and mobile.",
                        "This release also includes extensive combat-correctness fixes, balance work, localization, accessibility improvements, and visual polish.",
                    ],
                },
            ],
            roster: [],
            closing:
                "Version 0.1.5 turns the original combat testbed into a complete competitive loop, with a larger sandbox for every kind of player.",
        },
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
            version: "v0.1.8",
            date: "25.11.2026",
            commit: "f42c7343",
            href: "https://github.com/o1dstaRs/heroes-of-crypto-client/commit/f42c7343",
            commits: [
                {
                    label: "клиент",
                    commit: "f42c7343",
                    href: "https://github.com/o1dstaRs/heroes-of-crypto-client/commit/f42c7343",
                },
                {
                    label: "common",
                    commit: "b60b2ab6",
                    href: "https://github.com/o1dstaRs/heroes-of-crypto-common/commit/b60b2ab6c9516b1eaa5c8f286522dac4e4f797d4",
                },
            ],
            title: "Благословения для всей армии, более сильный ИИ и летающие на земле",
            impact: "Пять аур существ теперь благословляют всю армию, сильнейший ИИ читает ваш драфт и играет против него, летающего можно заставить ходить пешком, а матч скачивает примерно четверть прежнего объёма графики.",
            stats: [
                { value: "57", label: "существ" },
                { value: "109", label: "способностей" },
                { value: "60", label: "заклинаний" },
                { value: "28", label: "артефактов" },
            ],
            sections: [
                {
                    title: "Благословения для всей армии",
                    items: [
                        "Пять аур, которые действовали на союзников в радиусе 2 клеток, теперь благословляют всю армию, пока жив их владелец, и из одинаковых благословений действует только самое сильное. Sharpened Weapons у Crusader дает каждому союзнику ближнего боя и магу +18% к базовой атаке. Luck у Leprechaun дает каждому союзнику от +2 до +10 удачи по силе стека, не больше 10, пока на Leprechaun нет Break.",
                        "Sylvan Focus у Satyr добавляет каждому союзнику от 3% до 15% магического урона по силе стека вместо постоянных 15%. Wolf Trail у Wolf Rider дает каждому союзнику от 0.2 до 1 движения. Tie up the Horses у Champion дает нелетающим союзникам от 0.42 до 2.1 движения по силе стека с поправкой на удачу Champion вместо постоянных 2 для союзников рядом.",
                        "Hydra приносит Ember Covenant: в начале боя каждый союзный стек получает общее огненное кольцо. Огненный урон проходит, не разрушая его. Первый другой удар поглощается, после чего все кольца исчезают. Водные атаки и магия воды проходят насквозь и разрушают кольца. Призванный союзник присоединяется к кольцу, пока оно цело.",
                    ],
                },
                {
                    title: "Летающие, огонь и правила",
                    items: [
                        "Gravebound от артефакта Gravechain и Hamstrung от Hamstring у Dryad теперь не только замедляют летающего на 25% и 30%, но и прижимают его к земле. Пока дебафф действует, он не может летать: он ходит, обходя юнитов и препятствия, а боковая панель показывает его как пешего. Quagmire по-прежнему только замедляет.",
                        "Fireball бьет по квадрату 3×3 с центром в клетке попадания, а брошенное огненное заклинание останавливается на первой цели на пути. Fire Wall обжигает наземного юнита, который срезает ее угол по диагонали. Ответные выстрелы Cyclops и Gargantuan разбивают бочки, попавшие под взрыв.",
                        "Когда Lightning Spin у Hydra задевает юнита с Fire Shield, ответный ожог теперь виден: число, пламя и смерть, если он убивает. Урон наносился и раньше.",
                        "Rallying Volley больше не достается юнитам, которые не могут стрелять. Chain Lightning у Thunderbird бьет по цепочке, даже если щит поглотил удар. Chakram останавливается на юните под Arrows Wingshield. Мертвые стеки больше не задерживают следующие стрелы. Свободно нацеленный Through Shot в пустую землю считается допустимым выстрелом, а Castling у Harpy достает на клетку дальше ее движения, как сказано в правилах.",
                    ],
                },
                {
                    title: "Те же армии, другие числа",
                    items: [
                        "Crusader: броня 26, урон 15–20. Arbalester: атака 8. Hydra: 180 здоровья, броня 32, урон 40–60. Abomination: 525 здоровья, броня 47. Cyclops: 75 здоровья, броня 20, урон 19–23. Thunderbird: 140 здоровья.",
                        "Battle Mage: 11 здоровья, броня 8, урон 2–4. Blacksmith: броня 12. Healer: 14 здоровья, броня 13. Mermaid: 12 здоровья. Zena: атака 23. Опыт Satyr равен 26.79, поэтому 1000 опыта дают 38 существ. Опыт Wandering Mage равен 7.2, и он дает 139.",
                        "Отдельный бросок магической защиты Aegis of the Arcane равен 20%. Pendant of Vitality дает +22% здоровья за −11% атаки. Quiver of Echoes дает 35% шанс на дополнительную атаку плюс удача.",
                    ],
                },
                {
                    title: "Более сильный ИИ",
                    items: [
                        "ИИ уровня Brutal выбирает каждую доктрину в трети игр и использует все, что ему позволяют увидеть доктрина, баны и карта. Когда ваша армия выглядит армией ближнего боя, он набирает контрпики, планирует последний выбор 4-го уровня как контрпик и берет Magic Dragon против Arachna Queen, которую видит.",
                        "Он выбирает артефакты под свою армию: Crown of Command, если у него меньше двух стрелков, и никогда Lava Striders на карте без лавы. Армия без стрелков тратит очко Sniper на Movement. Против армии не ближнего боя он идет в атаку: Placement 2 и Movement 2, бойцы на переднем краю, Valkyrie вместе с ними.",
                        "В бою он считает глубже, и каждый ход занимает не больше примерно 4 секунд. Он больше не подходит к врагу без атаки, не отвлекается на стеки-приманки из одного существа, пока рядом есть настоящий стек, отдает Wild Regeneration только более сильным существам и в начале боя держит носителей благословений рядом с армией.",
                    ],
                },
                {
                    title: "Драфт, рейтинг и Premium",
                    items: [
                        "Для доктрин Разведчик и Мастер шпионажа баны стоят в колонке рядом с полем, а портреты на 50% крупнее. Мастер шпионажа видит карту уже при выборе стартового набора; остальные доктрины по-прежнему видят ее при первом выборе 3-го уровня.",
                        "Экран результатов показывает доктрину, артефакты и уровни синергий каждой армии, а после игры против ИИ можно выбрать доктрину на следующую. В кабинете игрока история матчей ищется по существу, артефакту или сопернику.",
                        "Юнит больше не теряет ход после серии пропусков из-за оглушения или ослепления, принятые матчи надежно доходят до драфта, игра сразу идет дальше после смертей от яда, а публичные повторы остаются доступны после конца сессии. Повторы открываются на неподвижном поле и начинаются быстрее. Лобби, которое не заполнилось за 24 часа, возвращает плату за открытие золотом.",
                        "Premium показывает подвижную доску планирования драфта с расстановкой, планом апгрейдов и разделением стеков, отмечает лучшие выборы золотой, серебряной и бронзовой медалью и следует нынешнему ИИ. «Что мне делать в этот ход?» возвращает один допустимый лучший ход, а советы по выстрелам учитывают бочки.",
                    ],
                },
                {
                    title: "Что видно и слышно",
                    items: [
                        "У Dryad, Valkyrie, White Tiger, Wyvern, Griffin и Pegasus новые ауры на земле, а паутина Arachna Queen сделана заново. Около 35 способностей получили собственную картинку эффекта над юнитом. Stun и Blindness показывают кружащиеся звезды, Paralysis — электрическое поле под юнитом, а если дебафф атаки отражен, всплывает «Resist».",
                        "Числа урона и значки эффектов стоят в один ряд над юнитом. Юниты и их портреты смотрят туда, куда последний раз шли или били. Fireball теперь видно в полете, Fireforged Sword оставляет раскаленный след, Castling у Harpy играет вдвое быстрее, а выстрелы с близкой дистанции больше не летят назад.",
                        "У 14 существ появились звуки движения, а у Black Dragon, Behemoth и Wolf Rider — звук ожидания, пока их ход ждет. Свои звуки получили Fireball, Fire Strike, Meteor Shower, Craft, промахи, призывы, разделение стека и разрушение щитов, а около 30 существ получили новые звуки атаки и ранения. Ответные удары звучат тихо. Музыка играет только на Рейтинговой арене и в матчах и стала на 50% громче.",
                    ],
                },
                {
                    title: "Телефоны, аккаунты и загрузка",
                    items: [
                        "На телефонах и планшетах игра идет в альбомной ориентации с сенсорной верхней панелью и панелью действий. В портретной ориентации игра сама поворачивается, а действие в бою подтверждается в пузыре там, где вы коснулись.",
                        "Вход через криптокошелек убран: входите по почте и паролю или через Google. Призы сезона получают подтвержденные почтовые аккаунты, прошедшие калибровку.",
                        "Матч скачивает около 77 МБ графики вместо 301 МБ, текстуры существ занимают примерно вдвое меньше памяти, а рейтинговый матч без Premium загружает 2.1 МБ JavaScript вместо 5.2 МБ. Полоса загрузки доходит до конца и плавно открывает готовое поле.",
                    ],
                },
                {
                    title: "Сайт",
                    items: [
                        "В верхней панели теперь Игроки, Сезоны, Premium, Новости и База знаний, а логотип ведет в игру. Игроки — это бывшая страница Top. На главной — таверна с одной кнопкой «Играть» и раздел режимов игры, а превью ссылок используют новую картинку.",
                        "Страница правил ведет через первый матч за шесть шагов. В Базе знаний появились размеры юнитов на поле, Ember Covenant и новые благословения. На странице Premium есть планировщик отряда: выберите шесть юнитов против отряда врага и получите артефакты, синергии, расстановку и записанную историю боев.",
                    ],
                },
            ],
            roster: [],
            closing:
                "Версия 0.1.8 сохраняет те же четыре фракции и 57 существ, превращает пять аур в благословения армии и заставляет сильнейший ИИ набирать армию, расставляться и сражаться против того, что принесли вы.",
        },
        {
            version: "v0.1.7",
            date: "20.10.2026",
            commit: "fcabde35",
            href: "https://github.com/o1dstaRs/heroes-of-crypto-client/commit/fcabde357cb811e175b10cd3b405b9f4df665cf0",
            commits: [
                {
                    label: "клиент",
                    commit: "fcabde35",
                    href: "https://github.com/o1dstaRs/heroes-of-crypto-client/commit/fcabde357cb811e175b10cd3b405b9f4df665cf0",
                },
                {
                    label: "common",
                    commit: "e9568286",
                    href: "https://github.com/o1dstaRs/heroes-of-crypto-common/commit/e95682869bcce881195a0a1d31208fe89189170c",
                },
            ],
            title: "Живой прицел, четыре артефакта и более ясное поле",
            impact: "Видно, куда целится другой игрок, новые артефакты меняют то, чем заканчивается бой, а то же поле легче читать на меньшем экране.",
            stats: [
                { value: "57", label: "существ" },
                { value: "109", label: "способностей" },
                { value: "54", label: "заклинания" },
                { value: "28", label: "артефактов" },
            ],
            sections: [
                {
                    title: "Бой, который можно прочитать",
                    items: [
                        "Прицел другого игрока виден на вашем поле: ход, выстрел, заклинание и направление Through Shot. Увод указателя с поля снимает клетку прицела, а уже выбранное заклинание остается выбранным. Выстрел после хода рисуется от клетки, куда встает стрелок, а не от той, которую он покинул.",
                        "Выстрел Cyclops, уничтожающий больше одного стека, показывает взрыв для каждого добитого стека. Area Throw и другие площадные выстрелы попадают в первую клетку крупного тела, которой коснулись, а площадная контратака записывает каждую жертву.",
                        "Целый Water Shield по-прежнему поглощает не огненный удар. Огненные заклинания, Fire Breath, Fire Shield и ожог Fireforged проходят сквозь него. Helping Hand остается связан с живыми стеками, которые он соединяет.",
                        "Боковые панели остаются достаточно широкими, не меньше 256 пикселей, когда экран может это позволить. Кнопки рейтинга и Premium переносятся на следующую строку, а не сжимаются. Пока вы выбираете апгрейды, видны артефакты, которые выбрал другой игрок.",
                        "Разделение стека копирует всю книгу заклинаний и колчан в новый стек, в том числе когда в нём одно существо и когда заклинание имеет единственный заряд, например Resurrection. У исходного стека остаются свои заряды и стрелы. Объединение сохраняет большее оставшееся число каждого заклинания и не складывает книги и колчаны.",
                    ],
                },
                {
                    title: "Артефакты",
                    items: [
                        "Quiver of Echoes дает стрелку 40% шанс на одну дополнительную атаку. Gravechain проклят: атака с вероятностью 50% на каждого врага накладывает Gravebound по цепочке до 3 звеньев, замедляя их на 25% на 3 хода, а каждое существо вашей армии теряет 1 шаг движения.",
                        "Aegis of the Arcane дает всей армии отдельный бросок магической защиты 18%, который складывается с защитой, которая у существа уже есть. Last Fuse взрывает вражеский стек, уничтоженный вашей армией, и бьет других врагов рядом: 25% добивающего удара или 25 урона за единицу силы стека атакующего, что больше. Свои существа не страдают. Воскрешение отменяет взрыв, а Water Shield может поглотить один.",
                        "Farsight Quiver позволяет союзным стрелкам игнорировать спад урона с дистанцией и бить полным уроном. Выстрел сквозь Smoke по-прежнему делит урон пополам. Tome of Amplification теперь артефакт 1-го уровня и усиливает нелечащие баффы по союзникам на 35%. Rime Charm тоже 1-го уровня: 30% плюс удача атакующего, чтобы замедлить цель на 3 хода.",
                    ],
                },
                {
                    title: "Те же армии, другие числа",
                    items: [
                        "Arachna Spider: атака 31, урон 55–70. Arachna Queen сохраняет атаку 32 и урон 54–78, при броне 40 и 200 здоровья.",
                        "Cyclops: атака 22, урон 18–23, 72 здоровья и броня 19. Опыт Dryad равен 11. Опыт Wandering Mage равен 6.466, поэтому 1000 опыта дают 155 существ. У Scavenger по-прежнему 6.1.",
                    ],
                },
            ],
            roster: [],
            closing:
                "Версия 0.1.7 сохраняет те же четыре фракции и 57 существ и приводит прицел, артефакты и числа на поле к тем, которыми идет бой.",
        },
        {
            version: "v0.1.6",
            date: "04.10.2026",
            commit: "74ee648a",
            href: "https://github.com/o1dstaRs/heroes-of-crypto-client/commit/74ee648a73cb2fc241e19bbc939e4ef01bd31713",
            commits: [
                {
                    label: "клиент",
                    commit: "74ee648a",
                    href: "https://github.com/o1dstaRs/heroes-of-crypto-client/commit/74ee648a73cb2fc241e19bbc939e4ef01bd31713",
                },
                {
                    label: "common",
                    commit: "5b09bbd",
                    href: "https://github.com/o1dstaRs/heroes-of-crypto-common/commit/5b09bbd7269a73ed2e6e47498db1ed258220ad79",
                },
            ],
            title: "Бочки, благословения и рейтинговый сезон, который можно прочитать",
            impact: "Поле боя стало предметнее, рейтинговый режим публично фиксирует выход из матча, репутацию и призы, а сайт отвечает на вопросы про ту игру, в которую вы действительно играете.",
            stats: [
                { value: "57", label: "существ" },
                { value: "109", label: "способностей" },
                { value: "52", label: "заклинания" },
                { value: "24", label: "артефакта" },
            ],
            sections: [
                {
                    title: "Более предметное поле боя",
                    items: [
                        "На кладбище число бочек от 9 до 12 определяется самим матчем, поэтому оба игрока и сервер видят одни и те же препятствия. Артефакт 1-го уровня Barrel Barricade ставит еще две бочки армии, которая его выбрала.",
                        "Skewer Strike, Fire Breath, Area Throw, Lightning Spin и выстрел Large Caliber у Cyclops бьют и по бочкам, и по существам. Область и линия все равно достают существ за бочкой, в которую попали.",
                        "Fire Wall ставится линией из четырех клеток и обжигает того, кто ее пересекает, включая каждую клетку, куда входит крупное тело. Летун платит за клетки, на которые приземляется.",
                        "Ash Moth теперь Wandering Mage и несет один разрывной Fireball. Blindness ослепляет врага, по которому ударил Unicorn. Castling меняет местами двух существ одного размера, вплоть до клетки за пределом хода заклинателя.",
                        "Arcane Ward, Warding Mane, Arrows Wingshield и Angelic Host — благословения на всю армию, и они держатся, пока жив тот, кто их дает. Урон атакующих заклинаний равен числу живых существ в отряде, умноженному на силу заклинания. У Abomination больше нет Stun Aura.",
                    ],
                },
                {
                    title: "Рейтинг, который можно проверить",
                    items: [
                        "У выхода из рейтингового матча есть публичные правила. Досрочный выход сохраняется вместе с потерями, которые он зафиксировал, и те же правила есть на сайте и в клиенте.",
                        "Репутация, жалобы игроков, уведомления о блокировке и апелляции стали частью рейтинговой игры. Правила сезонных призов говорят, как приз получить, а у каждого завершенного сезона есть страница результатов.",
                        "Профили показывают доктрину, лигу, золото и более полную историю матчей. Формулировки золота и прогнозов следуют глоссарию: видно все золото, а ставка тратит доступное.",
                    ],
                },
                {
                    title: "Ваш экран и общая песочница",
                    items: [
                        "Можно выбрать, с какой стороны поля стоит ваша армия. Зеркало только на вашем экране; повторы, зрители и другой игрок видят настоящие стороны. Армии можно задать свой цвет.",
                        "В бою звучат голоса существ.",
                        "Друга можно пригласить в совместную песочницу, подтвердить готовность и сразиться на одном поле. Живой матч друга можно смотреть, значок связи показывает обрыв, а плашка возвращает в покинутый матч.",
                    ],
                },
                {
                    title: "Сайт",
                    items: [
                        "База знаний сверена с движком: способности, заклинания, артефакты, контрпики и то, каким армиям артефакт подходит лучше всего. Русское издание покрывает те же записи.",
                        "Вопрос ИИ можно задать по-английски или по-русски, и ответ приходит на языке вопроса.",
                        "В портале игрока наведение на существо, артефакт, апгрейд, синергию или доктрину открывает карточку, а кнопки шапки снова принимают нажатия.",
                    ],
                },
            ],
            roster: [],
            closing:
                "Версия 0.1.6 сохраняет те же четыре фракции и 57 существ и приводит бои, сезон и публичные правила к одному виду.",
        },
        {
            version: "v0.1.5",
            date: "16.08.2026",
            commit: "2c4952f6",
            href: "https://github.com/o1dstaRs/heroes-of-crypto-client/commit/2c4952f6bff904e820a9c5bad5a649870554a923",
            commits: [
                {
                    label: "клиент",
                    commit: "2c4952f6",
                    href: "https://github.com/o1dstaRs/heroes-of-crypto-client/commit/2c4952f6bff904e820a9c5bad5a649870554a923",
                },
                {
                    label: "common",
                    commit: "68b879b",
                    href: "https://github.com/o1dstaRs/heroes-of-crypto-common/commit/68b879bc779904e8d469be053ef28b129af74167",
                },
            ],
            title: "Новый движок, рейтинговый режим и расширенное поле боя",
            impact: "Крупнейшее обновление Heroes of Crypto: боевой клиент перешел на PixiJS, открылся рейтинговый режим, а у каждой армии стало больше вариантов для боя и развития.",
            stats: [
                { value: "57", label: "существ" },
                { value: "110", label: "способностей" },
                { value: "49", label: "заклинаний" },
                { value: "24", label: "артефакта" },
            ],
            sections: [
                {
                    title: "Перестроенный боевой клиент",
                    items: [
                        "Визуальная часть боя перешла на PixiJS: рендер стал плавнее, цели и эффекты понятнее, интерфейс обновился, а повторы точнее воспроизводят матч.",
                        "Результат рейтинговых боев теперь рассчитывает игровой сервер; добавлены переподключение и надежное восстановление текущего состояния матча.",
                        "Новые поля боя добавляют препятствия, разрушаемый ландшафт, взаимодействия стихий и Армагеддон для затянувшихся сражений.",
                    ],
                },
                {
                    title: "Больше вариантов для армии",
                    items: [
                        "К четырем фракциям присоединились 17 существ, включая Blacksmith, Dryad, Arachna Queen, Abomination, Mermaid и Frenzied Boar.",
                        "Теперь в игре 110 способностей и 49 заклинаний: атаки и защита стихий, крафт и руны, яд, лозы, призывы, огненный ландшафт, новые ауры и эффекты контроля.",
                        "Двадцать четыре артефакта 1-го и 2-го уровней, включая проклятые варианты, дополняют перки, командные апгрейды и фракционные синергии перед боем.",
                    ],
                },
                {
                    title: "Рейтинг, AI и прогресс",
                    items: [
                        "Рейтинговый режим охватывает поиск соперника, пики и баны, скрытую сборку армии, расстановку, бой, переподключение, просмотр матчей и повторы.",
                        "В тренировке против AI появился новый соперник, обученный в автоматических матчах и лучше принимающий решения в драфте, расстановке, магии и бою.",
                        "Калибровка, лиги, повышения, сезонное золото, прогнозы и опциональные ставки добавляют матчам более широкий соревновательный контекст.",
                    ],
                },
                {
                    title: "Профили и оформление",
                    items: [
                        "Профили игроков теперь объединяют рейтинг, историю матчей, повторы, статистику боя, операции с золотом и прогнозы; друзья и чат доступны через социальную панель.",
                        "Арена, драфт, расстановка, боевой интерфейс, портал и База знаний переработаны для более понятных решений на компьютерах и мобильных устройствах.",
                        "Релиз также включает множество исправлений боевой логики, баланс, локализацию, улучшения доступности и визуальную полировку.",
                    ],
                },
            ],
            roster: [],
            closing:
                "Версия 0.1.5 превращает первоначальный боевой полигон в цельный соревновательный цикл с более разнообразной игрой для каждого игрока.",
        },
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
