import { mkdirSync, copyFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { SUPPORTED_LANGUAGES } from "../../core/src/i18n/i18n";
import {
    BATTLEFIELD_ARTWORK,
    BATTLEFIELD_HORIZONTAL_BIAS,
    BATTLEFIELD_HORIZONTAL_OVERSCAN,
} from "../../core/src/pixi/battlefieldArtwork";
import { FINAL_STATIC_BATTLEFIELD_TEXTURES } from "../../core/src/pixi/battlefieldTextureKeys";
import { BATTLEFIELD_HEIGHT_RATIO } from "../../core/src/pixi/boardFit";
import { LOADING_EXIT_FADE_MS, minimumLoadingScreenDurationMs } from "../../core/src/pixi/loadingProgress";
import { normalizeLoadingScreenFireTuning } from "../../core/src/scenes/loadingScreenFireTuning";
import { DEFAULT_MOVEMENT_AREA_TUNING } from "../../core/src/scenes/movementAreaTuning";
import { BATTLEFIELD_GRID_ROWS } from "../../core/src/scenes/sandbox/BattlefieldVisualGrid";
import { AMBIENT_FIRE_DEFINITIONS } from "../../core/src/scenes/sandbox/ambientFireTuning";
import { SPELL_BOOK_FURNITURE, spellIconTextureKey } from "../../core/src/scenes/spellIcons";
import { ARMY_COLOR_PRESETS } from "../../core/src/settings/playerArmyColor";
import { SYNERGY_KEY_TO_IMAGE } from "../../core/src/ui/LeftSideBar/SynergiesConstants";
import { RU_TRANSLATIONS } from "../../core/src/i18n/ru";
import { synergyEffectAtLevel } from "../../core/src/ui/LeftSideBar/synergyLadder";
import spellSounds from "../../core/src/ui/audio/spellSoundManifest.json";
import { battlePortraitFacingScale } from "../../core/src/ui/battlePortraitFacing";
import { resolveCreaturePortraitVisual } from "../../core/src/ui/creaturePortraitVisual";
import { getPickPreviewOrder } from "../../core/src/ui/pickPreviewOrder";
import { UNIT_ID_TO_NAME } from "../../core/src/ui/unit_ui_constants";
import { abilityToTextureName } from "../../heroes-of-crypto-common/src/abilities/ability_helper";
import {
    TIER1_ARTIFACT_LIST,
    TIER2_ARTIFACT_LIST,
} from "../../heroes-of-crypto-common/src/artifacts/artifact_properties";
import effects from "../../heroes-of-crypto-common/src/configuration/effects.json";
import spells from "../../heroes-of-crypto-common/src/configuration/spells.json";
import {
    MAX_TIME_TO_MAKE_TURN_MILLIS,
    MIN_TIME_TO_MAKE_TURN_MILLIS,
    TOTAL_TIME_TO_MAKE_TURN_MILLIS,
} from "../../heroes-of-crypto-common/src/constants";
import { ToFactionName } from "../../heroes-of-crypto-common/src/factions/faction_type";
import { FightProperties } from "../../heroes-of-crypto-common/src/fights/fight_properties";
import { PBTypes } from "../../heroes-of-crypto-common/src/generated/protobuf/v1/types";
import { Grid } from "../../heroes-of-crypto-common/src/grid/grid";
import {
    getFootprintCellsForAnchor,
    getPositionForFootprintAnchor,
} from "../../heroes-of-crypto-common/src/grid/grid_math";
import { scatteredMountainsForSeed } from "../../heroes-of-crypto-common/src/grid/scattered_mountains";
import {
    amountForCreatureExperienceBudget,
    createCombatFactories,
    createUnitFromSpec,
    deterministicSimulationId,
    makeRng,
    STACK_EXPERIENCE_BUDGET,
} from "../../heroes-of-crypto-common/src/simulation/army";
import { simulationGridSettings } from "../../heroes-of-crypto-common/src/simulation/battle_engine";
import { allCreatureIds, getFactionOf, getLevelOf } from "../../heroes-of-crypto-common/src/units/unit_properties";
import { UnitsHolder } from "../../heroes-of-crypto-common/src/units/units_holder";
import { setDeterministicRandomSource } from "../../heroes-of-crypto-common/src/utils/lib";
import { exportBattleState } from "../../heroes-of-crypto-common/zig/parity/state_export";

import { bundleAnimations } from "./bundle-animations";
import { bundleInspection, inspectionSpellNames } from "./bundle-inspection";
import { bundleProjectiles } from "./bundle-projectiles";
import { bundleSidebarPortraits } from "./bundle-sidebar-portraits";

const output = process.argv[2];
if (!output) throw new Error("Pass the app's Resources directory.");
const corePublic = fileURLToPath(new URL("../../core/public/", import.meta.url));

const seed = 142;
const green = PBTypes.TeamVals.LEFT;
const red = PBTypes.TeamVals.RIGHT;
const fixtureRoster = [
    { creatureName: "Squire", faction: "Life", team: green, level: 1, size: 1, amount: 27, x: 3, y: 8 },
    { creatureName: "Arbalester", faction: "Life", team: green, level: 1, size: 1, amount: 22, x: 2, y: 6 },
    { creatureName: "Healer", faction: "Life", team: green, level: 2, size: 1, amount: 12, x: 2, y: 10 },
    { creatureName: "Wolf", faction: "Nature", team: red, level: 1, size: 2, amount: 18, x: 13, y: 8 },
    { creatureName: "Scavenger", faction: "Chaos", team: red, level: 1, size: 1, amount: 19, x: 12, y: 10 },
    { creatureName: "Battle Mage", faction: "Life", team: red, level: 2, size: 1, amount: 8, x: 14, y: 6 },
];

const settings = simulationGridSettings();
const { abilityFactory, effectFactory } = createCombatFactories();
const hudAbilities = new Set<string>();
const hudSpells = new Set([
    ...inspectionSpellNames,
    ...Object.keys(effects).filter((name) => name !== "version"),
    ...Object.values(spells).flatMap((faction) => (typeof faction === "object" ? Object.keys(faction) : [])),
]);
const abilityDescriptions = new Map<string, string>();
type Creature = ReturnType<typeof createUnitFromSpec>;
const catalogue = allCreatureIds.map((id) => ({
    id,
    creatureName: UNIT_ID_TO_NAME[id],
    faction: getFactionOf(id),
    level: getLevelOf(id),
}));
const orderedRoster = [1, 2, 3, 4].flatMap((level) =>
    getPickPreviewOrder(
        level,
        catalogue.filter((entry) => entry.level === level).map(({ id }) => id),
    ),
);

function collectIcons(unit: Creature): void {
    for (const ability of unit.getAbilities()) {
        for (const name of [ability.getName(), ability.getEffectName(), ability.getAuraEffectName()]) {
            if (name) hudAbilities.add(name);
        }
        const spell = ability.getSpell();
        if (spell) hudSpells.add(spell.getName());
    }
    for (const spell of unit.getSpells()) hudSpells.add(spell.getName());
}

mkdirSync(output, { recursive: true });
writeFileSync(
    join(output, "online-preferences.json"),
    JSON.stringify({ languages: SUPPORTED_LANGUAGES, armyColors: ARMY_COLOR_PRESETS }),
);
writeFileSync(
    join(output, "sandbox-turn-clock.json"),
    JSON.stringify({
        minimumMillis: MIN_TIME_TO_MAKE_TURN_MILLIS,
        maximumMillis: MAX_TIME_TO_MAKE_TURN_MILLIS,
        lapMillis: TOTAL_TIME_TO_MAKE_TURN_MILLIS,
    }),
);
for (const [file, type] of [
    ["skirmish", PBTypes.GridVals.NORMAL],
    ["skirmish-lava", PBTypes.GridVals.LAVA_CENTER],
    ["skirmish-barrels", PBTypes.GridVals.BLOCK_CENTER],
] as const) {
    const grid = new Grid(settings, type);
    if (type === PBTypes.GridVals.BLOCK_CENTER) {
        grid.setScatteredMountains(scatteredMountainsForSeed(`sim-${seed}`).map((stone) => stone.cell));
    }
    const unitsHolder = new UnitsHolder(grid);
    setDeterministicRandomSource(makeRng(seed));
    try {
        const fightProperties = new FightProperties();
        fightProperties.setGridType(type);
        fightProperties.setSideOrientedPlacement(true);
        const terrain = exportBattleState({ unitsHolder, grid, fightProperties }, { seed, rng: seed });
        writeFileSync(join(output, `${file}-sandbox.json`), JSON.stringify(terrain));
        for (const [index, { team, x, y, ...spec }] of fixtureRoster.entries()) {
            const id = deterministicSimulationId("mac-skirmish", seed, index);
            const unit = createUnitFromSpec(spec, team, settings, abilityFactory, effectFactory, false, id);
            collectIcons(unit);
            const anchor = { x, y };
            const width = unit.getFootprintWidth();
            const height = unit.getFootprintHeight();
            const cells = getFootprintCellsForAnchor(anchor, width, height);
            if (!grid.occupyCells(cells, id, team, unit.getAttackRange(), false, false)) {
                throw new Error(`Could not place ${spec.creatureName} on ${file}.`);
            }
            const position = getPositionForFootprintAnchor(settings, anchor, width, height);
            unit.setPosition(position.x, position.y);
            unitsHolder.addUnit(unit);
        }
        const snapshot = exportBattleState({ unitsHolder, grid, fightProperties }, { seed, rng: seed });
        writeFileSync(join(output, `${file}.json`), JSON.stringify(snapshot));
    } finally {
        setDeterministicRandomSource(undefined);
    }
}

const catalogueRows = catalogue
    .filter(({ level }) => level > 0)
    .map(({ id, creatureName, faction, level }) => {
        const grid = new Grid(settings, PBTypes.GridVals.NORMAL);
        const fightProperties = new FightProperties();
        const unitsHolder = new UnitsHolder(grid);
        const amount = amountForCreatureExperienceBudget(creatureName, STACK_EXPERIENCE_BUDGET, 1);
        const unit = createUnitFromSpec(
            { creatureName, faction: ToFactionName[faction], level, size: 1, amount },
            green,
            settings,
            abilityFactory,
            effectFactory,
            false,
            deterministicSimulationId("mac-catalogue", seed, id),
        );
        const config = unit.getUnitProperties();
        config.abilities.forEach((name, index) => {
            const description = config.abilities_descriptions[index];
            if (description && !abilityDescriptions.has(name)) abilityDescriptions.set(name, description);
        });
        unitsHolder.addUnit(unit);
        collectIcons(unit);
        const snapshot = exportBattleState({ unitsHolder, grid, fightProperties });
        return {
            id,
            name: creatureName,
            faction,
            level,
            amount,
            rosterOrder: orderedRoster.indexOf(id),
            width: unit.getFootprintWidth(),
            height: unit.getFootprintHeight(),
            unit: (snapshot.units as unknown[])[0],
            configs: snapshot.configs,
        };
    });
writeFileSync(join(output, "sandbox-catalogue.json"), JSON.stringify(catalogueRows));
bundleInspection(output, abilityDescriptions);

const sampleArmies = [
    { name: "Squire", team: green, x: 3, y: 7 },
    { name: "Arbalester", team: green, x: 1, y: 7 },
    { name: "Healer", team: green, x: 1, y: 9 },
    { name: "Griffin", team: green, x: 3, y: 6 },
    { name: "Crusader", team: green, x: 3, y: 8 },
    { name: "Angel", team: green, x: 3, y: 10 },
    { name: "Wolf", team: red, x: 13, y: 7 },
    { name: "Orc", team: red, x: 14, y: 7 },
    { name: "Battle Mage", team: red, x: 14, y: 9 },
    { name: "Efreet", team: red, x: 12, y: 8 },
    { name: "Nightmare", team: red, x: 13, y: 6 },
    { name: "Black Dragon", team: red, x: 13, y: 10 },
];
writeFileSync(
    join(output, "sandbox-sample-armies.json"),
    JSON.stringify(
        sampleArmies.map(({ name, ...placement }) => {
            const creature = catalogueRows.find((entry) => entry.name === name);
            if (!creature) throw new Error(`Missing sample creature ${name}.`);
            return { creature: creature.id, amount: creature.amount, ...placement };
        }),
    ),
);

writeFileSync(
    join(output, "battlefield.json"),
    JSON.stringify({
        artwork: BATTLEFIELD_ARTWORK,
        rows: BATTLEFIELD_GRID_ROWS,
        aim: { ...DEFAULT_MOVEMENT_AREA_TUNING, cellSize: settings.getCellSize() },
        heightRatio: BATTLEFIELD_HEIGHT_RATIO,
        overscan: BATTLEFIELD_HORIZONTAL_OVERSCAN,
        horizontalBias: BATTLEFIELD_HORIZONTAL_BIAS,
        fires: AMBIENT_FIRE_DEFINITIONS.map((fire) => ({
            ...fire,
            resource: `${fire.textureKey ?? fire.key}.webp`,
        })),
    }),
);

for (const file of ["HoCForge-Regular.ttf", "OFL.txt"]) {
    copyFileSync(join(corePublic, "fonts/hoc-forge", file), join(output, file));
}
const sounds = join(output, "Sounds");
mkdirSync(sounds, { recursive: true });
for (const event of [
    "place_unit",
    "spellbook_open",
    "spellbook_close",
    "heal",
    "blacksmith_cast",
    "summon",
    "water_shield_dissolve",
]) {
    copyFileSync(join(corePublic, "audio/events", `${event}.mp3`), join(sounds, `${event}.mp3`));
}
for (const { slug } of Object.values(spellSounds)) {
    copyFileSync(join(corePublic, "audio/spells", `${slug}.mp3`), join(sounds, `${slug}.mp3`));
}
writeFileSync(join(sounds, "spell-sounds.json"), JSON.stringify(spellSounds));
for (const { creatureName } of catalogue) {
    const slug = creatureName.toLowerCase().replaceAll(" ", "-");
    for (const action of ["move", "attack", "hurt"]) {
        const file = `${slug}_${action}.mp3`;
        const source = join(corePublic, "audio/combat", file);
        if (existsSync(source)) copyFileSync(source, join(sounds, file));
    }
}

const images = process.env.HOC_IMAGES_LOC;
if (images) {
    writeFileSync(
        join(output, "sandbox-loading.json"),
        JSON.stringify({
            minimumDurationMs: minimumLoadingScreenDurationMs("Sandbox"),
            fadeDurationMs: LOADING_EXIT_FADE_MS,
            fire: normalizeLoadingScreenFireTuning(undefined),
        }),
    );
    const resourceName = (source: string) => new URL(source).pathname.split("/").at(-1)!;
    const boards = [
        "original_restored",
        "first_ring_destroyed_aaa_v3",
        "two_rings_destroyed_aaa_v7",
        "three_rings_destroyed_aaa_v3",
        "four_rings_destroyed_aaa_v7",
        "five_rings_destroyed_aaa_v4",
    ];
    for (const [level, board] of boards.entries()) {
        copyFileSync(
            join(images, `background_stone_tiles_sinister_16x16_${board}.webp`),
            join(output, `board-${level}.webp`),
        );
    }
    const portraits: Record<string, object> = {};
    for (const { id, creatureName } of catalogue) {
        const key = creatureName.toLowerCase().replaceAll(" ", "_");
        const visual = resolveCreaturePortraitVisual(id);
        const portrait = visual ? resourceName(visual.source) : `${key}_512.webp`;
        for (const [source, target] of [
            [`${FINAL_STATIC_BATTLEFIELD_TEXTURES[key]}.webp`, `${key}.webp`],
            [portrait, `${key}_portrait.webp`],
            [`${key}_left_screen_x2.webp`, `${key}_inspect.webp`],
        ]) {
            if (existsSync(join(images, source))) copyFileSync(join(images, source), join(output, target));
        }
        if (visual) {
            const { source, background, ...attributes } = visual;
            portraits[creatureName] = {
                ...attributes,
                background: background && resourceName(background).replace(/\.webp$/, ""),
                authoredFacing: battlePortraitFacingScale(creatureName, 1),
            };
        }
    }
    writeFileSync(join(output, "portraits.json"), JSON.stringify(portraits));
    for (const control of ["spellbook", "hourglass", "sword", "bow", "scepter", "next", "luck", "ai"]) {
        const file = `combat_toolbar_ember_${control}.webp`;
        copyFileSync(join(images, file), join(output, file));
    }
    for (const resultArt of [
        "fight_results_moonlit_castle_background",
        "fight_results_moonlit_fire_overlay_v9",
        "fight_results_burnished_bronze_panel_background_v1",
        "fight_results_trophy_v1",
    ]) {
        copyFileSync(join(images, `${resultArt}.webp`), join(output, `${resultArt}.webp`));
    }
    writeFileSync(
        join(output, "sandbox-synergies.json"),
        JSON.stringify(
            Object.fromEntries(
                Object.entries(SYNERGY_KEY_TO_IMAGE).map(([key, link]) => {
                    const [faction, variant, level] = key.split(":");
                    return [
                        key,
                        {
                            icon: resourceName(link).replace(/\.webp$/, ""),
                            description: synergyEffectAtLevel(faction, variant, Number(level)),
                            descriptionRu: synergyEffectAtLevel(faction, variant, Number(level), (text) => RU_TRANSLATIONS[text] ?? text),
                        },
                    ];
                }),
            ),
        ),
    );
    for (const file of new Set([
        ...Object.values(SYNERGY_KEY_TO_IMAGE).map(resourceName),
        ...[...TIER1_ARTIFACT_LIST, ...TIER2_ARTIFACT_LIST].map(({ imageKey }) => `${imageKey}.webp`),
    ])) {
        const source = join(images, file);
        if (existsSync(source)) copyFileSync(source, join(output, file));
    }
    for (const side of ["left", "right"]) {
        for (const piece of ["outer_top_v12", "outer_bottom_v12", "outer_rail_v12", "inner_v11", "center_v11"]) {
            const file = `ui_sidebar_bg_${side}_smoked_bronze_${piece}.webp`;
            copyFileSync(join(images, file), join(output, `${side}-${piece}.webp`));
        }
    }
    for (const asset of [
        "life_portrait_bg_golden_dawn_four_corner_haze_v1",
        "nature_portrait_bg_xray_leaf_corner_glow_v2_soft",
        "chaos_portrait_bg_obsidian_fissure_corner_fire_v1",
        "might_portrait_bg_blood_claw_strong_red_corners_v1",
        "ui_container_frame_1_9slice",
        "ui_container_frame_2_9slice",
        "ui_creature_name_flag_classic_v9",
        "ui_up_next_smoky_chains_bg_85pct_v5",
        "ui_up_next_smoky_chains_bg_wide_73pct_v4",
        "ui_control_fullscreen_forged_bronze_v1",
        "ui_control_music_muted_forged_bronze_v1",
        "ui_control_music_on_forged_bronze_v1",
        "ui_control_close_oxblood_bronze_v2",
        "cursor_default",
        "cursor_interactive_point_x",
        "cursor_melee",
        "cursor_ranged",
        "cursor_magic",
        "shot_range_corner_aaa_v1",
        "shot_range_corner_aaa_v4_green",
        "shot_range_corner_aaa_v4_red",
        "loading_screen_forging_base",
        "loading_screen_forging_exact_overlay",
        "loading_screen_dragon_medallion",
        "army_icon",
        "board_icon",
        "flag_green_icon",
        "flag_red_icon",
        "tag",
        "immobilized_chain_ball",
        "hourglass",
        "stop",
        "tr_up",
        "ui_fantasy_radio_off",
        "ui_fantasy_radio_on",
        ...["board", "armor", "might", "empower", "sniper", "movement"].map((augment) => `${augment}_augment_256`),
        "ui_ai_toggle_orb_green_on",
        "ui_ai_toggle_orb_red_on",
        "damage_analytics_icon",
        "combat_kills_skull_icon_v1",
        "combat_range_full_arrow_icon_v1",
        "combat_range_half_broken_arrow_icon_v1",
        "petrifying_gaze_256",
        "icon_active_option",
        "icon_inactive_option",
        ...[
            "health_gold_v2",
            "damage_gold_v2",
            "melee_attack_gold_v2",
            "ranged_attack_gold_v2",
            "armor_gold_v2",
            "ranged_armor_gold_v2",
            "magic_resist_gold_v2",
            "walk_gold_v2",
            "fly_gold_v2",
            "initiative_gold_v2",
            "morale_gold_v2",
            "luck_gold_v2",
            "scroll_gold_v2",
            "shot_range_gold_v2_arc",
            "ammo_gold_v2",
        ].map((stat) => `stat_${stat}`),
    ]) {
        copyFileSync(join(images, `${asset}.webp`), join(output, `${asset}.webp`));
    }
    for (const name of hudAbilities) {
        const source = join(images, `${abilityToTextureName(name)}.webp`);
        if (existsSync(source))
            copyFileSync(source, join(output, `ability-${name.toLowerCase().replaceAll(" ", "_")}.webp`));
    }
    const atlases = join(output, "Atlases");
    mkdirSync(atlases, { recursive: true });
    for (const texture of new Set([
        ...AMBIENT_FIRE_DEFINITIONS.map((fire) => fire.textureKey ?? fire.key),
        "ambient_fire_left_furnace_atlas",
        "ambient_fire_left_brazier_atlas",
        "shot_trajectory_orc_bronze_arrowhead_distant_match_v8",
        "shot_trajectory_orc_bronze_fletching_distant_match_v8",
        "shot_trajectory_hammered_bronze_casing_sprite_v4",
        "magic_aim_dual_helix_default_atlas",
        "vfx_griffin_tornado_silver_v2",
        "vfx_pegasus_feather_atlas_v7",
        "fire_pit_grok_video_fire_under_v2_64_atlas",
        "fire_pit_grok_video_fire_over_v2_64_atlas",
        "fire_pit_grok_video_fire_actual_extent_v4_64_atlas",
    ])) {
        const file = `${texture}.webp`;
        copyFileSync(join(images, file), join(atlases, file));
    }
    copyFileSync(join(images, "ui_start_button_plate_trimmed.webp"), join(output, "ready-plate.webp"));
    for (const asset of [
        "fire_pit_dark_bowl_v1_512",
        "fire_pit_grate_burning_exact_v17_512",
        "fire_pit_extinguished_deep_background_v16_512",
        "fire_pit_grate_burning_charred_v18_512",
    ])
        copyFileSync(join(images, `${asset}.webp`), join(output, `${asset}.webp`));
    copyFileSync(join(images, "cemetery_obstacles_9x_256.webp"), join(output, "stones.webp"));
    copyFileSync(join(images, "cemetery_obstacles_9x_256_hp.webp"), join(output, "stones-fight.webp"));
    copyFileSync(join(images, "book_1024_clean_pages_v1.webp"), join(output, "spellbook.webp"));
    for (const key of Object.values(SPELL_BOOK_FURNITURE)) {
        copyFileSync(join(images, `${key}.webp`), join(output, `${key}.webp`));
    }
    for (const spell of hudSpells) {
        const key = spell.toLowerCase().replaceAll(" ", "_");
        const source = join(images, `${spellIconTextureKey(spell)}.webp`);
        if (existsSync(source)) copyFileSync(source, join(output, `spell-${key}.webp`));
    }
}
bundleProjectiles(output);
bundleAnimations(
    output,
    catalogue.map(({ creatureName }) => creatureName),
);
bundleSidebarPortraits(output);
