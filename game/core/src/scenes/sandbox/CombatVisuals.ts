import { Container, Sprite, Text as PixiText, TextStyle, Texture } from "pixi.js";
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
    life: number;
    maxLife: number;
    startY: number;
    startX: number;
    velX: number;
    velY: number;
}

export class CombatVisuals {
    private context: ICombatVisualsContext;
    private floatingTexts: IFloatingText[] = [];
    public constructor(context: ICombatVisualsContext) {
        this.context = context;
    }
    public update(dt: number) {
        // Update floating texts
        for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
            const ft = this.floatingTexts[i];
            ft.life -= dt;
            if (ft.life <= 0) {
                ft.container.destroy();
                this.floatingTexts.splice(i, 1);
                continue;
            }

            // Animate
            const t = 1 - ft.life / ft.maxLife;
            ft.container.x = ft.startX + ft.velX * t;
            ft.container.y = ft.startY + ft.velY * t;

            // Fade out
            ft.container.alpha = Math.min(1, ft.life * 2);
        }
    }
    public showFloatingDamage(pos: HoCMath.XY, amount: number, direction?: HoCMath.XY, unitsDied?: number): void {
        const container = new Container();

        // 1. Damage Text
        const textStyle = new TextStyle({
            fontFamily: "Arial",
            fontSize: 60,
            fontWeight: "900",
            fill: "#ff3333",
            stroke: { color: "#4a0000", width: 5 },
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

        // Correct for Y-Up world
        container.scale.y = -1;
        container.position.set(pos.x, pos.y + 20);

        this.context.attachToWorldRoot(container, 2000);

        // Velocity
        let vx = 0;
        let vy = 80;

        if (direction) {
            const len = Math.sqrt(direction.x * direction.x + direction.y * direction.y);
            if (len > 0.001) {
                vx = (direction.x / len) * 80;
                vy = (direction.y / len) * 80;
            }
        }

        this.floatingTexts.push({
            container,
            life: 1.5,
            maxLife: 1.5,
            startY: pos.y + 20,
            startX: pos.x,
            velX: vx,
            velY: vy,
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
