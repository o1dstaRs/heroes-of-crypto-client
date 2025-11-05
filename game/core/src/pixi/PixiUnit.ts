/*
 * -----------------------------------------------------------------------------
 * Pixi-only replacement for RenderableUnit (no Box2D, no custom WebGL Sprite).
 * -----------------------------------------------------------------------------
 */

import Denque from "denque";
import {
    HoCLib,
    UnitProperties,
    GridSettings,
    HoCMath,
    UnitType,
    TeamType,
    FactionType,
    ToFactionType,
    AllFactionsType,
    HoCConfig,
    AbilityFactory,
    SpellHelper,
    EffectFactory,
    ISceneLog,
    HoCConstants,
    Unit,
} from "@heroesofcrypto/common";

import { Container, Sprite as PixiSprite, Texture } from "pixi.js";
import { DAMAGE_ANIMATION_TICKS, MAX_FPS, RESURRECTION_ANIMATION_TICKS } from "../statics";
import { PixiRenderableSpell } from "../spells/renderable_spell"; // <- use the Pixi version you created

type DigitTextureMap = Map<number, Texture>;

interface IDamageTaken {
    animationTicks: number;
    unitsDied: number;
}

export class PixiUnit extends Unit {
    // Timing/state
    protected readonly sceneStepCount: HoCLib.RefNumber;
    protected lastKnownTick = 0;
    protected readonly damageAnimationTicks: Denque<IDamageTaken> = new Denque<IDamageTaken>();
    protected resurrectionAnimationTick = 0;
    // NEW: a dedicated container that holds this unit’s sprites
    private readonly container: Container;

    // Pixi visuals
    private readonly layer: Container;
    private readonly smallSprite: PixiSprite;
    private readonly tagSprite: PixiSprite;
    private readonly hourglassSprite: PixiSprite;
    private readonly stopSprite: PixiSprite;

    // Digits
    private readonly digitNormalTextures: DigitTextureMap;
    private readonly digitDamageTextures: DigitTextureMap;
    private readonly digitScrollTextures: DigitTextureMap;

    // Spell textures bag (by key name)
    private readonly textures: Record<string, Texture>;

    protected constructor(
        unitProperties: UnitProperties,
        gridSettings: GridSettings,
        teamType: TeamType,
        unitType: UnitType,
        abilityFactory: AbilityFactory,
        effectFactory: EffectFactory,
        summoned: boolean,
        sceneStepCount: HoCLib.RefNumber,
        layer: Container,
        textures: Record<string, Texture>,
        digitNormalTextures: DigitTextureMap,
        digitDamageTextures: DigitTextureMap,
        digitScrollTextures: DigitTextureMap,
        smallSprite: PixiSprite,
        tagSprite: PixiSprite,
        hourglassSprite: PixiSprite,
        stopSprite: PixiSprite,
    ) {
        super(unitProperties, gridSettings, teamType, unitType, abilityFactory, effectFactory, summoned);

        this.sceneStepCount = sceneStepCount;
        this.layer = layer;
        this.container = new Container();
        this.layer.addChild(this.container);
        this.textures = textures;

        this.digitNormalTextures = digitNormalTextures;
        this.digitDamageTextures = digitDamageTextures;
        this.digitScrollTextures = digitScrollTextures;

        this.smallSprite = smallSprite;
        this.tagSprite = tagSprite;
        this.hourglassSprite = hourglassSprite;
        this.stopSprite = stopSprite;

        for (const s of [this.smallSprite, this.tagSprite, this.hourglassSprite, this.stopSprite]) {
            if (!s.parent) this.container.addChild(s); // CHANGED: was this.layer.addChild(s)
        }
    }

    public getContainer(): Container {
        return this.container;
    }

    public static createRenderableUnit(
        unitProperties: UnitProperties,
        gridSettings: GridSettings,
        teamType: TeamType,
        unitType: UnitType,
        abilityFactory: AbilityFactory,
        effectFactory: EffectFactory,
        summoned: boolean,
        sceneStepCount: HoCLib.RefNumber,
        layer: Container,
        textures: Record<string, Texture>,
        digitNormalTextures: DigitTextureMap,
        digitDamageTextures: DigitTextureMap,
        digitScrollTextures: DigitTextureMap,
        smallSprite: PixiSprite,
        tagSprite: PixiSprite,
        hourglassSprite: PixiSprite,
        stopSprite: PixiSprite,
    ): PixiUnit {
        const u = new PixiUnit(
            unitProperties,
            gridSettings,
            teamType,
            unitType,
            abilityFactory,
            effectFactory,
            summoned,
            sceneStepCount,
            layer,
            textures,
            digitNormalTextures,
            digitDamageTextures,
            digitScrollTextures,
            smallSprite,
            tagSprite,
            hourglassSprite,
            stopSprite,
        );
        u.parseSpells();
        return u;
    }

    // ---------------- Spells ----------------

    public getHoveredSpell(mousePosition: HoCMath.XY): PixiRenderableSpell | undefined {
        for (const s of this.spells) {
            const pr = s as PixiRenderableSpell;
            if (pr.isHover(mousePosition, this.getStackPower())) return pr;
        }
        return undefined;
    }

    public renderSpells(pageNumber: number): void {
        const windowLeft = (pageNumber - 1) * 6;
        const windowRight = windowLeft + 6;
        let bookPosition = 1;
        const rendered: number[] = [];

        for (let i = windowLeft; i < windowRight; i++) {
            if (i in this.spells && this.spells[i]) {
                (this.spells[i] as PixiRenderableSpell).renderOnPage(bookPosition++, this.getStackPower());
                rendered.push(i);
            }
        }

        for (let i = 0; i < this.spells.length; i++) {
            if (!rendered.includes(i)) {
                (this.spells[i] as PixiRenderableSpell).cleanupPagePosition();
            }
        }
    }

    protected parseSpells(): void {
        const spells: Map<string, number> = this.parseSpellData(this.unitProperties.spells);
        const newSpells: PixiRenderableSpell[] = [];

        for (const [k, v] of spells.entries()) {
            const spArr = k.split(":");
            if (spArr.length !== 2) continue;

            const faction = ToFactionType[spArr[0] as AllFactionsType] ?? FactionType.NO_TYPE;
            if (faction === undefined) continue;

            const spellName = spArr[1];
            const spellProperties = HoCConfig.getSpellConfig(faction, spellName);
            const textureNames = SpellHelper.spellToTextureNames(spellName);
            const [iconKey, titleKey] = textureNames;

            const iconTex = this.textures[iconKey];
            const titleTex = this.textures[titleKey];
            const bgTex = this.textures["spell_cell_260"];
            const stackGreen = this.textures["stack_green"];
            const stackRed = this.textures["stack_red"];

            if (!iconTex || !titleTex || !bgTex) continue;

            // Create a small local layer for the spell UI elements (you can pass a shared UI layer instead)
            const uiLayer = this.layer;

            newSpells.push(
                new PixiRenderableSpell(
                    { spellProperties, amount: v },
                    uiLayer,
                    { spell_cell_260: bgTex, stack_green: stackGreen, stack_red: stackRed },
                    iconTex,
                    titleTex,
                    this.digitScrollTextures,
                ),
            );
        }

        this.spells = newSpells;
    }

    // ---------------- Frame update / rendering ----------------

    public updateTick(currentTick: number): void {
        this.lastKnownTick = currentTick;
    }

    public isAnimatingMovement(): boolean {
        return false;
    }

    public render(fps: number, isDamageAnimationLocked: boolean, sceneLog: ISceneLog) {
        this.lastKnownTick = Math.max(this.sceneStepCount.getValue(), this.lastKnownTick);

        if (this.lastKnownTick < this.resurrectionAnimationTick) return;

        if (this.resurrectionAnimationTick) {
            sceneLog.updateLog(`${this.getName()} resurrected as ${this.getAmountAlive()}`);
            this.resurrectionAnimationTick = 0;
        }

        const halfUnitStep = this.isSmallSize() ? this.gridSettings.getHalfStep() : this.gridSettings.getStep();
        const fourthUnitStep = this.isSmallSize()
            ? this.gridSettings.getQuarterStep()
            : this.gridSettings.getHalfStep();
        const fullUnitStep = this.isSmallSize() ? this.gridSettings.getStep() : this.gridSettings.getTwoSteps();

        const spritePositionX = this.renderPosition.x - halfUnitStep;
        const spritePositionY = this.renderPosition.y - halfUnitStep;

        // Main unit sprite
        this.smallSprite.x = spritePositionX;
        this.smallSprite.y = spritePositionY;
        this.smallSprite.width = fullUnitStep;
        this.smallSprite.height = fullUnitStep;
        this.smallSprite.alpha = this.hasBuffActive("Hidden") ? 0.6 : 1;
        this.smallSprite.visible = true;

        const damageEntry = this.damageAnimationTicks.pop();
        let finishDamageTick = damageEntry?.animationTicks;

        const sixthStep = fullUnitStep / 6;
        const fifthStep = fullUnitStep / 5;

        if (isDamageAnimationLocked || !finishDamageTick || this.sceneStepCount.getValue() > finishDamageTick) {
            this.renderAmountSprites(
                this.digitNormalTextures,
                this.unitProperties.amount_alive,
                this.renderPosition,
                halfUnitStep,
                fifthStep,
                sixthStep,
            );
            if (isDamageAnimationLocked && damageEntry) {
                this.damageAnimationTicks.push({
                    animationTicks: this.sceneStepCount.getValue() + DAMAGE_ANIMATION_TICKS,
                    unitsDied: damageEntry?.unitsDied ?? 0,
                });
            }
        } else {
            const ratioToMaxFps = Math.floor(MAX_FPS / fps);
            if (ratioToMaxFps) finishDamageTick -= Math.sqrt(ratioToMaxFps - 1);

            const unitsDied = damageEntry?.unitsDied ?? 0;

            this.damageAnimationTicks.push({
                animationTicks: finishDamageTick,
                unitsDied,
            });

            if (unitsDied) {
                this.renderAmountSprites(
                    this.digitDamageTextures,
                    unitsDied,
                    this.renderPosition,
                    halfUnitStep,
                    fifthStep,
                    sixthStep,
                );
            } else {
                const texture = this.digitNormalTextures.get(-1);
                if (texture) {
                    const len = this.unitProperties.amount_alive.toString().length;
                    for (let i = 1; i <= len; i++) {
                        const sprite = new PixiSprite(texture);
                        sprite.x = this.renderPosition.x + halfUnitStep - sixthStep * i;
                        sprite.y = this.renderPosition.y - halfUnitStep;
                        sprite.width = sixthStep;
                        sprite.height = fifthStep;
                        this.layer.addChild(sprite);
                    }
                }
            }
        }

        if (!damageEntry || (damageEntry && !isDamageAnimationLocked)) {
            if (this.responded) {
                this.tagSprite.x = this.renderPosition.x + halfUnitStep - fourthUnitStep;
                this.tagSprite.y = this.renderPosition.y - fourthUnitStep - 6;
                this.tagSprite.width = fourthUnitStep;
                this.tagSprite.height = fourthUnitStep;
                this.tagSprite.visible = true;
            } else {
                this.tagSprite.visible = false;
            }

            if (this.isSkippingThisTurn()) {
                this.stopSprite.x = this.renderPosition.x + halfUnitStep - fourthUnitStep;
                this.stopSprite.y = this.renderPosition.y;
                this.stopSprite.width = fourthUnitStep;
                this.stopSprite.height = fourthUnitStep;
                this.stopSprite.visible = true;

                this.hourglassSprite.visible = false;
            } else if (this.onHourglass) {
                this.hourglassSprite.x = this.renderPosition.x + halfUnitStep - fourthUnitStep;
                this.hourglassSprite.y = this.renderPosition.y;
                this.hourglassSprite.width = fourthUnitStep;
                this.hourglassSprite.height = fourthUnitStep;
                this.hourglassSprite.visible = true;

                this.stopSprite.visible = false;
            } else {
                this.stopSprite.visible = false;
                this.hourglassSprite.visible = false;
            }
        }
    }

    public handleResurrectionAnimation(): void {
        this.resurrectionAnimationTick = Math.max(
            this.resurrectionAnimationTick,
            this.lastKnownTick + RESURRECTION_ANIMATION_TICKS,
        );
    }

    // ---------------- Ability description refresh (unchanged logic) ----------------

    protected refreshAbilitiesDescriptions(_synergyAbilityPowerIncrease: number): void {
        // Heavy Armor
        const heavyArmorAbility = this.getAbility("Heavy Armor");
        if (heavyArmorAbility) {
            const percentage = Number(
                (
                    ((heavyArmorAbility.getPower() + this.getLuck() + _synergyAbilityPowerIncrease) /
                        100 /
                        HoCConstants.MAX_UNIT_STACK_POWER) *
                    this.getStackPower() *
                    100
                ).toFixed(2),
            );
            this.refreshAbiltyDescription(
                heavyArmorAbility.getName(),
                heavyArmorAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Lightning Spin
        const lightningSpinAbility = this.getAbility("Lightning Spin");
        if (lightningSpinAbility) {
            const percentage = Number(
                (this.calculateAbilityMultiplier(lightningSpinAbility, _synergyAbilityPowerIncrease) * 100).toFixed(2),
            );
            this.refreshAbiltyDescription(
                lightningSpinAbility.getName(),
                lightningSpinAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Fire Breath
        const fireBreathAbility = this.getAbility("Fire Breath");
        if (fireBreathAbility) {
            const percentage = Number(
                (this.calculateAbilityMultiplier(fireBreathAbility, _synergyAbilityPowerIncrease) * 100).toFixed(2),
            );
            this.refreshAbiltyDescription(
                fireBreathAbility.getName(),
                fireBreathAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Skewer Strike
        const skewerStrikeAbility = this.getAbility("Skewer Strike");
        if (skewerStrikeAbility) {
            const percentage = Number(
                (this.calculateAbilityMultiplier(skewerStrikeAbility, _synergyAbilityPowerIncrease) * 100).toFixed(2),
            );
            this.refreshAbiltyDescription(
                skewerStrikeAbility.getName(),
                skewerStrikeAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Fire Shield
        const fireShieldAbility = this.getAbility("Fire Shield");
        if (fireShieldAbility) {
            const percentage = Number(
                (this.calculateAbilityMultiplier(fireShieldAbility, _synergyAbilityPowerIncrease) * 100).toFixed(2),
            );
            this.refreshAbiltyDescription(
                fireShieldAbility.getName(),
                fireShieldAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Backstab
        const backstabAbility = this.getAbility("Backstab");
        if (backstabAbility) {
            const percentage =
                Number(
                    (this.calculateAbilityMultiplier(backstabAbility, _synergyAbilityPowerIncrease) * 100).toFixed(2),
                ) - 100;
            this.refreshAbiltyDescription(
                backstabAbility.getName(),
                backstabAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Stun
        const stunAbility = this.getAbility("Stun");
        if (stunAbility) {
            const percentage = Number(
                this.calculateAbilityApplyChance(stunAbility, _synergyAbilityPowerIncrease).toFixed(2),
            );
            this.refreshAbiltyDescription(
                stunAbility.getName(),
                stunAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Double Punch
        const doublePunchAbility = this.getAbility("Double Punch");
        if (doublePunchAbility) {
            const percentage = Number(
                (this.calculateAbilityMultiplier(doublePunchAbility, _synergyAbilityPowerIncrease) * 100).toFixed(2),
            );
            this.refreshAbiltyDescription(
                doublePunchAbility.getName(),
                doublePunchAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Piercing Spear
        const piercingSpearAbility = this.getAbility("Piercing Spear");
        if (piercingSpearAbility) {
            const percentage = Number(
                (this.calculateAbilityMultiplier(piercingSpearAbility, _synergyAbilityPowerIncrease) * 100).toFixed(2),
            );
            this.refreshAbiltyDescription(
                piercingSpearAbility.getName(),
                piercingSpearAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Boost Health
        const boostHealthAbility = this.getAbility("Boost Health");
        if (boostHealthAbility) {
            const percentage = Number(
                (this.calculateAbilityMultiplier(boostHealthAbility, _synergyAbilityPowerIncrease) * 100).toFixed(2),
            );
            this.refreshAbiltyDescription(
                boostHealthAbility.getName(),
                boostHealthAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Double Shot
        const doubleShotAbility = this.getAbility("Double Shot");
        if (doubleShotAbility) {
            const percentage = Number(
                (this.calculateAbilityMultiplier(doubleShotAbility, _synergyAbilityPowerIncrease) * 100).toFixed(2),
            );
            this.refreshAbiltyDescription(
                doubleShotAbility.getName(),
                doubleShotAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Blindness
        const blindnessAbility = this.getAbility("Blindness");
        if (blindnessAbility) {
            const percentage = Number(
                this.calculateAbilityApplyChance(blindnessAbility, _synergyAbilityPowerIncrease).toFixed(2),
            );
            this.refreshAbiltyDescription(
                blindnessAbility.getName(),
                blindnessAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Sharpened Weapons Aura
        const sharpenedWeaponsAuraAbility = this.getAbility("Sharpened Weapons Aura");
        if (sharpenedWeaponsAuraAbility) {
            const percentage = Number(
                (
                    this.calculateAbilityMultiplier(sharpenedWeaponsAuraAbility, _synergyAbilityPowerIncrease) * 100 -
                    100
                ).toFixed(2),
            );
            this.refreshAbiltyDescription(
                sharpenedWeaponsAuraAbility.getName(),
                sharpenedWeaponsAuraAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // War Anger Aura
        const warAngerAuraAbility = this.getAbility("War Anger Aura");
        if (warAngerAuraAbility) {
            const percentage =
                Number(
                    (this.calculateAbilityMultiplier(warAngerAuraAbility, _synergyAbilityPowerIncrease) * 100).toFixed(
                        2,
                    ),
                ) - 100;
            this.refreshAbiltyDescription(
                warAngerAuraAbility.getName(),
                warAngerAuraAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Arrows Wingshield Aura
        const arrowsWingshieldAuraAbility = this.getAbility("Arrows Wingshield Aura");
        if (arrowsWingshieldAuraAbility) {
            const percentage =
                Number(
                    (
                        this.calculateAbilityMultiplier(arrowsWingshieldAuraAbility, _synergyAbilityPowerIncrease) * 100
                    ).toFixed(2),
                ) - 100;
            this.refreshAbiltyDescription(
                arrowsWingshieldAuraAbility.getName(),
                arrowsWingshieldAuraAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Limited Supply
        const limitedSupplyAbility = this.getAbility("Limited Supply");
        if (limitedSupplyAbility) {
            const percentage = Number(
                ((this.getStackPower() / HoCConstants.MAX_UNIT_STACK_POWER) * limitedSupplyAbility.getPower()).toFixed(
                    2,
                ),
            );
            this.refreshAbiltyDescription(
                limitedSupplyAbility.getName(),
                limitedSupplyAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Boar Saliva
        const boarSalivaAbility = this.getAbility("Boar Saliva");
        if (boarSalivaAbility) {
            const percentage = Number(
                this.calculateAbilityApplyChance(boarSalivaAbility, _synergyAbilityPowerIncrease).toFixed(2),
            );
            this.refreshAbiltyDescription(
                boarSalivaAbility.getName(),
                boarSalivaAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Aggr
        const aggrAbility = this.getAbility("Aggr");
        if (aggrAbility) {
            const percentage = Number(
                this.calculateAbilityApplyChance(aggrAbility, _synergyAbilityPowerIncrease).toFixed(2),
            );
            this.refreshAbiltyDescription(
                aggrAbility.getName(),
                aggrAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Wardguard
        const wardguardAbility = this.getAbility("Wardguard");
        if (wardguardAbility) {
            const percentage = Number(
                this.calculateAbilityApplyChance(wardguardAbility, _synergyAbilityPowerIncrease).toFixed(2),
            );
            this.refreshAbiltyDescription(
                wardguardAbility.getName(),
                wardguardAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Magic Shield
        const magicShieldAbility = this.getAbility("Magic Shield");
        if (magicShieldAbility) {
            const percentage = Number(
                this.calculateAbilityApplyChance(magicShieldAbility, _synergyAbilityPowerIncrease).toFixed(2),
            );
            this.refreshAbiltyDescription(
                magicShieldAbility.getName(),
                magicShieldAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Dodge
        const dodgeAbility = this.getAbility("Dodge");
        if (dodgeAbility) {
            const percentage = Number(
                this.calculateAbilityApplyChance(dodgeAbility, _synergyAbilityPowerIncrease).toFixed(2),
            );
            this.refreshAbiltyDescription(
                dodgeAbility.getName(),
                dodgeAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Small Specie
        const smallSpecieAbility = this.getAbility("Small Specie");
        if (smallSpecieAbility) {
            const percentage = Number(
                this.calculateAbilityApplyChance(smallSpecieAbility, _synergyAbilityPowerIncrease).toFixed(2),
            );
            this.refreshAbiltyDescription(
                smallSpecieAbility.getName(),
                smallSpecieAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Absorb Penalties Aura
        const absorbPenaltiesAuraAbility = this.getAbility("Absorb Penalties Aura");
        if (absorbPenaltiesAuraAbility) {
            const percentage = Number(
                (
                    this.calculateAbilityMultiplier(absorbPenaltiesAuraAbility, _synergyAbilityPowerIncrease) * 100
                ).toFixed(2),
            );
            this.refreshAbiltyDescription(
                absorbPenaltiesAuraAbility.getName(),
                absorbPenaltiesAuraAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Petrifying Gaze
        const petrifyingGazeAbility = this.getAbility("Petrifying Gaze");
        if (petrifyingGazeAbility) {
            const percentage = Number(
                this.calculateAbilityApplyChance(petrifyingGazeAbility, _synergyAbilityPowerIncrease).toFixed(2),
            );
            this.refreshAbiltyDescription(
                petrifyingGazeAbility.getName(),
                petrifyingGazeAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Spit Ball
        const spitBallAbility = this.getAbility("Spit Ball");
        if (spitBallAbility) {
            const percentage = Number(
                this.calculateAbilityApplyChance(spitBallAbility, _synergyAbilityPowerIncrease).toFixed(2),
            );
            this.refreshAbiltyDescription(
                spitBallAbility.getName(),
                spitBallAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Large Caliber
        const largeCaliberAbility = this.getAbility("Large Caliber");
        if (largeCaliberAbility) {
            const percentage = Number(
                (this.calculateAbilityMultiplier(largeCaliberAbility, _synergyAbilityPowerIncrease) * 100).toFixed(2),
            );
            this.refreshAbiltyDescription(
                largeCaliberAbility.getName(),
                largeCaliberAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Area Throw
        const areaThrowAbility = this.getAbility("Area Throw");
        if (areaThrowAbility) {
            const percentage = Number(
                (this.calculateAbilityMultiplier(areaThrowAbility, _synergyAbilityPowerIncrease) * 100).toFixed(2),
            );
            this.refreshAbiltyDescription(
                areaThrowAbility.getName(),
                areaThrowAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Through Shot
        const throughShotAbility = this.getAbility("Through Shot");
        if (throughShotAbility) {
            const percentage = Number(
                (this.calculateAbilityMultiplier(throughShotAbility, _synergyAbilityPowerIncrease) * 100).toFixed(2),
            );
            this.refreshAbiltyDescription(
                throughShotAbility.getName(),
                throughShotAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Sky Runner
        const skyRunnerAbility = this.getAbility("Sky Runner");
        if (skyRunnerAbility) {
            this.refreshAbiltyDescription(
                skyRunnerAbility.getName(),
                skyRunnerAbility
                    .getDesc()
                    .join("\n")
                    .replace(
                        /\{\}/g,
                        this.calculateAbilityCount(skyRunnerAbility, _synergyAbilityPowerIncrease).toString(),
                    ),
            );
        }

        // Lucky Strike
        const luckyStrikeAbility = this.getAbility("Lucky Strike");
        if (luckyStrikeAbility) {
            const percentage =
                Number(
                    (this.calculateAbilityMultiplier(luckyStrikeAbility, _synergyAbilityPowerIncrease) * 100).toFixed(
                        2,
                    ),
                ) - 100;
            this.refreshAbiltyDescription(
                luckyStrikeAbility.getName(),
                luckyStrikeAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Shatter Armor
        const shatterArmorAbility = this.getAbility("Shatter Armor");
        if (shatterArmorAbility) {
            this.refreshAbiltyDescription(
                shatterArmorAbility.getName(),
                shatterArmorAbility
                    .getDesc()
                    .join("\n")
                    .replace(
                        /\{\}/g,
                        this.calculateAbilityCount(shatterArmorAbility, _synergyAbilityPowerIncrease).toString(),
                    ),
            );
        }

        // Rapid Charge
        const rapidChargeAbility = this.getAbility("Rapid Charge");
        if (rapidChargeAbility) {
            const percentage =
                Number(
                    (this.calculateAbilityMultiplier(rapidChargeAbility, _synergyAbilityPowerIncrease) * 100).toFixed(
                        2,
                    ),
                ) - 100;
            this.refreshAbiltyDescription(
                rapidChargeAbility.getName(),
                rapidChargeAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Wolf Trail Aura
        const wolfTrailAuraEffect = this.getAuraEffect("Wolf Trail");
        if (wolfTrailAuraEffect) {
            const auraEffect = this.effectFactory.makeAuraEffect("Wolf Trail");
            if (auraEffect) {
                this.refreshAbiltyDescription(
                    "Wolf Trail Aura",
                    wolfTrailAuraEffect
                        .getDesc()
                        .replace(/\{\}/g, this.calculateAuraPower(auraEffect, _synergyAbilityPowerIncrease).toString()),
                );
            }
        }

        // Penetrating Bite
        const penetratingBiteAbility = this.getAbility("Penetrating Bite");
        if (penetratingBiteAbility) {
            const percentage =
                Number(
                    (
                        this.calculateAbilityMultiplier(penetratingBiteAbility, _synergyAbilityPowerIncrease) * 100
                    ).toFixed(2),
                ) - 100;
            this.refreshAbiltyDescription(
                penetratingBiteAbility.getName(),
                penetratingBiteAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Pegasus Light
        const pegasusLightAbility = this.getAbility("Pegasus Light");
        if (pegasusLightAbility) {
            const percentage = Number(
                this.calculateAbilityApplyChance(pegasusLightAbility, _synergyAbilityPowerIncrease).toFixed(2),
            );
            this.refreshAbiltyDescription(
                pegasusLightAbility.getName(),
                pegasusLightAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Paralysis
        const paralysisAbility = this.getAbility("Paralysis");
        if (paralysisAbility) {
            const description = paralysisAbility.getDesc().join("\n");
            const reduction = this.calculateAbilityApplyChance(paralysisAbility, _synergyAbilityPowerIncrease);
            const chance = Math.min(100, reduction * 2);
            const updatedDescription = description
                .replace("{}", Number(chance.toFixed(2)).toString())
                .replace("{}", Number(reduction.toFixed(2)).toString());
            this.refreshAbiltyDescription(paralysisAbility.getName(), updatedDescription);
        }

        // Deep Wounds Level 1
        const deepWoundsLevel1Ability = this.getAbility("Deep Wounds Level 1");
        if (deepWoundsLevel1Ability) {
            this.refreshAbiltyDescription(
                deepWoundsLevel1Ability.getName(),
                deepWoundsLevel1Ability
                    .getDesc()
                    .join("\n")
                    .replace(
                        /\{\}/g,
                        this.calculateAbilityCount(deepWoundsLevel1Ability, _synergyAbilityPowerIncrease).toString(),
                    ),
            );
        }

        // Deep Wounds Level 2
        const deepWoundsLevel2Ability = this.getAbility("Deep Wounds Level 2");
        if (deepWoundsLevel2Ability) {
            this.refreshAbiltyDescription(
                deepWoundsLevel2Ability.getName(),
                deepWoundsLevel2Ability
                    .getDesc()
                    .join("\n")
                    .replace(
                        /\{\}/g,
                        this.calculateAbilityCount(deepWoundsLevel2Ability, _synergyAbilityPowerIncrease).toString(),
                    ),
            );
        }

        // Deep Wounds Level 3
        const deepWoundsLevel3Ability = this.getAbility("Deep Wounds Level 3");
        if (deepWoundsLevel3Ability) {
            this.refreshAbiltyDescription(
                deepWoundsLevel3Ability.getName(),
                deepWoundsLevel3Ability
                    .getDesc()
                    .join("\n")
                    .replace(
                        /\{\}/g,
                        this.calculateAbilityCount(deepWoundsLevel3Ability, _synergyAbilityPowerIncrease).toString(),
                    ),
            );
        }

        // Blind Fury
        const blindFuryAbility = this.getAbility("Blind Fury");
        if (blindFuryAbility) {
            this.refreshAbiltyDescription(
                blindFuryAbility.getName(),
                blindFuryAbility
                    .getDesc()
                    .join("\n")
                    .replace(
                        /\{\}/g,
                        (
                            (1 -
                                this.unitProperties.amount_alive /
                                    (this.unitProperties.amount_alive + this.unitProperties.amount_died)) *
                            100
                        ).toFixed(1),
                    ),
            );
        }

        // Miner
        const minerAbility = this.getAbility("Miner");
        if (minerAbility) {
            this.refreshAbiltyDescription(
                minerAbility.getName(),
                minerAbility
                    .getDesc()
                    .join("\n")
                    .replace(
                        /\{\}/g,
                        this.calculateAbilityCount(minerAbility, _synergyAbilityPowerIncrease).toString(),
                    ),
            );
        }

        // Chain Lightning
        const chainLightningAbility = this.getAbility("Chain Lightning");
        if (chainLightningAbility) {
            const percentage =
                this.calculateAbilityMultiplier(chainLightningAbility, _synergyAbilityPowerIncrease) * 100;
            const description = chainLightningAbility.getDesc().join("\n");
            const updatedDescription = description
                .replace("{}", Number(percentage.toFixed()).toString())
                .replace("{}", Number(((percentage * 7) / 8).toFixed()).toString())
                .replace("{}", Number(((percentage * 6) / 8).toFixed()).toString())
                .replace("{}", Number(((percentage * 5) / 8).toFixed()).toString());
            this.refreshAbiltyDescription(chainLightningAbility.getName(), updatedDescription);
        }

        // Crusade
        const crusadeAbility = this.getAbility("Crusade");
        if (crusadeAbility) {
            this.refreshAbiltyDescription(
                crusadeAbility.getName(),
                crusadeAbility
                    .getDesc()
                    .join("\n")
                    .replace(
                        /\{\}/g,
                        Number(
                            this.calculateAbilityCount(crusadeAbility, _synergyAbilityPowerIncrease).toFixed(2),
                        ).toString(),
                    ),
            );
        }

        // Dulling Defense
        const dullingDefenseAbility = this.getAbility("Dulling Defense");
        if (dullingDefenseAbility) {
            this.refreshAbiltyDescription(
                dullingDefenseAbility.getName(),
                dullingDefenseAbility
                    .getDesc()
                    .join("\n")
                    .replace(
                        /\{\}/g,
                        Number(
                            this.calculateAbilityCount(dullingDefenseAbility, _synergyAbilityPowerIncrease).toFixed(1),
                        ).toString(),
                    ),
            );
        }

        // Devour Essence
        const devourEssenceAbility = this.getAbility("Devour Essence");
        if (devourEssenceAbility) {
            const percentage = Number(
                this.calculateAbilityApplyChance(devourEssenceAbility, _synergyAbilityPowerIncrease).toFixed(2),
            );
            this.refreshAbiltyDescription(
                devourEssenceAbility.getName(),
                devourEssenceAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }
    }

    private refreshAbiltyDescription(abilityName: string, abilityDescription: string): void {
        if (
            this.unitProperties.abilities.length === this.unitProperties.abilities_descriptions.length &&
            this.unitProperties.abilities.length === this.unitProperties.abilities_stack_powered.length &&
            this.unitProperties.abilities.length === this.unitProperties.abilities_auras.length
        ) {
            for (let i = 0; i < this.unitProperties.abilities.length; i++) {
                if (
                    this.unitProperties.abilities[i] === abilityName &&
                    (this.unitProperties.abilities_stack_powered[i] || abilityName === "Blind Fury")
                ) {
                    this.unitProperties.abilities_descriptions[i] = abilityDescription;
                }
            }
        }
    }

    protected handleDamageAnimation(unitsDied: number): void {
        const damageTakenEntry = this.damageAnimationTicks.peekFront();
        const nextAnimationTick = damageTakenEntry?.animationTicks ?? 0;
        this.damageAnimationTicks.unshift({
            animationTicks: Math.max(this.sceneStepCount.getValue(), nextAnimationTick) + DAMAGE_ANIMATION_TICKS,
            unitsDied,
        });
    }

    protected renderAmountSprites(
        digitTextures: DigitTextureMap,
        amountToRender: number,
        position: HoCMath.XY,
        halfUnitStep: number,
        fifthStep: number,
        sixthStep: number,
    ): void {
        const isDamage = digitTextures === this.digitDamageTextures;
        let n = amountToRender;
        const sprites: PixiSprite[] = [];

        if (n < 10) {
            const tex = digitTextures.get(n);
            if (tex) sprites.push(new PixiSprite(tex));
        } else {
            while (n) {
                const digit = n % 10;
                const tex = digitTextures.get(digit);
                if (tex) sprites.push(new PixiSprite(tex));
                n = Math.floor(n / 10);
            }
        }

        if (isDamage) {
            const dash = digitTextures.get(-1);
            if (dash) sprites.push(new PixiSprite(dash));
        }

        let i = 1;
        for (const s of sprites) {
            s.x = position.x + halfUnitStep - sixthStep * i++;
            s.y = position.y - halfUnitStep;
            s.width = sixthStep;
            s.height = fifthStep;
            this.layer.addChild(s);
        }
    }

    // ---------------- Migration stubs (to keep old call sites compiling) ----------------

    /** @deprecated Box2D removed in Pixi version. Always returns undefined. */
    public getBodyDef(): undefined {
        return undefined;
    }
    /** @deprecated Box2D removed in Pixi version. Always returns undefined. */
    public getFixtureDef(): undefined {
        return undefined;
    }
    /** @deprecated Box2D removed in Pixi version. Use Pixi overlays instead. */
    public getHpBarBoundFixtureDefs(): unknown[] {
        // HP bars are rendered visually in Pixi (if you need them back, draw with Graphics).
        return [];
    }
    /** @deprecated Box2D removed in Pixi version. Use Pixi overlays instead. */
    public getHpBarFixtureDefs(): unknown[] {
        return [];
    }
}
