// game/core/src/pixi/PixiObstacleGenerator.ts
import { Container, Sprite as PixiSprite, Texture } from "pixi.js";
import { GridSettings, ObstacleType, HoCMath } from "@heroesofcrypto/common";

import { Obstacle } from "../obstacles/obstacle";
import type { PreloadedPixiTextures } from "../pixi/PixiTextureLoader";

/** Minimal adapter so existing Obstacle works without changing its API */
class PixiSpriteAdapter {
    private sprite: PixiSprite;
    private parent: Container;
    public constructor(parent: Container, texture: Texture) {
        this.parent = parent;
        this.sprite = new PixiSprite(texture);
        this.sprite.visible = false; // becomes visible on first render()
        this.parent.addChild(this.sprite);
    }
    /** Matches old Sprite.setRect(x, y, w, h) */
    public setRect(x: number, y: number, width: number, height: number): void {
        this.sprite.x = x;
        this.sprite.y = y;
        this.sprite.width = width;
        this.sprite.height = height;
    }
    /** Matches old Sprite.render() semantics (noop there, toggle visible here) */
    public render(): void {
        this.sprite.visible = true;
    }
    public setTexture(texture: Texture): void {
        this.sprite.texture = texture;
    }
    public destroy(): void {
        this.sprite.parent?.removeChild(this.sprite);
        this.sprite.destroy();
    }
}

export class PixiObstacleGenerator {
    private readonly textures: PreloadedPixiTextures;
    private readonly gridSettings: GridSettings;
    /** Where to add sprites */
    private readonly terrainBack: Container; // water/lava etc.
    private readonly terrainFront: Container; // mountains/blocks etc.
    public constructor(
        textures: PreloadedPixiTextures,
        gridSettings: GridSettings,
        terrainBack: Container,
        terrainFront: Container,
    ) {
        this.textures = textures;
        this.gridSettings = gridSettings;
        this.terrainBack = terrainBack;
        this.terrainFront = terrainFront;
    }
    /**
     * BLOCK “hole” without physics (keeps parity with old size logic).
     * Old version created a Box2D body; here we only return the Obstacle for rendering/hitbar.
     */
    public generateHole(position: HoCMath.XY, sizePixels: number, _sizeCells: number): Obstacle {
        // No sprites (pure blocking area). Obstacle will still be able to render hitbar if asked.
        return new Obstacle(
            ObstacleType.BLOCK,
            position,
            sizePixels,
            sizePixels,
            this.gridSettings,
            undefined,
            undefined,
            false, // monitorHits
        );
    }
    /** Water center */
    public generateWater(position: HoCMath.XY, sizeX: number, sizeY: number): Obstacle {
        const tex = this.textures.water_256; // Texture directly
        const light = tex ? new PixiSpriteAdapter(this.terrainBack, tex) : undefined;
        const dark = tex ? new PixiSpriteAdapter(this.terrainBack, tex) : undefined;

        if (light) light.setRect(position.x, position.y, sizeX, sizeY);
        if (dark) dark.setRect(position.x, position.y, sizeX, sizeY);

        return new Obstacle(ObstacleType.WATER, position, sizeX, sizeY, this.gridSettings, light, dark);
    }
    /** Lava center */
    public generateLava(position: HoCMath.XY, sizeX: number, sizeY: number): Obstacle {
        const tex = this.textures.lava_256; // Texture directly
        const light = tex ? new PixiSpriteAdapter(this.terrainBack, tex) : undefined;
        const dark = tex ? new PixiSpriteAdapter(this.terrainBack, tex) : undefined;

        if (light) light.setRect(position.x, position.y, sizeX, sizeY);
        if (dark) dark.setRect(position.x, position.y, sizeX, sizeY);

        return new Obstacle(ObstacleType.LAVA, position, sizeX, sizeY, this.gridSettings, light, dark);
    }
    /**
     * Mountain / Block (front layer), with optional “monitorHits” bar rendered by Obstacle.
     * `spriteSizeX/Y` control the sprite’s visual size, while sizeX/Y were the physical hitbox before.
     * We mirror the old argument order for compatibility.
     */
    public generateMountain(
        position: HoCMath.XY,
        spriteSizeX: number,
        spriteSizeY: number,
        _sizeX: number,
        _sizeY: number,
        _spriteEnlargeX: number,
        _spriteEnlargeY: number,
    ): Obstacle {
        const tex = this.textures.mountain_432_412; // Texture directly
        const light = tex ? new PixiSpriteAdapter(this.terrainFront, tex) : undefined;
        const dark = tex ? new PixiSpriteAdapter(this.terrainFront, tex) : undefined;

        if (light) light.setRect(position.x, position.y, spriteSizeX, spriteSizeY);
        if (dark) dark.setRect(position.x, position.y, spriteSizeX, spriteSizeY);

        return new Obstacle(
            ObstacleType.BLOCK,
            position,
            spriteSizeX,
            spriteSizeY,
            this.gridSettings,
            light,
            dark,
            true, // monitorHits — mountains show a hitbar
        );
    }
    /** Optional helpers if you want to swap “dry/frozen” variants later */
    public switchWaterToDry(obstacle: Obstacle): void {
        const dry = this.textures.water_dry_256; // Texture directly
        if (!dry) return;
        const light = new PixiSpriteAdapter(this.terrainBack, dry);
        const dark = new PixiSpriteAdapter(this.terrainBack, dry);
        obstacle.setLightSprite(light);
        obstacle.setDarkSprite(dark);
    }
    public switchLavaToFrozen(obstacle: Obstacle): void {
        const frozen = this.textures.lava_frozen_256; // Texture directly
        if (!frozen) return;
        const light = new PixiSpriteAdapter(this.terrainBack, frozen);
        const dark = new PixiSpriteAdapter(this.terrainBack, frozen);
        obstacle.setLightSprite(light);
        obstacle.setDarkSprite(dark);
    }
}
