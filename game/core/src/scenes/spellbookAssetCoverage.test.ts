import { describe, expect, test } from "bun:test";
import { Container, Texture } from "pixi.js";

import {
    AbilityFactory,
    EffectFactory,
    GridConstants,
    GridSettings,
    HoCConfig,
    TeamVals,
    Unit,
    UnitVals,
} from "@heroesofcrypto/common";
import creatures from "@heroesofcrypto/common/src/configuration/creatures.json";

import { images } from "../generated/image_imports";
import imageKeys from "../generated/image_keys.json";
import { RenderableUnit } from "./RenderableUnit";
import { spellIconTextureKey } from "./spellIcons";

const publishedKeys = new Set<string>(imageKeys);
const runtimeImages = images as Readonly<Record<string, string | undefined>>;
const spellbookCasters = Object.entries(creatures).flatMap(([faction, entries]) =>
    typeof entries === "object"
        ? Object.entries(entries)
              .filter(([, creature]) => creature.spells.length > 0)
              .map(([name]) => [faction, name] as const)
        : [],
);
const gridSettings = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);

function createCaster(faction: string, name: string): RenderableUnit {
    const effects = new EffectFactory();
    const unit = Unit.createUnit(
        HoCConfig.getCreatureConfig(TeamVals.LEFT, faction, name, "", 1),
        gridSettings,
        TeamVals.LEFT,
        UnitVals.CREATURE,
        new AbilityFactory(effects),
        effects,
        false,
    );
    return RenderableUnit.fromBase(unit, (key) =>
        publishedKeys.has(key) && runtimeImages[key] ? Texture.WHITE : undefined,
    );
}

describe("spellbooks backed by the published asset catalog", () => {
    test.each(spellbookCasters)("%s / %s renders every configured spell and its charges", (faction, name) => {
        const caster = createCaster(faction, name);
        const layer = new Container();
        try {
            caster.setStackPower(5);
            expect(caster.ensureSpellBookRendering(layer, new Map())).toBe(true);
            for (const spell of caster.getSpells()) {
                const key = spellIconTextureKey(spell.getName());
                expect(publishedKeys.has(key), `${name}: missing published icon ${key}`).toBe(true);
                expect(runtimeImages[key], `${name}: missing runtime icon ${key}`).toBeDefined();
                const card = caster.getBookSpellByName(spell.getName());
                expect(card, `${name}: missing ${spell.getName()} card`).toBeDefined();
                expect(card?.getAmount()).toBe(spell.getAmount());
                expect(card?.canUse(5)).toBe(true);
            }
        } finally {
            caster.hideSpells();
            layer.destroy({ children: true });
        }
    });

    test("Wandering Mage keeps Fireball visible below its stack requirement and consumes its charge", () => {
        const caster = createCaster("Chaos", "Wandering Mage");
        const layer = new Container();
        try {
            caster.setStackPower(1);
            expect(caster.ensureSpellBookRendering(layer, new Map())).toBe(true);
            caster.renderSpells(1);
            const fireball = caster.getBookSpellByName("Fireball");
            expect(fireball).toBeDefined();
            expect(fireball?.getAmount()).toBe(1);
            expect(fireball?.canUse(1)).toBe(false);
            expect(fireball?.canUse(3)).toBe(true);
            expect(caster.getBookSpellByName("Fireforged Sword")?.canUse(1)).toBe(true);

            caster
                .getSpells()
                .find((spell) => spell.getName() === "Fireball")
                ?.setAmount(0);
            caster.renderSpells(1);

            expect(fireball?.getAmount()).toBe(0);
            expect(fireball?.canUse(5)).toBe(false);
        } finally {
            caster.hideSpells();
            layer.destroy({ children: true });
        }
    });
});
