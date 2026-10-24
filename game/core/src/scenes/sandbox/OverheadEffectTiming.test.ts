import { expect, spyOn, test } from "bun:test";
import { Assets, Container, Sprite, Texture, TextureSource } from "pixi.js";
import { CommonFlagPops, COMMON_FLAG_POP_KINDS, type FlagPopKind } from "./CommonFlagPops";
import { BoarSalivaPops } from "./BoarSalivaPops";
import { DevourEssencePops } from "./DevourEssencePops";
import { CrusadePops } from "./CrusadePops";
import { MagicReflectionPops } from "./MagicReflectionPops";
import { UnyieldingPowerPops } from "./UnyieldingPowerPops";
import { AngelResurrectionPops } from "./AngelResurrectionPops";
import { DeepWoundsPops } from "./DeepWoundsPops";
import { BattleRoarPops } from "./BattleRoarPops";

const kinds: FlagPopKind[] = [
    "bitter_experience",
    ...COMMON_FLAG_POP_KINDS,
    "ogre_riot",
    "ogre_magic_mirror",
    "paralysis",
    "stun",
    "penetrating_bite",
    "piercing_spear",
    "empower",
    "dulling_defense",
    "shatter_armor",
    "leather_armor",
    "wild_regeneration",
    "shadow_touch",
    "absolving_arrow",
    "unicorn_retaliation",
    "unicorn_blindness",
    "multi_attack",
];
const dedicated = {
    BoarSalivaPops,
    DevourEssencePops,
    CrusadePops,
    MagicReflectionPops,
    UnyieldingPowerPops,
    AngelResurrectionPops,
};
const cases = [...kinds, ...Object.keys(dedicated), "wounds1", "wounds2", "wounds3", "roar1000", "roar1500"];

test.each(cases)("%s completes every cel in 650 ms regardless of scene-step speed", async (kind) => {
    const art = new Texture({ source: new TextureSource({ width: 4096, height: 4096 }) });
    const load = spyOn(Assets, "load").mockResolvedValue(art as unknown as Record<string, unknown>);
    const unload = spyOn(Assets, "unload").mockResolvedValue();
    const root = new Container();
    let now = 0;
    const attach = (c: Container) => {
        root.addChild(c);
    };
    const clock = () => now;
    const anchor = { x: 100, y: 200 };
    const Klass = dedicated[kind as keyof typeof dedicated];
    const layer = kind.startsWith("wounds")
        ? new DeepWoundsPops(attach, clock)
        : kind.startsWith("roar")
          ? new BattleRoarPops(attach, clock)
          : Klass
            ? new Klass(attach, clock)
            : new CommonFlagPops(kind as FlagPopKind, attach, clock);
    try {
        if (layer instanceof DeepWoundsPops) await layer.spawn("unit", Number(kind.at(-1)) as 1 | 2 | 3, anchor, 64);
        else if (layer instanceof BattleRoarPops) await layer.spawn(anchor, 64, Number(kind.slice(4)) as 1000 | 1500);
        else await layer.spawn("unit", anchor, 64);
        const pop = root.children[0];
        const sprite = pop.children[0] as Sprite;
        const seen = new Set<Texture>();
        for (now = 0; now < 650; now++) {
            layer.update(now % 2 ? 0 : 1 / 240);
            expect(layer.active).toBe(true);
            seen.add(sprite.texture);
        }
        // Frame views are created once; each must be reached, including the final disappearance cel.
        const views = (layer as unknown as { frames: Texture[] | Map<number, Texture[]> }).frames;
        const frames = views instanceof Map ? views.get(Number(kind.at(-1)))! : views;
        expect(seen.size).toBe(frames.length);
        expect(sprite.texture).toBe(frames.at(-1)!);
        layer.update(0);
        expect(layer.active).toBe(false);
        expect(pop.destroyed).toBe(true);
        expect(art.source.destroyed).toBe(false);
    } finally {
        layer.clear();
        await Promise.resolve();
        load.mockRestore();
        unload.mockRestore();
        root.destroy({ children: true });
        art.destroy(true);
    }
});
