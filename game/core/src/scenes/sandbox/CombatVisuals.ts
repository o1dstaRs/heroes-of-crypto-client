import { Container, Sprite, Text as PixiText, TextStyle, Texture, Rectangle } from "pixi.js";
import { GridSettings, HoCMath, GridMath, UnitProperties, UnitsHolder } from "@heroesofcrypto/common";
import { RenderableUnit } from "../RenderableUnit";
import { images } from "../../generated/image_imports";

export interface ICombatVisualsContext {
    getGridSettings(): GridSettings;
    attachToWorldRoot(obj: Container, zIndex?: number): void;
    getUnitsHolder(): UnitsHolder;
    getSelectedUnitProperties(): UnitProperties | undefined;
    updateSelectedUnitProperties(props: UnitProperties): void;
    setUnitPropertiesUpdateNeeded(needed: boolean): void;
}

interface IFloatingText {
    container: Container;
    age: number;
    life: number;
    startX: number;
    startY: number;
    riseY: number;
    driftX: number;
}

interface IShard {
    sprite: Sprite;
    vx: number;
    vy: number;
    rotSpeed: number;
    delay: number;
    age: number;
    life: number;
    x: number;
    y: number;
}

interface IShatterGroup {
    container: Container;
    shards: IShard[];
}

// Tuning for the floating damage numbers.
const FT_LIFE = 0.8; // seconds on screen
const FT_RISE = 72; // world px the number floats up
const FT_DRIFT = 26; // world px horizontal drift in the hit direction
const FT_POP_DUR = 0.16; // seconds of the spawn "pop"
const FT_START_SCALE = 0.55; // scale the number pops in from
const FT_FADE_IN = 0.1; // seconds to fade in
const FT_FADE_OUT_FROM = 0.62; // fraction of life after which it fades out
const FT_STACK_DIST = 64; // px: numbers closer than this are stacked, not overlapped
const FT_STACK_STEP = 46; // px: vertical gap per stacked number

const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
const easeOutBack = (t: number): number => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

export class CombatVisuals {
    private context: ICombatVisualsContext;
    private floatingTexts: IFloatingText[] = [];
    private shatterGroups: IShatterGroup[] = [];
    public constructor(context: ICombatVisualsContext) {
        this.context = context;
    }
    /** Destroy all floating numbers immediately (e.g. on fight end / restart). */
    public clear(): void {
        for (const ft of this.floatingTexts) {
            ft.container.destroy();
        }
        this.floatingTexts.length = 0;
        for (const group of this.shatterGroups) {
            group.container.destroy({ children: true });
        }
        this.shatterGroups.length = 0;
    }
    public update(dt: number) {
        for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
            const ft = this.floatingTexts[i];
            ft.age += dt;
            const t = ft.age / ft.life;
            if (t >= 1) {
                ft.container.destroy();
                this.floatingTexts.splice(i, 1);
                continue;
            }

            // Decelerating rise + slight horizontal drift (feels like it's thrown up and settles).
            const e = easeOutCubic(t);
            ft.container.x = ft.startX + ft.driftX * e;
            ft.container.y = ft.startY + ft.riseY * e;

            // Spawn "pop" (slight overshoot), preserving the Y-up flip (negative scale.y).
            let scale = 1;
            if (ft.age < FT_POP_DUR) {
                scale = FT_START_SCALE + (1 - FT_START_SCALE) * easeOutBack(ft.age / FT_POP_DUR);
            }
            ft.container.scale.set(scale, -scale);

            // Fade in quickly, hold, then fade out smoothly.
            let alpha = 1;
            if (ft.age < FT_FADE_IN) {
                alpha = ft.age / FT_FADE_IN;
            } else if (t > FT_FADE_OUT_FROM) {
                alpha = 1 - (t - FT_FADE_OUT_FROM) / (1 - FT_FADE_OUT_FROM);
            }
            ft.container.alpha = Math.max(0, Math.min(1, alpha));
        }

        this.stepShatters(dt);
    }
    /**
     * "Broken mirror" death effect: slice the unit's current texture into a grid of shards that
     * start in place (composing the unit image), then burst outward, fall, spin, and fade.
     */
    public spawnShatter(info: { texture: Texture; x: number; y: number; scaleX: number; scaleY: number }): void {
        const tex = info.texture;
        const source = tex?.source;
        const frame = tex?.frame;
        if (!source || !frame || frame.width <= 1 || frame.height <= 1) return;

        const COLS = 6;
        const ROWS = 6;
        const tileTexW = frame.width / COLS;
        const tileTexH = frame.height / ROWS;
        const worldW = Math.abs(info.scaleX) * frame.width;
        const worldH = Math.abs(info.scaleY) * frame.height;
        const tileWorldW = worldW / COLS;
        const tileWorldH = worldH / ROWS;

        const container = new Container();
        container.visible = true;
        this.context.attachToWorldRoot(container, 4500);

        const group: IShatterGroup = { container, shards: [] };

        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const subTex = new Texture({
                    source,
                    frame: new Rectangle(frame.x + c * tileTexW, frame.y + r * tileTexH, tileTexW, tileTexH),
                });
                const shard = new Sprite(subTex);
                shard.anchor.set(0.5);
                // Same orientation as the dying unit (scaleY carries the y-up flip).
                shard.scale.set(info.scaleX, info.scaleY);
                shard.tint = 0xffffff;
                shard.alpha = 1;
                // Texture row 0 is the top of the image; in world (y-up) that's the top of the
                // rect, so walk rows from the top down to keep the composite upright.
                const sx = info.x - worldW / 2 + (c + 0.5) * tileWorldW;
                const sy = info.y + worldH / 2 - (r + 0.5) * tileWorldH;
                shard.position.set(sx, sy);
                container.addChild(shard);

                // Outward burst from the unit centre + upward pop; pseudo-random per shard so the
                // image "shatters" instead of moving as one block.
                const ox = sx - info.x;
                const oy = sy - info.y;
                const dist = Math.hypot(ox, oy) || 1;
                const speed = 75 + Math.random() * 150 + dist * 0.75;
                const vx = (ox / dist) * speed + (Math.random() - 0.5) * 60;
                const vy = (oy / dist) * speed + 50 + Math.random() * 112; // world +y is up → upward pop
                group.shards.push({
                    sprite: shard,
                    vx,
                    vy,
                    rotSpeed: (Math.random() - 0.5) * 12,
                    delay: Math.random() * 0.04,
                    age: 0,
                    life: 0.4 + Math.random() * 0.2,
                    x: sx,
                    y: sy,
                });
            }
        }
        this.shatterGroups.push(group);
    }
    private stepShatters(dt: number): void {
        const GRAVITY = 325; // world px/s^2 pulling toward screen bottom (world -y)
        const FADE_FROM = 0.6; // start fading each shard past this fraction of its life
        for (let gi = this.shatterGroups.length - 1; gi >= 0; gi--) {
            const group = this.shatterGroups[gi];
            for (let si = group.shards.length - 1; si >= 0; si--) {
                const s = group.shards[si];
                s.age += dt;
                if (s.age < s.delay) continue;
                const tt = s.age - s.delay;
                s.vy -= GRAVITY * dt;
                s.x += s.vx * dt;
                s.y += s.vy * dt;
                s.sprite.position.set(s.x, s.y);
                s.sprite.rotation += s.rotSpeed * dt;
                const lifeT = tt / s.life;
                if (lifeT >= 1) {
                    s.sprite.destroy();
                    group.shards.splice(si, 1);
                } else if (lifeT > FADE_FROM) {
                    s.sprite.alpha = 1 - (lifeT - FADE_FROM) / (1 - FADE_FROM);
                }
            }
            if (group.shards.length === 0) {
                group.container.destroy();
                this.shatterGroups.splice(gi, 1);
            }
        }
    }
    public showFloatingDamage(
        pos: HoCMath.XY,
        amount: number,
        direction?: HoCMath.XY,
        unitsDied?: number,
        fill = "#ff3333",
        stroke = "#4a0000",
    ): void {
        const container = new Container();

        // 1. Damage Text
        const textStyle = new TextStyle({
            fontFamily: "Arial",
            fontSize: 60,
            fontWeight: "900",
            fill,
            stroke: { color: stroke, width: 5 },
            dropShadow: {
                color: "#000000",
                blur: 4,
                angle: Math.PI / 6,
                distance: 2,
            },
        });

        const damageText = new PixiText({ text: `-${amount}`, style: textStyle });
        damageText.anchor.set(0.5);
        container.addChild(damageText);

        // 2. Skull + Count if units died
        if (unitsDied && unitsDied > 0) {
            const skullTex = Texture.from(images.skull || "/skull.webp");
            const skullSprite = new Sprite(skullTex);
            skullSprite.anchor.set(0.5);
            skullSprite.width = 40;
            skullSprite.height = 40;

            const countStyle = new TextStyle({
                fontFamily: "Arial",
                fontSize: 40,
                fontWeight: "bold",
                fill: "#ffffff",
                stroke: { color: "#000000", width: 4 },
            });
            const countText = new PixiText({ text: `${unitsDied}`, style: countStyle });
            countText.anchor.set(0.5);

            const lineY = 55;
            skullSprite.position.set(-25, lineY);
            countText.position.set(25, lineY);

            container.addChild(skullSprite, countText);
        }

        // Anti-overlap: if numbers are already floating near this spot, stack this one
        // above them instead of drawing on top.
        const baseX = pos.x;
        const baseY = pos.y + 20;
        let stack = 0;
        for (const other of this.floatingTexts) {
            const dx = other.container.x - baseX;
            const dy = other.container.y - baseY;
            if (dx * dx + dy * dy < FT_STACK_DIST * FT_STACK_DIST) stack++;
        }

        const startX = baseX;
        const startY = baseY + stack * FT_STACK_STEP;

        // Mostly-upward float with a small horizontal drift in the hit direction.
        let driftX = 0;
        if (direction) {
            const len = Math.sqrt(direction.x * direction.x + direction.y * direction.y);
            if (len > 0.001) driftX = (direction.x / len) * FT_DRIFT;
        }
        // Slight alternating fan so stacked numbers don't form a rigid column.
        if (stack > 0) driftX += (stack % 2 === 0 ? 1 : -1) * 10 * stack;

        // Initial transform; update() animates the pop/rise/fade from here.
        container.scale.set(FT_START_SCALE, -FT_START_SCALE);
        container.alpha = 0;
        container.position.set(startX, startY);

        this.context.attachToWorldRoot(container, 2000);

        this.floatingTexts.push({
            container,
            age: 0,
            life: FT_LIFE,
            startX,
            startY,
            riseY: FT_RISE,
            driftX,
        });
    }
    public showDamageVisualsFromDiff(
        preState: Map<string, { hp: number; amount: number }>,
        attackerCell?: HoCMath.XY,
        ignoredUnitIds?: Set<string>,
        forcedDirection?: HoCMath.XY,
    ): void {
        const gs = this.context.getGridSettings();
        const unitsHolder = this.context.getUnitsHolder();

        for (const [id, oldState] of preState) {
            if (ignoredUnitIds && ignoredUnitIds.has(id)) {
                console.log(`[DEBUG] showDamageVisualsFromDiff: Ignoring ${id}`);
                continue;
            } else if (ignoredUnitIds) {
                console.log(
                    `[DEBUG] showDamageVisualsFromDiff: Processing ${id} (Not in ignored: ${Array.from(ignoredUnitIds).join(",")})`,
                );
            }

            const u = unitsHolder.getAllUnits().get(id);
            if (!u) continue;

            const newTotal = u.getCumulativeHp();

            if (newTotal < oldState.hp) {
                const diff = oldState.hp - newTotal;
                const unitsDied = Math.max(0, oldState.amount - u.getAmountAlive());

                let direction: HoCMath.XY | undefined = forcedDirection;
                if (!direction && attackerCell) {
                    const attPos = GridMath.getPositionForCell(
                        attackerCell,
                        gs.getMinX(),
                        gs.getStep(),
                        gs.getHalfStep(),
                    );
                    if (attPos) {
                        const center = u instanceof RenderableUnit ? u.getVisualCenter(gs) : u.getPosition();
                        direction = { x: center.x - attPos.x, y: center.y - attPos.y };
                    }
                }

                const center = u instanceof RenderableUnit ? u.getVisualCenter(gs) : u.getPosition();
                // console.log(`[DEBUG] showDamageVisualsFromDiff: Showing damage for ${id}, diff=${diff}`);
                this.showFloatingDamage(center, diff, direction, unitsDied);

                // UI Update logic
                const sc_selectedUnitProperties = this.context.getSelectedUnitProperties();
                if (sc_selectedUnitProperties && sc_selectedUnitProperties.id === id) {
                    this.context.updateSelectedUnitProperties({ ...u.getUnitProperties() });
                    this.context.setUnitPropertiesUpdateNeeded(true);
                }
            }
        }
    }
    public captureHealthState(): Map<string, { hp: number; maxHp: number; amount: number; pos: HoCMath.XY }> {
        const m = new Map<string, { hp: number; maxHp: number; amount: number; pos: HoCMath.XY }>();
        const units = this.context.getUnitsHolder().getAllUnits().values();
        for (const u of units) {
            m.set(u.getId(), {
                hp: u.getHp(),
                maxHp: u.getMaxHp(),
                amount: u.getAmountAlive(),
                pos: { ...u.getPosition() },
            });
        }
        return m;
    }
}
