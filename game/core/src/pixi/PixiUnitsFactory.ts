/*
 * -----------------------------------------------------------------------------
 * Pixi-only UnitsFactory
 *  - No Box2D, no WebGL shader/Sprite wrappers.
 *  - Creates PixiUnit/Hero, positions them on the grid, and registers them
 *    with PixiSceneManager.
 * -----------------------------------------------------------------------------
 */

import {
    AllFactions,
    AbilityFactory,
    HoCLib,
    GridMath,
    HoCMath,
    Grid,
    GridConstants,
    GridSettings,
    HoCConfig,
    IUnitPropertiesProvider,
    Unit,
    UnitsHolder,
    TeamVals, FactionVals, UnitVals,
    TeamType, FactionType,
} from "@heroesofcrypto/common";

import { Container, Sprite as PixiSprite, Texture } from "pixi.js";

import { PixiSceneManager } from "./PixiSceneManager";
import { PixiUnit } from "./PixiUnit";
import { PixiHero } from "./PixiHero";
import { BASE_UNIT_STACK_TO_SPAWN_EXP, SHIFT_UNITS_POSITION_Y } from "../statics";

export enum HeroType {
    NO_TYPE = 0,
    MAGICIAN = 1,
    WARRIOR_MELEE = 2,
    WARRIOR_RANGE = 3,
}

export enum HeroGender {
    NO_GENDER = 0,
    MALE = 1,
    FEMALE = 2,
}

const generateHeroKey = (faction: FactionType, heroType: HeroType, heroGender: HeroGender) =>
    `${faction}:${heroType}:${heroGender}}`;

const FACTION_TO_HERO_TYPES: { [faction: string]: HeroType[] } = {
    [FactionVals.NATURE]: [HeroType.MAGICIAN, HeroType.WARRIOR_RANGE],
};

const FACTION_HERO_GENDER_TO_NAME: { [heroKey: string]: string[] } = {
    [`${generateHeroKey(FactionVals.NATURE, HeroType.MAGICIAN, HeroGender.MALE)}`]: [
        "Aelion Sage",
        "Thorne Whisper",
        "Faelan Moss",
        "Cedric Bloom",
        "Sylvan Shade",
        "Bramble Warden",
        "Linden Root",
        "Ashen Veil",
        "Fennel Dusk",
        "Rowan Glade",
        "Thistle Arc",
        "Moss Seer",
        "Alder Spirit",
        "Elm Weaver",
        "Fern Oracle",
        "Birch Enchanter",
        "Hazel Mist",
        "Laurel Spell",
        "Willow Sprite",
        "Maple Shaman",
        "Ivy Enigma",
        "Thorn Caster",
        "Oak Herald",
        "Reed Visionv",
        "Briar Seer",
        "Aspen Sage",
        "Juniper Myst",
        "Leaf Whisper",
        "Thornwood Mage",
        "Forest Enchanter",
        "Moss Sage",
        "Grove Keeper",
        "Wildroot Mage",
        "Pine Whisperer",
        "Timber Sage",
        "Bark Shaman",
        "Evergreen Mage",
        "Dew Mist",
        "Sylvan Enigma",
        "Thicket Seer",
        "Herb Whisper",
        "Wildwood Seer",
        "Vine Enchanter",
        "Leaf Sage",
        "Sprout Weaver",
        "Meadow Sage",
        "Petal Caster",
        "Thicket Oracle",
        "Seed Seer",
        "Branch Shaman",
        "Aelion",
        "Thorne",
        "Faelan",
        "Cedric",
        "Sylvan",
        "Bramble",
        "Linden",
        "Ashen",
        "Fennel",
        "Rowan",
        "Thistle",
        "Moss",
        "Alder",
        "Elm",
        "Fern",
        "Birch",
        "Hazel",
        "Laurel",
        "Willow",
        "Maple",
        "Ivy",
        "Thorn",
        "Oak",
        "Reed",
        "Briar",
        "Aspen",
        "Juniper",
        "Leaf",
        "Thornwood",
        "Forest",
        "Grove",
        "Wildroot",
        "Pine",
        "Timber",
        "Bark",
        "Evergreen",
        "Dew",
        "Sylvan",
        "Thicket",
        "Herb",
        "Wildwood",
        "Vine",
        "Sprout",
        "Meadow",
        "Petal",
        "Seed",
        "Branch",
        "Glade",
        "Sage",
        "Myst",
    ],
};

type DigitTextureMap = Map<number, Texture>;
type NamedTexture = [textureName: string, texture: Texture];

export enum TextureType {
    SMALL = 0,
    LARGE = 1,
}

export const unitToTextureName = (unitName: string, textureType: TextureType, unitSize = 1) => {
    const base = unitName.toLowerCase().replace(/ /g, "_");
    if (textureType === TextureType.LARGE) return `${base}_512`;
    if (unitSize === 1) return `${base}_128`;
    return `${base}_256`;
};

export class PixiUnitsFactory {
    /** Rendering & scene */
    private readonly sceneManager: PixiSceneManager;
    private readonly layer: Container; // where unit sprites live
    /** Game/world state */
    private readonly gridSettings: GridSettings;
    private readonly sceneStepCount: HoCLib.RefNumber;
    private readonly grid: Grid;
    private readonly unitsHolder: UnitsHolder;
    private readonly abilityFactory: AbilityFactory;
    /** Assets */
    private readonly textures: Record<string, Texture>;
    private readonly digitNormalTextures: DigitTextureMap;
    private readonly digitDamageTextures: DigitTextureMap;
    private readonly digitScrollTextures: DigitTextureMap;
    /** Book-keeping */
    private readonly smallTexturesByHero: Map<string, NamedTexture[]>;
    private readonly unitIdToUnit: Map<string, PixiUnit> = new Map();
    public constructor(
        sceneManager: PixiSceneManager,
        layer: Container,
        gridSettings: GridSettings,
        sceneStepCount: HoCLib.RefNumber,
        textures: Record<string, Texture>,
        grid: Grid,
        unitsHolder: UnitsHolder,
        abilityFactory: AbilityFactory,
        digitNormalTextures: DigitTextureMap,
        digitDamageTextures: DigitTextureMap,
        digitScrollTextures: DigitTextureMap,
    ) {
        this.sceneManager = sceneManager;
        this.layer = layer;
        this.gridSettings = gridSettings;
        this.sceneStepCount = sceneStepCount;
        this.textures = textures;
        this.grid = grid;
        this.unitsHolder = unitsHolder;
        this.abilityFactory = abilityFactory;
        this.digitNormalTextures = digitNormalTextures;
        this.digitDamageTextures = digitDamageTextures;
        this.digitScrollTextures = digitScrollTextures;

        // Precompute hero small textures map (by faction/type/gender)
        this.smallTexturesByHero = new Map();
        for (const faction of AllFactions) {
            const heroTypes = FACTION_TO_HERO_TYPES[faction];
            if (!heroTypes?.length) continue;

            for (const heroType of heroTypes) {
                // Example: add a few preloaded keys for nature magician male
                this.smallTexturesByHero.set(generateHeroKey(faction, heroType, HeroGender.MALE), [
                    ["nature_mage_male_1_128", this.textures["nature_mage_male_1_128"]],
                    ["nature_mage_male_2_128", this.textures["nature_mage_male_2_128"]],
                    ["nature_mage_male_3_128", this.textures["nature_mage_male_3_128"]],
                ]);
            }
        }
    }
    private getRandomHeroTexture(heroKey: string): NamedTexture | undefined {
        const choices = this.smallTexturesByHero.get(heroKey);
        if (choices?.length) return choices[HoCLib.getRandomInt(0, choices.length)];
        return undefined;
    }
    private registerUnit(unit: PixiUnit): void {
        this.unitsHolder.addUnit(unit as unknown as Unit); // holder expects Unit
        this.unitIdToUnit.set(unit.getId(), unit);
        this.sceneManager.addUnit(unit.getId(), unit);
    }
    /**
     * Spawn a specific unit at a grid cell (respecting size).
     * Replaces Box2D body/fixture logic with direct placement + SceneManager registration.
     */
    public spawnSelected(
        unitPropertiesProvider: IUnitPropertiesProvider,
        cell: HoCMath.XY,
        summoned: boolean,
        newAmount?: number,
    ): boolean {
        const size = unitPropertiesProvider.getSize();
        if (size === 1) {
            if (!this.grid.getOccupantUnitId(cell)) {
                const cloned = this.makeCreature(
                    unitPropertiesProvider.getFaction(),
                    unitPropertiesProvider.getName(),
                    unitPropertiesProvider.getTeam(),
                    newAmount ?? unitPropertiesProvider.getAmountAlive(),
                    0,
                    summoned,
                );

                const position = GridMath.getPositionForCell(
                    cell,
                    this.gridSettings.getMinX(),
                    this.gridSettings.getStep(),
                    this.gridSettings.getHalfStep(),
                );
                cloned.setPosition(position.x, position.y);
                this.registerUnit(cloned);

                return this.grid.occupyCell(
                    cell,
                    cloned.getId(),
                    cloned.getTeam(),
                    cloned.getAttackRange(),
                    cloned.hasAbilityActive("Made of Fire"),
                    cloned.hasAbilityActive("Made of Water"),
                );
            }
        } else {
            const cells = [
                { x: cell.x - 1, y: cell.y },
                { x: cell.x, y: cell.y },
                { x: cell.x - 1, y: cell.y - 1 },
                { x: cell.x, y: cell.y - 1 },
            ];
            if (!this.grid.areAllCellsEmpty(cells)) return false;

            const cloned = this.makeCreature(
                unitPropertiesProvider.getFaction(),
                unitPropertiesProvider.getName(),
                unitPropertiesProvider.getTeam(),
                newAmount ?? unitPropertiesProvider.getAmountAlive(),
                0,
                summoned,
            );

            const position = GridMath.getPositionForCell(
                cell,
                this.gridSettings.getMinX(),
                this.gridSettings.getStep(),
                this.gridSettings.getHalfStep(),
            );
            cloned.setPosition(position.x - GridConstants.HALF_STEP, position.y - GridConstants.HALF_STEP);
            this.registerUnit(cloned);

            return this.grid.occupyCells(
                cells,
                cloned.getId(),
                cloned.getTeam(),
                cloned.getAttackRange(),
                cloned.hasAbilityActive("Made of Fire"),
                cloned.hasAbilityActive("Made of Water"),
            );
        }

        return false;
    }
    public getUnit(unitId: string): PixiUnit | undefined {
        return this.unitIdToUnit.get(unitId);
    }
    public deleteUnit(unitId: string): void {
        const u = this.unitIdToUnit.get(unitId);
        if (!u) return;
        this.unitIdToUnit.delete(unitId);
        this.sceneManager.removeUnit(unitId);
        // If you want to remove sprites explicitly:
        const cont = u.getContainer();
        cont.parent?.removeChild(cont);
        cont.destroy({ children: true });
    }
    /**
     * Populate a side with a default lineup (ported from your original spawn()).
     * Exactly mirrors the creature lists per faction. Heroes left commented to match old defaults.
     */
    public spawn(team: TeamType, faction?: FactionType) {
        const units: PixiUnit[] = [];
        const heroes: PixiUnit[] = [];

        if (faction === FactionVals.LIFE) {
            units.push(this.makeCreature(FactionVals.LIFE, "Squire", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionVals.LIFE, "Peasant", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionVals.LIFE, "Arbalester", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionVals.LIFE, "Pikeman", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionVals.LIFE, "Valkyrie", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionVals.LIFE, "Healer", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionVals.LIFE, "Crusader", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionVals.LIFE, "Griffin", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionVals.LIFE, "Tsar Cannon", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionVals.LIFE, "Angel", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionVals.LIFE, "Champion", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
        } else if (faction === FactionVals.NATURE) {
            // heroes.push(this.makeHero(FactionType.NATURE, team, HeroType.MAGICIAN, HeroGender.MALE));
            units.push(this.makeCreature(FactionVals.NATURE, "Fairy", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionVals.NATURE, "Wolf", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionVals.NATURE, "Leprechaun", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionVals.NATURE, "White Tiger", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionVals.NATURE, "Elf", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionVals.NATURE, "Satyr", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionVals.NATURE, "Unicorn", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionVals.NATURE, "Mantis", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionVals.NATURE, "Gargantuan", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionVals.NATURE, "Pegasus", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionVals.NATURE, "Arachna Queen", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
        } else if (faction === FactionVals.CHAOS) {
            units.push(this.makeCreature(FactionVals.CHAOS, "Scavenger", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionVals.CHAOS, "Orc", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionVals.CHAOS, "Troglodyte", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionVals.CHAOS, "Medusa", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionVals.CHAOS, "Troll", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionVals.CHAOS, "Beholder", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionVals.CHAOS, "Efreet", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionVals.CHAOS, "Goblin Knight", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionVals.CHAOS, "Black Dragon", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionVals.CHAOS, "Hydra", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
        } else if (faction === FactionVals.MIGHT) {
            units.push(this.makeCreature(FactionVals.MIGHT, "Berserker", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionVals.MIGHT, "Centaur", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionVals.MIGHT, "Wolf Rider", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionVals.MIGHT, "Nomad", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionVals.MIGHT, "Harpy", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionVals.MIGHT, "Hyena", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionVals.MIGHT, "Ogre Mage", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionVals.MIGHT, "Cyclops", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionVals.MIGHT, "Thunderbird", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionVals.MIGHT, "Behemoth", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionVals.MIGHT, "Frenzied Boar", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
        }

        // Position logic (unchanged from your original, minus Box2D)
        let posIndex = SHIFT_UNITS_POSITION_Y;

        // spawn small units
        let subtrahend = 0;
        let foundSomeSmallUnits = false;
        let prevUnitLevel = 0;
        let j = 0;
        let yDiff = 0;

        for (let i = 0; i < units.length; i++) {
            const u = units[i];
            if (!u.isSmallSize()) {
                subtrahend++;
                continue;
            }

            if (prevUnitLevel === u.getLevel()) {
                if (j > 1) {
                    j -= 2;
                    yDiff -= 1;
                }
            } else {
                if (prevUnitLevel && j === 2) yDiff -= 1;
                j = 0;
            }

            posIndex = i - subtrahend + yDiff - j + SHIFT_UNITS_POSITION_Y;
            if (team === TeamVals.LOWER) {
                u.setPosition(
                    -GridConstants.MAX_X - GridConstants.HALF_STEP - GridConstants.STEP * j,
                    posIndex * GridConstants.STEP + GridConstants.HALF_STEP,
                );
            } else {
                u.setPosition(
                    GridConstants.MAX_X +
                        GridConstants.HALF_STEP -
                        GridConstants.UNIT_SIZE_DELTA +
                        GridConstants.STEP * j,
                    GridConstants.MAX_Y -
                        posIndex * GridConstants.STEP -
                        GridConstants.UNIT_SIZE_DELTA -
                        GridConstants.HALF_STEP,
                );
            }

            this.registerUnit(u);
            foundSomeSmallUnits = true;
            prevUnitLevel = u.getLevel();
            j++;
        }

        if (foundSomeSmallUnits) posIndex++;

        // heroes row
        let heroPosIndex = 0;
        for (const h of heroes) {
            if (team === TeamVals.LOWER) {
                h.setPosition(
                    -GridConstants.MAX_X - GridConstants.STEP * heroPosIndex - GridConstants.HALF_STEP,
                    GridConstants.DOUBLE_STEP + GridConstants.HALF_STEP,
                );
            } else {
                h.setPosition(
                    GridConstants.MAX_X + GridConstants.STEP * heroPosIndex + GridConstants.HALF_STEP,
                    GridConstants.MAX_Y - GridConstants.DOUBLE_STEP - GridConstants.HALF_STEP,
                );
            }
            heroPosIndex++;
            this.registerUnit(h);
        }

        for (const u of units) {
            if (u.isSmallSize()) continue;

            if (team === TeamVals.LOWER) {
                u.setPosition(
                    -GridConstants.MAX_X - GridConstants.STEP,
                    posIndex * GridConstants.STEP + GridConstants.STEP,
                );
            } else {
                u.setPosition(
                    GridConstants.MAX_X + GridConstants.STEP,
                    GridConstants.MAX_Y - posIndex * GridConstants.STEP - GridConstants.STEP,
                );
            }
            posIndex += 2;
            this.registerUnit(u);
        }
    }
    public makeCreature(
        faction: FactionType,
        name: string,
        team: TeamType,
        amount: number,
        totalExp?: number,
        summoned = false,
    ): PixiUnit {
        const creatureConfig = HoCConfig.getCreatureConfig(
            team,
            faction,
            name,
            unitToTextureName(name, TextureType.LARGE),
            amount,
            totalExp,
        );

        const smallKey = unitToTextureName(name, TextureType.SMALL, creatureConfig.size);
        const smallTex = this.textures[smallKey];
        if (!smallTex) {
            throw new ReferenceError(`Texture for creature ${name} (${smallKey}) not found`);
        }

        const unit = PixiUnit.createRenderableUnit(
            creatureConfig,
            this.gridSettings,
            team,
            UnitVals.CREATURE,
            this.abilityFactory,
            this.abilityFactory.getEffectsFactory(),
            summoned,
            this.sceneStepCount,
            this.layer,
            this.textures, // bag for spells and misc
            this.digitNormalTextures,
            this.digitDamageTextures,
            this.digitScrollTextures,
            new PixiSprite(smallTex),
            new PixiSprite(this.textures["tag"]),
            new PixiSprite(this.textures["hourglass"]),
            new PixiSprite(this.textures["stop"]),
        );

        return unit;
    }
    public makeHero(faction: FactionType, team: TeamType, heroType: HeroType, gender: HeroGender): PixiUnit {
        const heroKey = generateHeroKey(faction, heroType, gender);

        const pair = this.getRandomHeroTexture(heroKey);
        if (!pair) throw new ReferenceError(`Texture for hero key ${heroKey} not found`);
        const [textureName, smallTex] = pair;

        const heroNames = FACTION_HERO_GENDER_TO_NAME[heroKey];
        const heroName = heroNames ? heroNames[HoCLib.getRandomInt(0, heroNames.length)] : "";
        if (!heroName) throw new Error(`Hero name for hero key ${heroKey} not found`);

        const largeTextureName = `${textureName.split("_").slice(0, -1).join("_")}_512`;

        // Build config with large art id preserved (for UI/portraits if needed)
        const heroConfig = HoCConfig.getHeroConfig(team, faction, heroName, largeTextureName);

        const hero = new PixiHero(
            this.layer,
            this.textures,
            this.digitNormalTextures,
            this.digitDamageTextures,
            this.digitScrollTextures,
            heroConfig,
            this.gridSettings,
            team,
            new PixiSprite(smallTex),
            new PixiSprite(this.textures["tag"]),
            new PixiSprite(this.textures["hourglass"]),
            new PixiSprite(this.textures["stop"]),
            this.abilityFactory,
            this.sceneStepCount,
        );

        return hero;
    }
}
