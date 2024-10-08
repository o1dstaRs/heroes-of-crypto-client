/*
 * -----------------------------------------------------------------------------
 * This file is part of the browser implementation of the Heroes of Crypto game client.
 *
 * Heroes of Crypto and Heroes of Crypto AI are registered trademarks.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 * -----------------------------------------------------------------------------
 */

import { b2Body, b2Fixture, b2World } from "@box2d/core";
import {
    AllFactions,
    AbilityFactory,
    FactionType,
    HoCLib,
    GridMath,
    HoCMath,
    TeamType,
    Grid,
    GridSettings,
    UnitType,
    HoCConfig,
    IUnitPropertiesProvider,
    Unit,
    UnitsHolder,
} from "@heroesofcrypto/common";

import { DefaultShader } from "../utils/gl/defaultShader";
import { PreloadedTextures } from "../utils/gl/preload";
import { Sprite } from "../utils/gl/Sprite";
import { Hero } from "./heroes";
import { RenderableUnit } from "./renderable_unit";
import {
    BASE_UNIT_STACK_TO_SPAWN_EXP,
    DOUBLE_STEP,
    HALF_STEP,
    MAX_X,
    MAX_Y,
    SHIFT_UNITS_POSITION_Y,
    STEP,
    UNIT_SIZE_DELTA,
} from "../statics";

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
    [FactionType.NATURE]: [HeroType.MAGICIAN, HeroType.WARRIOR_RANGE],
};

const FACTION_HERO_GENDER_TO_NAME: { [heroKey: string]: string[] } = {
    [`${generateHeroKey(FactionType.NATURE, HeroType.MAGICIAN, HeroGender.MALE)}`]: [
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

type NamedTexture = [textureName: string, texture: WebGLTexture];

enum TextureType {
    SMALL = 0,
    LARGE = 1,
}

const unitToTextureName = (unitName: string, textureType: TextureType, unitSize = 1) => {
    if (textureType === TextureType.LARGE) {
        return `${unitName.toLowerCase().replace(/ /g, "_")}_512`;
    }
    if (unitSize === 1) {
        return `${unitName.toLowerCase().replace(/ /g, "_")}_128`;
    }
    return `${unitName.toLowerCase().replace(/ /g, "_")}_256`;
};

export class UnitsFactory {
    protected readonly world: b2World;

    protected readonly gl: WebGLRenderingContext;

    protected readonly allBodies: Map<string, b2Body>;

    protected readonly shader: DefaultShader;

    protected readonly gridSettings: GridSettings;

    protected readonly sceneStepCount: HoCLib.RefNumber;

    protected readonly unitSize: number;

    protected readonly textures: PreloadedTextures;

    protected readonly smallTexturesByHero: Map<string, NamedTexture[]>;

    protected readonly digitNormalTextures: Map<number, WebGLTexture>;

    protected readonly digitDamageTextures: Map<number, WebGLTexture>;

    protected readonly abilityFactory: AbilityFactory;

    protected readonly grid: Grid;

    protected readonly unitsHolder: UnitsHolder;

    protected readonly unitIdToBodyFixtures: Map<string, b2Fixture[]>;

    public constructor(
        world: b2World,
        gl: WebGLRenderingContext,
        shader: DefaultShader,
        digitNormalTextures: Map<number, WebGLTexture>,
        digitDamageTextures: Map<number, WebGLTexture>,
        gridSettings: GridSettings,
        sceneStepCount: HoCLib.RefNumber,
        textures: PreloadedTextures,
        grid: Grid,
        unitsHolder: UnitsHolder,
        abilityFactory: AbilityFactory,
    ) {
        this.world = world;
        this.gl = gl;
        this.shader = shader;
        this.digitNormalTextures = digitNormalTextures;
        this.digitDamageTextures = digitDamageTextures;
        this.unitSize = gridSettings.getUnitSize();
        this.gridSettings = gridSettings;
        this.sceneStepCount = sceneStepCount;
        this.textures = textures;
        this.abilityFactory = abilityFactory;
        this.grid = grid;
        this.unitsHolder = unitsHolder;
        this.unitIdToBodyFixtures = new Map();
        this.allBodies = new Map();

        this.smallTexturesByHero = new Map();
        for (const faction of AllFactions) {
            const heroTypes = FACTION_TO_HERO_TYPES[faction];
            if (!heroTypes?.length) {
                continue;
            }

            for (const heroType of heroTypes) {
                this.smallTexturesByHero.set(generateHeroKey(faction, heroType, HeroGender.MALE), [
                    ["nature_mage_male_1_128", textures.nature_mage_male_1_128.texture],
                    ["nature_mage_male_2_128", textures.nature_mage_male_2_128.texture],
                    ["nature_mage_male_3_128", textures.nature_mage_male_3_128.texture],
                ]);
            }
        }
    }

    private getRandomHeroTexture(heroKey: string): NamedTexture | undefined {
        const namedTextures = this.smallTexturesByHero.get(heroKey);
        if (namedTextures?.length) {
            return namedTextures[HoCLib.getRandomInt(0, namedTextures.length)];
        }

        return undefined;
    }

    private refreshBarFixtures(unit: RenderableUnit, body?: b2Body): void {
        let bodyToUse = body;
        if (!bodyToUse) {
            bodyToUse = this.allBodies.get(unit.getId());
        }
        if (!bodyToUse) {
            return;
        }

        this.destroyBodyFixtures(unit.getId(), bodyToUse);
        for (const f of unit.getHpBarBoundFixtureDefs()) {
            if (GridMath.isPositionWithinGrid(this.gridSettings, bodyToUse.GetPosition())) {
                this.addBodyFixture(unit.getId(), bodyToUse.CreateFixture(f));
            }
        }
        for (const f of unit.getHpBarFixtureDefs()) {
            if (GridMath.isPositionWithinGrid(this.gridSettings, bodyToUse.GetPosition())) {
                this.addBodyFixture(unit.getId(), bodyToUse.CreateFixture(f));
            }
        }
    }

    public refreshBarFixturesForAllUnits(allUnitsIterator: IterableIterator<Unit>): void {
        for (const u of allUnitsIterator) {
            this.refreshBarFixtures(u as RenderableUnit);
        }
    }

    private addBodyFixture(unitId: string, fixture: b2Fixture): void {
        const fixtures = this.unitIdToBodyFixtures.get(unitId);
        if (fixtures) {
            fixtures.push(fixture);
        } else {
            this.unitIdToBodyFixtures.set(unitId, [fixture]);
        }
    }

    private destroyBodyFixtures(unitId: string, body: b2Body) {
        const fixtures = this.unitIdToBodyFixtures.get(unitId);
        if (fixtures) {
            for (const f of fixtures) {
                body.DestroyFixture(f);
            }
        }
        this.unitIdToBodyFixtures.delete(unitId);
    }

    private positionBody(unit: RenderableUnit): void {
        if (this.allBodies.get(unit.getId())) {
            return;
        }

        const body = this.world.CreateBody(unit.getBodyDef());
        body.CreateFixture(unit.getFixtureDef());
        this.refreshBarFixtures(unit, body);
        this.unitsHolder.addUnit(unit);
        this.allBodies.set(unit.getId(), body);
    }

    public spawnSelected(
        unitPropertiesProvider: IUnitPropertiesProvider,
        cell: HoCMath.XY,
        summoned: boolean,
        newAmount?: number,
    ): boolean {
        if (unitPropertiesProvider.getSize() === 1) {
            if (!this.grid.getOccupantUnitId(cell)) {
                const cloned = this.makeCreature(
                    unitPropertiesProvider.getFaction(),
                    unitPropertiesProvider.getName(),
                    unitPropertiesProvider.getTeam(),
                    newAmount ? newAmount : unitPropertiesProvider.getAmountAlive(),
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
                this.positionBody(cloned);

                return this.grid.occupyCell(cell, cloned.getId(), cloned.getTeam(), cloned.getAttackRange());
            }
        } else {
            const cells = [
                { x: cell.x - 1, y: cell.y },
                { x: cell.x, y: cell.y },
                { x: cell.x - 1, y: cell.y - 1 },
                { x: cell.x, y: cell.y - 1 },
            ];
            const allCellsAreEmpty = this.grid.areAllCellsEmpty(cells);
            if (!allCellsAreEmpty) {
                return false;
            }

            const cloned = this.makeCreature(
                unitPropertiesProvider.getFaction(),
                unitPropertiesProvider.getName(),
                unitPropertiesProvider.getTeam(),
                newAmount ? newAmount : unitPropertiesProvider.getAmountAlive(),
                0,
                summoned,
            );

            const position = GridMath.getPositionForCell(
                cell,
                this.gridSettings.getMinX(),
                this.gridSettings.getStep(),
                this.gridSettings.getHalfStep(),
            );
            cloned.setPosition(position.x - HALF_STEP, position.y - HALF_STEP);
            this.positionBody(cloned);

            return this.grid.occupyCells(cells, cloned.getId(), cloned.getTeam(), cloned.getAttackRange());
        }

        return false;
    }

    public getUnitBody(unitId: string): b2Body | undefined {
        return this.allBodies.get(unitId);
    }

    public deleteUnitBody(unitId: string): void {
        this.allBodies.delete(unitId);
    }

    public spawn(team: TeamType, faction?: FactionType) {
        const units: RenderableUnit[] = [];
        const heroes: RenderableUnit[] = [];

        if (faction === FactionType.LIFE) {
            units.push(this.makeCreature(FactionType.LIFE, "Squire", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionType.LIFE, "Peasant", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionType.LIFE, "Arbalester", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionType.LIFE, "Pikeman", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionType.LIFE, "Valkyrie", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionType.LIFE, "Healer", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionType.LIFE, "Crusader", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionType.LIFE, "Griffin", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionType.LIFE, "Tsar Cannon", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionType.LIFE, "Angel", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionType.LIFE, "Champion", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
        } else if (faction === FactionType.NATURE) {
            // heroes.push(this.makeHero(FactionType.NATURE, team, HeroType.MAGICIAN, HeroGender.MALE));
            // heroes.push(this.makeHero(FactionType.NATURE, team, HeroType.MAGICIAN, HeroGender.MALE));
            // heroes.push(this.makeHero(FactionType.NATURE, team, HeroType.MAGICIAN, HeroGender.MALE));
            units.push(this.makeCreature(FactionType.NATURE, "Fairy", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionType.NATURE, "Wolf", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionType.NATURE, "Leprechaun", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionType.NATURE, "White Tiger", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionType.NATURE, "Elf", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionType.NATURE, "Satyr", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionType.NATURE, "Unicorn", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionType.NATURE, "Mantis", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            // units.push(
            //     this.unitsFactory.makeCreature(
            //         FactionType.NATURE,
            //         "Faerie Dragon",
            //         team,
            //         0,
            //         BASE_UNIT_STACK_TO_SPAWN_EXP,
            //     ),
            // );
            units.push(this.makeCreature(FactionType.NATURE, "Gargantuan", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionType.NATURE, "Pegasus", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
        } else if (faction === FactionType.CHAOS) {
            units.push(this.makeCreature(FactionType.CHAOS, "Scavenger", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionType.CHAOS, "Orc", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionType.CHAOS, "Troglodyte", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionType.CHAOS, "Medusa", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionType.CHAOS, "Troll", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionType.CHAOS, "Beholder", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionType.CHAOS, "Efreet", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionType.CHAOS, "Goblin Knight", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionType.CHAOS, "Black Dragon", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionType.CHAOS, "Hydra", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            // units.push(
            //     this.unitsFactory.makeCreature(FactionType.CHAOS, "Abomination", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP),
            // );
        } else if (faction === FactionType.DEATH) {
            units.push(this.makeCreature(FactionType.DEATH, "Skeleton", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionType.DEATH, "Imp", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionType.DEATH, "Zombie", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionType.DEATH, "Dark Champion", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
        } else if (faction === FactionType.MIGHT) {
            units.push(this.makeCreature(FactionType.MIGHT, "Berserker", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionType.MIGHT, "Centaur", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionType.MIGHT, "Wolf Rider", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionType.MIGHT, "Nomad", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionType.MIGHT, "Harpy", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionType.MIGHT, "Hyena", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionType.MIGHT, "Ogre Mage", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionType.MIGHT, "Cyclops", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionType.MIGHT, "Thunderbird", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionType.MIGHT, "Behemoth", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(this.makeCreature(FactionType.MIGHT, "Frenzied Boar", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
        }

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
                if (prevUnitLevel && j === 2) {
                    yDiff -= 1;
                }
                j = 0;
            }

            posIndex = i - subtrahend + yDiff - j + SHIFT_UNITS_POSITION_Y;
            if (team === TeamType.LOWER) {
                u.setPosition(-MAX_X - HALF_STEP - STEP * j, posIndex * STEP + HALF_STEP);
            } else {
                u.setPosition(
                    MAX_X + HALF_STEP - UNIT_SIZE_DELTA + STEP * j,
                    MAX_Y - posIndex * STEP - UNIT_SIZE_DELTA - HALF_STEP,
                );
            }
            foundSomeSmallUnits = true;
            this.positionBody(u);
            prevUnitLevel = u.getLevel();
            j++;
        }

        if (foundSomeSmallUnits) {
            posIndex++;
        }

        let heroPosIndex = 0;
        for (const h of heroes) {
            if (team === TeamType.LOWER) {
                h.setPosition(-MAX_X - STEP * heroPosIndex - HALF_STEP, DOUBLE_STEP + HALF_STEP);
            } else {
                h.setPosition(MAX_X + STEP * heroPosIndex + HALF_STEP, MAX_Y - DOUBLE_STEP - HALF_STEP);
            }
            heroPosIndex++;

            this.positionBody(h);
        }

        for (const u of units) {
            if (u.isSmallSize()) {
                continue;
            }

            if (team === TeamType.LOWER) {
                u.setPosition(-MAX_X - STEP, posIndex * STEP + STEP);
            } else {
                u.setPosition(MAX_X + STEP, MAX_Y - posIndex * STEP - STEP);
            }
            posIndex += 2;

            this.positionBody(u);
        }
    }

    public makeCreature(
        faction: FactionType,
        name: string,
        team: TeamType,
        amount: number,
        totalExp?: number,
        summoned = false,
    ): RenderableUnit {
        const creatureConfig = HoCConfig.getCreatureConfig(
            team,
            faction,
            name,
            unitToTextureName(name, TextureType.LARGE),
            amount,
            totalExp,
        );

        const textureName = unitToTextureName(name, TextureType.SMALL, creatureConfig.size);
        const texture = (this.textures as Record<string, { texture: WebGLTexture }>)[textureName]?.texture;
        if (!texture) {
            throw new ReferenceError(`Texture for creature ${name} (${textureName}) not found`);
        }

        return RenderableUnit.createRenderableUnit(
            creatureConfig,
            this.gridSettings,
            team,
            UnitType.CREATURE,
            this.abilityFactory,
            this.abilityFactory.getEffectsFactory(),
            summoned,
            this.sceneStepCount,
            this.textures,
            this.gl,
            this.shader,
            this.digitNormalTextures,
            this.digitDamageTextures,
            new Sprite(this.gl, this.shader, texture),
            new Sprite(this.gl, this.shader, this.textures.tag.texture),
            new Sprite(this.gl, this.shader, this.textures.hourglass.texture),
        );
    }

    public makeHero(faction: FactionType, team: TeamType, heroType: HeroType, gender: HeroGender): RenderableUnit {
        const heroKey = generateHeroKey(faction, heroType, gender);

        const textureWithNamePair = this.getRandomHeroTexture(heroKey);
        if (!textureWithNamePair?.length) {
            throw new ReferenceError(`Texture for hero key ${heroKey} not found`);
        }

        const heroNames = FACTION_HERO_GENDER_TO_NAME[heroKey];
        const heroName = heroNames ? heroNames[HoCLib.getRandomInt(0, heroNames.length)] : "";

        if (!heroName) {
            throw new Error(`Hero name for hero key ${heroKey} not found`);
        }

        const textureName = textureWithNamePair[0];
        const largeTextureName = `${textureName.split("_").slice(0, -1).join("_")}_512`;
        const texture = textureWithNamePair[1];

        return new Hero(
            this.gl,
            this.shader,
            this.digitNormalTextures,
            this.digitDamageTextures,
            HoCConfig.getHeroConfig(team, faction, heroName, largeTextureName),
            this.gridSettings,
            team,
            new Sprite(this.gl, this.shader, texture),
            new Sprite(this.gl, this.shader, this.textures.tag.texture),
            new Sprite(this.gl, this.shader, this.textures.hourglass.texture),
            this.abilityFactory,
            this.textures,
            this.sceneStepCount,
        );
    }
}
