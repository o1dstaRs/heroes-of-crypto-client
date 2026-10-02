import { describe, expect, test } from "bun:test";
import { Container, Texture } from "pixi.js";

import {
    AbilityFactory,
    EffectFactory,
    GridConstants,
    GridSettings,
    HoCConfig,
    SpellHelper,
    TeamVals,
    Unit,
    UnitVals,
} from "@heroesofcrypto/common";

import { RenderableUnit } from "./RenderableUnit";
import { Sandbox } from "./Sandbox";

const gridSettings = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);

const spellbookCasters = [
    ["Life", "Healer", ["Heal", "Spiritual Armor"]],
    ["Life", "Blacksmith", ["Armor Rune", "Weapon Rune"]],
    ["Life", "Battle Mage", ["Fire Strike"]],
    ["Nature", "Satyr", ["Courage", "Summon Wolves"]],
    ["Nature", "Magic Dragon", ["Lightning Strike"]],
    ["Chaos", "Wandering Mage", ["Misfortune", "Fireforged Sword"]],
    ["Chaos", "Nightmare", ["Empower"]],
    ["Might", "Ogre Mage", ["Riot", "Magic Mirror"]],
] as const;

const createCaster = (faction: string, name: string, entries?: string[]): RenderableUnit => {
    const effectFactory = new EffectFactory();
    const properties = HoCConfig.getCreatureConfig(TeamVals.LEFT, faction, name, "", 1);
    const configuredEntries = [...properties.spells];
    if (entries !== undefined) {
        properties.spells.splice(0, properties.spells.length, ...entries);
        properties.can_cast_spells = entries.length > 0;
        properties.spell_entries_authoritative = true;
    }
    const base = Unit.createUnit(
        properties,
        gridSettings,
        TeamVals.LEFT,
        UnitVals.CREATURE,
        new AbilityFactory(effectFactory),
        effectFactory,
        false,
    );
    const keys = new Set([
        "spell_cell_260",
        "fire_strike_chaos_256_v1",
        "meteorite_chaos_256_v1",
        ...configuredEntries.map((entry) => SpellHelper.spellToTextureName(entry.split(":")[1])),
    ]);
    const caster = RenderableUnit.fromBase(base, (key) => (keys.has(key) ? Texture.WHITE : undefined));
    caster.setStackPower(1);
    return caster;
};

const clickCard = (caster: RenderableUnit, spellName: string) => {
    const log: string[] = [];
    let closes = 0;
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        currentActiveUnit: caster,
        currentActiveSpell: undefined,
        pixiApp: { worldToScreen: (x: number, y: number) => ({ x, y }) },
        sc_sceneLog: { updateLog: (line: string) => log.push(line) },
        closeSpellBook: () => {
            closes++;
        },
        applyGameAction: () => false,
        updateCurrentMovePath: () => undefined,
        buttonManager: { refreshButtons: () => undefined },
        castMassOrSummonSpell: (spell: { getName: () => string }) => log.push(`cast ${spell.getName()}`),
    });
    const card = caster.getBookSpellByName(spellName)!;
    expect(card).toBeDefined();
    expect(card.canUse(1)).toBe(true);
    const bounds = card.getSprite().getBounds();
    const point = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
    expect(caster.getHoveredSpell(point)?.getName()).toBe(spellName);

    scene.handleSpellbookClick(point);

    expect(closes).toBe(1);
    expect(scene.currentActiveSpell?.getName() === spellName || log.includes(`cast ${spellName}`)).toBe(true);
};

describe("single-creature spellbooks", () => {
    for (const [faction, name, basics] of spellbookCasters) {
        test(`${name} can pick its basic cards at stack power 1`, () => {
            const caster = createCaster(faction, name);
            const layer = new Container();
            try {
                expect(caster.getAmountAlive()).toBe(1);
                expect(caster.getCanCastSpells()).toBe(true);
                expect(caster.ensureSpellBookRendering(layer, new Map())).toBe(true);
                caster.renderSpells(1);
                for (const spellName of basics) {
                    clickCard(caster, spellName);
                }
            } finally {
                caster.hideSpells();
                layer.destroy({ children: true });
            }
        });
    }

    for (const initialEntries of [[], ["Life:Mass Heal", "Life:Mass Heal", "Life:Mass Heal"]]) {
        test(`Healer can pick restored basic spells after a snapshot with ${initialEntries.length} scrolls`, () => {
            const caster = createCaster("Life", "Healer", initialEntries);
            const layer = new Container();
            try {
                caster.syncAuthoritativeSpellEntries(["Life:Heal", "Life:Spiritual Armor"]);
                expect(caster.getCanCastSpells()).toBe(true);
                expect(caster.ensureSpellBookRendering(layer, new Map())).toBe(true);
                caster.renderSpells(1);
                clickCard(caster, "Heal");
                clickCard(caster, "Spiritual Armor");
            } finally {
                caster.hideSpells();
                layer.destroy({ children: true });
            }
        });
    }
});
