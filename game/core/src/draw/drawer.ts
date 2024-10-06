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

import {
    b2Body,
    b2BodyDef,
    b2BodyType,
    b2CircleShape,
    b2Color,
    b2Draw,
    b2Fixture,
    b2Vec2,
    b2World,
    XY,
} from "@box2d/core";
import { Grid, GridType, GridMath, GridSettings, ObstacleType, Unit, UnitsHolder } from "@heroesofcrypto/common";

import { Obstacle } from "../obstacles/obstacle";
import { ObstacleGenerator } from "../obstacles/obstacle_generator";
import {
    MAX_FPS,
    MAX_HOLE_LAYERS,
    MOUNTAIN_ENLARGE_DOUBLE_X,
    MOUNTAIN_ENLARGE_DOUBLE_Y,
    MOUNTAIN_ENLARGE_X,
    MOUNTAIN_ENLARGE_Y,
} from "../statics";
import { DefaultShader } from "../utils/gl/defaultShader";
import { PreloadedTextures } from "../utils/gl/preload";
import { Sprite } from "../utils/gl/Sprite";
import { BULLET_ANIMATION_SPEED, FLY_ANIMATION_SPEED, MOVE_ANIMATION_SPEED } from "./animation_settings";

export interface IBullet {
    body: b2Body;
    fixture: b2Fixture;
    fromPosition: XY;
    toPosition: XY;
    nextEnemyPosition: XY;
    nextEnemyCellIndices: number[];
}

interface IDrawablePosition {
    position: XY;
    size: number;
}

interface IFlyingUnit {
    body: b2Body;
    unit: Unit;
    targetPosition: XY;
}

export class Drawer {
    public static COLOR_ORANGE = new b2Color(0.909803921568627, 0.282352941176471, 0.203921568627451);
    public static COLOR_YELLOW = new b2Color(1, 0.952941176470588, 0.427450980392157);
    public static COLOR_GREY = new b2Color(0.5, 0.5, 0.5);
    public static COLOR_LIGHT_GREY = new b2Color(0.847058823529412, 0.847058823529412, 0.847058823529412);
    public static COLOR_LIGHT_ORANGE = new b2Color(0.968627450980392, 0.745098039215686, 0.427450980392157);
    public static COLOR_LIGHT_YELLOW = new b2Color(1, 1, 0.749019607843137);
    public static COLOR_RED = new b2Color(1, 0, 0);
    public static COLOR_GREEN = new b2Color(0, 1, 0);

    private readonly grid: Grid;

    private readonly gridSettings: GridSettings;

    private readonly world: b2World;

    private readonly gl: WebGLRenderingContext;

    private readonly shader: DefaultShader;

    private readonly textures: PreloadedTextures;

    private readonly holeLayersSprites: Sprite[] = new Array(MAX_HOLE_LAYERS);

    private terrainObstacles: Obstacle[] = [];

    private readonly obstacleGenerator: ObstacleGenerator;

    private animating: boolean;

    private animatingDoubleShot: boolean;

    private onlyUniqueBulletSourcesRemaining: boolean;

    private moveAnimationPath?: XY[];

    private moveAnimationIndex = 0;

    private moveAnimationBody?: b2Body;

    private moveAnimationUnit?: Unit;

    private bullets?: IBullet[];

    private holeLayers = 0;

    private flyingUnits: IFlyingUnit[];

    public constructor(
        grid: Grid,
        world: b2World,
        gl: WebGLRenderingContext,
        shader: DefaultShader,
        textures: PreloadedTextures,
        obstacleGenerator: ObstacleGenerator,
    ) {
        this.grid = grid;
        this.world = world;
        this.gl = gl;
        this.shader = shader;
        this.textures = textures;
        this.animating = false;
        this.animatingDoubleShot = false;
        this.onlyUniqueBulletSourcesRemaining = false;
        this.obstacleGenerator = obstacleGenerator;
        this.gridSettings = this.grid.getSettings();
        this.initHoleLayers(gl, shader);
        this.flyingUnits = [];
    }

    public setGridType(gridType: GridType): void {
        const centerY = this.gridSettings.getMaxY() >> 1;
        if (gridType === GridType.WATER_CENTER) {
            this.terrainObstacles = [
                this.obstacleGenerator.generateWater(
                    this.gl,
                    this.shader,
                    {
                        x: -this.gridSettings.getTwoSteps(),
                        y: centerY - this.gridSettings.getTwoSteps(),
                    },
                    this.gridSettings.getFourSteps(),
                    this.gridSettings.getFourSteps(),
                ),
            ];
        } else if (gridType === GridType.LAVA_CENTER) {
            this.terrainObstacles = [
                this.obstacleGenerator.generateLava(
                    this.gl,
                    this.shader,
                    {
                        x: -this.gridSettings.getTwoSteps(),
                        y: centerY - this.gridSettings.getTwoSteps(),
                    },
                    this.gridSettings.getFourSteps(),
                    this.gridSettings.getFourSteps(),
                ),
            ];
        } else if (gridType === GridType.BLOCK_CENTER) {
            this.terrainObstacles = [
                this.obstacleGenerator.generateMountain(
                    this.gl,
                    this.shader,
                    {
                        x: -this.gridSettings.getTwoSteps() - MOUNTAIN_ENLARGE_X,
                        y: centerY - this.gridSettings.getTwoSteps() - MOUNTAIN_ENLARGE_Y,
                    },
                    this.gridSettings.getFourSteps() + MOUNTAIN_ENLARGE_DOUBLE_X,
                    this.gridSettings.getFourSteps() + MOUNTAIN_ENLARGE_DOUBLE_Y,
                    this.gridSettings.getTwoSteps(),
                    this.gridSettings.getTwoSteps(),
                    MOUNTAIN_ENLARGE_X,
                    MOUNTAIN_ENLARGE_Y,
                ),
            ];
        } else {
            this.terrainObstacles = [];
        }
    }

    private initHoleLayers(gl: WebGLRenderingContext, shader: DefaultShader) {
        this.holeLayersSprites[0] = new Sprite(gl, shader, this.textures.spacehole_1.texture);
        this.holeLayersSprites[1] = new Sprite(gl, shader, this.textures.spacehole_2.texture);
        this.holeLayersSprites[2] = new Sprite(gl, shader, this.textures.spacehole_3.texture);
        this.holeLayersSprites[3] = new Sprite(gl, shader, this.textures.spacehole_4.texture);
        this.holeLayersSprites[4] = new Sprite(gl, shader, this.textures.spacehole_5.texture);

        let i = 0;
        while (i < MAX_HOLE_LAYERS) {
            this.holeLayersSprites[i++].setRect(
                this.gridSettings.getMinX(),
                this.gridSettings.getMinY(),
                this.gridSettings.getMaxY(),
                this.gridSettings.getMaxY(),
            );
        }
    }

    public switchToDryCenter(): void {
        for (const to of this.terrainObstacles) {
            if (to.getType() === ObstacleType.WATER) {
                to.setLightSprite(new Sprite(this.gl, this.shader, this.textures.water_dry_256.texture));
                to.setDarkSprite(new Sprite(this.gl, this.shader, this.textures.water_dry_256.texture));
            } else if (to.getType() === ObstacleType.LAVA) {
                to.setLightSprite(new Sprite(this.gl, this.shader, this.textures.lava_frozen_256.texture));
                to.setDarkSprite(new Sprite(this.gl, this.shader, this.textures.lava_frozen_256.texture));
            }
        }
    }

    private flyUnits(fps: number) {
        if (!this.flyingUnits.length) {
            return;
        }

        const newFlyingUnits: IFlyingUnit[] = [];
        const ratioToMaxFps = MAX_FPS / fps;
        this.flyingUnits.forEach((flyingUnit: IFlyingUnit) => {
            const moveAnimationBody = flyingUnit.body;
            let allSet = true;
            const movingTarget = flyingUnit.targetPosition;
            const calculatedUpdateSpeed = ratioToMaxFps * FLY_ANIMATION_SPEED;
            let nextX = moveAnimationBody.GetPosition().x;
            let nextY = moveAnimationBody.GetPosition().y;
            if (Math.abs(movingTarget.x - moveAnimationBody.GetPosition().x) > this.gridSettings.getMovementDelta()) {
                if (movingTarget.x > moveAnimationBody.GetPosition().x) {
                    nextX += calculatedUpdateSpeed;
                    if (nextX > movingTarget.x) {
                        nextX = movingTarget.x;
                    }
                    allSet = false;
                } else if (movingTarget.x < moveAnimationBody.GetPosition().x) {
                    nextX -= calculatedUpdateSpeed;
                    if (nextX < movingTarget.x) {
                        nextX = movingTarget.x;
                    }
                    allSet = false;
                }
            } else {
                nextX = movingTarget.x;
            }
            if (Math.abs(movingTarget.y - moveAnimationBody.GetPosition().y) > this.gridSettings.getMovementDelta()) {
                if (movingTarget.y > moveAnimationBody.GetPosition().y) {
                    nextY += calculatedUpdateSpeed;
                    if (nextY > movingTarget.y) {
                        nextY = movingTarget.y;
                    }
                    allSet = false;
                } else if (movingTarget.y < moveAnimationBody.GetPosition().y) {
                    nextY -= calculatedUpdateSpeed;
                    if (nextY < movingTarget.y) {
                        nextY = movingTarget.y;
                    }
                    allSet = false;
                }
            } else {
                nextY = movingTarget.y;
            }
            moveAnimationBody.SetTransformXY(nextX, nextY, moveAnimationBody.GetAngle());
            flyingUnit.unit.setRenderPosition(nextX, nextY);
            if (!allSet) {
                newFlyingUnits.push(flyingUnit);
            }
        });
        this.flyingUnits = newFlyingUnits;
    }

    private moveUnit(fps: number) {
        const ratioToMaxFps = MAX_FPS / fps;
        if (
            !this.moveAnimationBody ||
            !this.moveAnimationUnit ||
            !this.moveAnimationPath?.length ||
            this.moveAnimationIndex >= this.moveAnimationPath.length ||
            this.flyingUnits?.length
        ) {
            return;
        }

        const isSmallUnit = this.moveAnimationUnit.isSmallSize();

        const movingTarget = GridMath.getPositionForCell(
            this.moveAnimationPath[this.moveAnimationIndex],
            this.gridSettings.getMinX(),
            this.gridSettings.getStep(),
            this.gridSettings.getHalfStep(),
        );
        if (!isSmallUnit) {
            movingTarget.x -= this.gridSettings.getHalfStep();
            movingTarget.y -= this.gridSettings.getHalfStep();
        }
        let allSet = true;
        if (movingTarget) {
            const calculatedUpdateSpeed = ratioToMaxFps * MOVE_ANIMATION_SPEED;
            let nextX = this.moveAnimationBody.GetPosition().x;
            let nextY = this.moveAnimationBody.GetPosition().y;
            if (
                Math.abs(movingTarget.x - this.moveAnimationBody.GetPosition().x) > this.gridSettings.getMovementDelta()
            ) {
                if (movingTarget.x > this.moveAnimationBody.GetPosition().x) {
                    nextX += calculatedUpdateSpeed;
                    if (nextX > movingTarget.x) {
                        nextX = movingTarget.x;
                    }
                    allSet = false;
                } else if (movingTarget.x < this.moveAnimationBody.GetPosition().x) {
                    nextX -= calculatedUpdateSpeed;
                    if (nextX < movingTarget.x) {
                        nextX = movingTarget.x;
                    }
                    allSet = false;
                }
            } else {
                nextX = movingTarget.x;
            }
            if (
                Math.abs(movingTarget.y - this.moveAnimationBody.GetPosition().y) > this.gridSettings.getMovementDelta()
            ) {
                if (movingTarget.y > this.moveAnimationBody.GetPosition().y) {
                    nextY += calculatedUpdateSpeed;
                    if (nextY > movingTarget.y) {
                        nextY = movingTarget.y;
                    }
                    allSet = false;
                } else if (movingTarget.y < this.moveAnimationBody.GetPosition().y) {
                    nextY -= calculatedUpdateSpeed;
                    if (nextY < movingTarget.y) {
                        nextY = movingTarget.y;
                    }
                    allSet = false;
                }
            } else {
                nextY = movingTarget.y;
            }
            this.moveAnimationBody.SetTransformXY(nextX, nextY, this.moveAnimationBody.GetAngle());
            this.moveAnimationUnit.setRenderPosition(nextX, nextY);
        }
        if (allSet) {
            this.moveAnimationIndex++;
        }
    }

    private moveBullets(fps: number): void {
        if (this.bullets?.length) {
            const ratioToMaxFps = MAX_FPS / fps;
            const calculatedUpdateSpeed = ratioToMaxFps * BULLET_ANIMATION_SPEED;
            const bulletsToDestroy: IBullet[] = [];
            const bullets: IBullet[] = [];

            const fromPositionKeys: string[] = [];

            let onlyUniqueBulletSourcesRemaining = true;

            for (const b of this.bullets) {
                const fromPositionKey = `${b.fromPosition.x}:${b.fromPosition.y}`;

                if (fromPositionKeys.includes(fromPositionKey)) {
                    bullets.push(b);
                    this.animatingDoubleShot = true;
                    onlyUniqueBulletSourcesRemaining = false;
                    continue;
                }

                fromPositionKeys.push(fromPositionKey);

                try {
                    const body = b.fixture.GetBody();
                    const direction = new b2Vec2();
                    b2Vec2.Subtract(b.toPosition, b.fromPosition, direction);
                    const distance = b2Vec2.Distance(b.fromPosition, b.toPosition);

                    const move = new b2Vec2();
                    b2Vec2.Scale(1 / distance, direction, move);

                    body.SetTransformXY(
                        body.GetPosition().x + move.x * calculatedUpdateSpeed,
                        body.GetPosition().y + move.y * calculatedUpdateSpeed,
                        body.GetAngle(),
                    );

                    const bodyCell = GridMath.getCellForPosition(this.gridSettings, body.GetPosition());
                    if (!bodyCell) {
                        bulletsToDestroy.push(b);
                        continue;
                    }

                    const toPositionCell = GridMath.getCellForPosition(this.gridSettings, b.toPosition);
                    const bodyCellIndex = (bodyCell.x << 4) | bodyCell.y;

                    if (
                        (toPositionCell && bodyCell.x === toPositionCell.x && bodyCell.y === toPositionCell.y) ||
                        b.nextEnemyCellIndices.includes(bodyCellIndex) ||
                        body.GetPosition().x < this.gridSettings.getMinX() ||
                        body.GetPosition().y < this.gridSettings.getMinY() ||
                        body.GetPosition().x >= this.gridSettings.getMaxX() ||
                        body.GetPosition().y >= this.gridSettings.getMaxY()
                    ) {
                        bulletsToDestroy.push(b);
                    } else {
                        bullets.push(b);
                    }
                } catch (e) {
                    console.error((e as Error).stack);
                }
            }

            this.onlyUniqueBulletSourcesRemaining = onlyUniqueBulletSourcesRemaining;

            for (const b of bulletsToDestroy) {
                try {
                    this.world.DestroyBody(b.body);
                } catch (e) {
                    console.error((e as Error).stack);
                }
            }

            this.bullets = bullets;
        }
    }

    public setHoleLayers(numberOfLayers: number): void {
        if (numberOfLayers > 0 && numberOfLayers <= MAX_HOLE_LAYERS) {
            this.holeLayers = numberOfLayers;
        }
    }

    public isAnimating(): boolean {
        return (
            (this.animating && !this.animatingDoubleShot) ||
            (this.animating && this.animatingDoubleShot && !this.onlyUniqueBulletSourcesRemaining)
        );
    }

    public startMoveAnimation(body: b2Body, unit: Unit, path: XY[]): void {
        this.moveAnimationBody = body;
        this.moveAnimationUnit = unit;
        this.moveAnimationPath = path;
        this.moveAnimationIndex = 1;
        this.animating = true;
        this.animatingDoubleShot = false;
        this.onlyUniqueBulletSourcesRemaining = false;
    }

    public startFlyAnimation(body: b2Body, unit: Unit, targetPosition: XY): void {
        this.animating = true;
        this.flyingUnits.push({ body, unit, targetPosition });
    }

    public startBulletAnimation(fromPosition: XY, toPosition: XY, affectedUnit: Unit): void {
        const shape = new b2CircleShape(16);

        const bodyDef: b2BodyDef = {
            type: b2BodyType.b2_staticBody,
            position: fromPosition,
            bullet: true,
        };

        const body = this.world.CreateBody(bodyDef);

        const fixture = body.CreateFixture({
            shape,
            isSensor: true,
        });

        if (!this.bullets) {
            this.bullets = [];
        }

        let cells: XY[];
        if (affectedUnit.isSmallSize()) {
            const cell = GridMath.getCellForPosition(this.gridSettings, affectedUnit.getPosition());
            if (cell) {
                cells = [cell];
            } else {
                cells = [];
            }
        } else {
            cells = GridMath.getCellsAroundPosition(this.gridSettings, affectedUnit.getPosition());
        }

        const nextEnemyCellIndices: number[] = [];
        for (const c of cells) {
            nextEnemyCellIndices.push((c.x << 4) | c.y);
        }

        this.bullets.push({
            body,
            fixture,
            fromPosition,
            toPosition,
            nextEnemyPosition: affectedUnit.getPosition(),
            nextEnemyCellIndices,
        });
        this.animating = true;
    }

    public drawPath(
        draw: b2Draw,
        color: b2Color,
        currentActivePath?: XY[],
        currentActiveUnitPositions?: XY[],
        hoverAttackFromHashes?: Set<number>,
        drawSolid = true,
    ): void {
        if (currentActivePath?.length) {
            for (const p of currentActivePath) {
                const movePosition = GridMath.getPositionForCell(
                    p,
                    this.gridSettings.getMinX(),
                    this.gridSettings.getStep(),
                    this.gridSettings.getHalfStep(),
                );

                if (
                    hoverAttackFromHashes?.has((p.x << 4) | p.y) ||
                    GridMath.hasXY(movePosition, currentActiveUnitPositions)
                ) {
                    continue;
                }

                const polygonStartingPosition: XY = {
                    x: movePosition.x - this.gridSettings.getHalfStep(),
                    y: movePosition.y - this.gridSettings.getHalfStep(),
                };
                const newX = polygonStartingPosition.x + this.gridSettings.getStep();
                const newY = polygonStartingPosition.y + this.gridSettings.getStep();
                if (drawSolid) {
                    draw.DrawSolidPolygon(
                        [
                            { x: polygonStartingPosition.x, y: polygonStartingPosition.y },
                            { x: polygonStartingPosition.x, y: newY },
                            { x: newX, y: newY },
                            { x: newX, y: polygonStartingPosition.y },
                        ],
                        4,
                        color,
                    );
                } else {
                    draw.DrawPolygon(
                        [
                            { x: polygonStartingPosition.x, y: polygonStartingPosition.y },
                            { x: polygonStartingPosition.x, y: newY },
                            { x: newX, y: newY },
                            { x: newX, y: polygonStartingPosition.y },
                        ],
                        4,
                        color,
                    );
                    draw.DrawPolygon(
                        [
                            { x: polygonStartingPosition.x + 1, y: polygonStartingPosition.y + 1 },
                            { x: polygonStartingPosition.x + 1, y: newY + 1 },
                            { x: newX + 1, y: newY + 1 },
                            { x: newX + 1, y: polygonStartingPosition.y + 1 },
                        ],
                        4,
                        color,
                    );
                    draw.DrawPolygon(
                        [
                            { x: polygonStartingPosition.x - 1, y: polygonStartingPosition.y - 1 },
                            { x: polygonStartingPosition.x - 1, y: newY - 1 },
                            { x: newX - 1, y: newY - 1 },
                            { x: newX - 1, y: polygonStartingPosition.y - 1 },
                        ],
                        4,
                        color,
                    );
                }
            }
        }
    }

    public animate(fps: number): void {
        if (
            this.moveAnimationPath &&
            (this.moveAnimationIndex >= this.moveAnimationPath.length || this.moveAnimationIndex <= 0)
        ) {
            this.moveAnimationIndex = 0;
            this.moveAnimationPath = undefined;
        }

        if (!this.moveAnimationPath && !this.bullets?.length && !this.flyingUnits?.length) {
            this.animating = false;
            this.animatingDoubleShot = false;
            this.onlyUniqueBulletSourcesRemaining = false;
            return;
        }

        this.moveBullets(fps);

        if (!this.moveAnimationPath && !this.bullets?.length && !this.flyingUnits?.length) {
            this.animating = false;
            this.animatingDoubleShot = false;
            this.onlyUniqueBulletSourcesRemaining = false;
            return;
        }

        this.moveUnit(fps);
        this.flyUnits(fps);
    }

    public drawAOECells(draw: b2Draw, unitsHolder: UnitsHolder, hoverAOECells?: XY[]): void {
        if (!hoverAOECells?.length) {
            return;
        }

        const drawablePositions: IDrawablePosition[] = [];
        const cellKeys: number[] = [];

        for (const c of hoverAOECells) {
            const cellPosition = GridMath.getPositionForCell(
                c,
                this.gridSettings.getMinX(),
                this.gridSettings.getStep(),
                this.gridSettings.getHalfStep(),
            );

            if (!cellPosition) {
                continue;
            }

            const cellKey = (c.x << 4) | c.y;
            if (cellKeys.includes(cellKey)) {
                continue;
            }

            const occupantId = this.grid.getOccupantUnitId(c);

            if (occupantId) {
                const occupantUnit = unitsHolder.getAllUnits().get(occupantId);
                if (!occupantUnit) {
                    continue;
                }

                for (const oc of occupantUnit.getCells()) {
                    // const occupantCellPosition = GridMath.getPositionForCell(
                    //     oc,
                    //     this.gridSettings.getMinX(),
                    //     this.gridSettings.getStep(),
                    //     this.gridSettings.getHalfStep(),
                    // );
                    const occupantCellKey = (oc.x << 4) | oc.y;

                    // if (occupantCellPosition && !cellKeys.includes(occupantCellKey)) {
                    if (!cellKeys.includes(occupantCellKey)) {
                        cellKeys.push(occupantCellKey);
                    }
                }

                const baseCell = occupantUnit.getBaseCell();
                if (!baseCell) {
                    continue;
                }

                const baseCellPosition = GridMath.getPositionForCell(
                    baseCell,
                    this.gridSettings.getMinX(),
                    this.gridSettings.getStep(),
                    this.gridSettings.getHalfStep(),
                );

                if (!baseCellPosition) {
                    continue;
                }

                drawablePositions.push({
                    position: {
                        x: baseCellPosition.x - (occupantUnit.isSmallSize() ? 0 : this.gridSettings.getHalfStep()),
                        y: baseCellPosition.y - (occupantUnit.isSmallSize() ? 0 : this.gridSettings.getHalfStep()),
                    },
                    size: occupantUnit.getSize(),
                });

                continue;
            }

            drawablePositions.push({ position: cellPosition, size: 1 });
            cellKeys.push(cellKey);
        }

        for (const p of drawablePositions) {
            if (p.size <= 2 && p.size >= 1) {
                this.drawAttackTo(draw, p.position, p.size);
            }
        }
    }

    public drawAttackTo(draw: b2Draw, targetPisition: XY, size: number): void {
        const sizeSteps = size * this.gridSettings.getStep();
        const sizeHalfSteps = size * this.gridSettings.getHalfStep();

        const polygonStartingPosition: XY = {
            x: targetPisition.x - sizeHalfSteps,
            y: targetPisition.y - sizeHalfSteps,
        };
        const newX = polygonStartingPosition.x + sizeSteps;
        const newY = polygonStartingPosition.y + sizeSteps;
        draw.DrawSolidPolygon(
            [
                { x: polygonStartingPosition.x, y: polygonStartingPosition.y },
                { x: polygonStartingPosition.x, y: newY },
                { x: newX, y: newY },
                { x: newX, y: polygonStartingPosition.y },
            ],
            4,
            new b2Color(1, 0.5, 0.5),
        );
    }

    public drawHoverArea(draw: b2Draw, isLightMode: boolean, area: XY[]): void {
        if (area.length !== 2) {
            return;
        }

        const start = area[0];
        const end = area[1];

        const color = isLightMode ? new b2Color(0, 0, 0, 0.8) : new b2Color(1, 1, 1, 0.8);
        draw.DrawSolidPolygon(
            [
                { x: start.x, y: start.y },
                { x: start.x, y: end.y },
                { x: end.x, y: end.y },
                { x: end.x, y: start.y },
            ],
            4,
            color,
        );
    }

    public drawAuraArea(draw: b2Draw, position: XY, range: number, isBuff: boolean, isSmallUnit: boolean = true): void {
        const step = isSmallUnit ? this.gridSettings.getHalfStep() : this.gridSettings.getStep();
        const start = {
            x: position.x - range - step,
            y: position.y - range - step,
        };
        const end = {
            x: position.x + range + step,
            y: position.y + range + step,
        };
        draw.DrawPolygon(
            [
                { x: start.x, y: start.y },
                { x: start.x, y: end.y },
                { x: end.x, y: end.y },
                { x: end.x, y: start.y },
            ],
            4,
            isBuff ? Drawer.COLOR_GREEN : Drawer.COLOR_RED,
        );
        const startOffset = {
            x: position.x - range - step - 1,
            y: position.y - range - step - 1,
        };
        const endOffset = {
            x: position.x + range + step + 1,
            y: position.y + range + step + 1,
        };
        draw.DrawPolygon(
            [
                { x: startOffset.x, y: startOffset.y },
                { x: startOffset.x, y: endOffset.y },
                { x: endOffset.x, y: endOffset.y },
                { x: endOffset.x, y: startOffset.y },
            ],
            4,
            isBuff ? Drawer.COLOR_GREEN : Drawer.COLOR_RED,
        );
    }

    public drawHighlightedCells(draw: b2Draw, isLightMode: boolean, cells?: XY[]): void {
        if (!cells?.length) {
            return;
        }

        const color = isLightMode ? Drawer.COLOR_LIGHT_ORANGE : Drawer.COLOR_LIGHT_YELLOW;

        for (const cell of cells) {
            const position = GridMath.getPositionForCell(
                cell,
                this.gridSettings.getMinX(),
                this.gridSettings.getStep(),
                this.gridSettings.getHalfStep(),
            );

            const polygonStartingPosition: XY = {
                x: position.x - this.gridSettings.getHalfStep(),
                y: position.y - this.gridSettings.getHalfStep(),
            };

            draw.DrawSolidPolygon(
                [
                    { x: polygonStartingPosition.x, y: polygonStartingPosition.y },
                    { x: polygonStartingPosition.x, y: polygonStartingPosition.y + this.gridSettings.getStep() },
                    {
                        x: polygonStartingPosition.x + this.gridSettings.getStep(),
                        y: polygonStartingPosition.y + this.gridSettings.getStep(),
                    },
                    { x: polygonStartingPosition.x + this.gridSettings.getStep(), y: polygonStartingPosition.y },
                ],
                4,
                color,
            );
        }
    }

    public drawHoverCells(
        draw: b2Draw,
        isLightMode: boolean,
        cells?: XY[],
        hoverSelectedCellsSwitchToRed = false,
    ): void {
        if (cells?.length) {
            let minX = Number.MAX_SAFE_INTEGER;
            let maxX = Number.MIN_SAFE_INTEGER;
            let minY = Number.MAX_SAFE_INTEGER;
            let maxY = Number.MIN_SAFE_INTEGER;

            let color: b2Color;
            if (hoverSelectedCellsSwitchToRed && cells.length !== 4) {
                color = new b2Color(1, 0.5, 0.5);
            } else {
                color = isLightMode ? new b2Color(0, 0, 0, 0.8) : new b2Color(1, 1, 1, 0.8);
            }

            if (cells.length === 3 || (cells.length === 2 && cells[0].x !== cells[1].x && cells[0].y !== cells[1].y)) {
                for (const cell of cells) {
                    const movePosition = GridMath.getPositionForCell(
                        cell,
                        this.gridSettings.getMinX(),
                        this.gridSettings.getStep(),
                        this.gridSettings.getHalfStep(),
                    );

                    const polygonStartingPosition: XY = {
                        x: movePosition.x - this.gridSettings.getHalfStep(),
                        y: movePosition.y - this.gridSettings.getHalfStep(),
                    };

                    maxX = polygonStartingPosition.x + this.gridSettings.getStep();
                    maxY = polygonStartingPosition.y + this.gridSettings.getStep();

                    draw.DrawSolidPolygon(
                        [
                            { x: polygonStartingPosition.x, y: polygonStartingPosition.y },
                            { x: polygonStartingPosition.x, y: maxY },
                            { x: maxX, y: maxY },
                            { x: maxX, y: polygonStartingPosition.y },
                        ],
                        4,
                        color,
                    );
                }
            } else {
                for (const cell of cells) {
                    const movePosition = GridMath.getPositionForCell(
                        cell,
                        this.gridSettings.getMinX(),
                        this.gridSettings.getStep(),
                        this.gridSettings.getHalfStep(),
                    );

                    const polygonStartingPosition: XY = {
                        x: movePosition.x - this.gridSettings.getHalfStep(),
                        y: movePosition.y - this.gridSettings.getHalfStep(),
                    };

                    minX = Math.min(minX, polygonStartingPosition.x);
                    minY = Math.min(minY, polygonStartingPosition.y);
                    maxX = Math.max(maxX, polygonStartingPosition.x + this.gridSettings.getStep());
                    maxY = Math.max(maxY, polygonStartingPosition.y + this.gridSettings.getStep());
                }

                draw.DrawSolidPolygon(
                    [
                        { x: minX, y: minY },
                        { x: minX, y: maxY },
                        { x: maxX, y: maxY },
                        { x: maxX, y: minY },
                    ],
                    4,
                    color,
                );
            }
        }
    }

    public drawAttackFrom(draw: b2Draw, fromPosition: XY, isSmallUnit = true): void {
        const polygonStartingPosition: XY = {
            x: fromPosition.x - this.gridSettings.getHalfStep() - (isSmallUnit ? 0 : this.gridSettings.getStep()),
            y: fromPosition.y - this.gridSettings.getHalfStep() - (isSmallUnit ? 0 : this.gridSettings.getStep()),
        };
        const newX =
            polygonStartingPosition.x + (isSmallUnit ? this.gridSettings.getStep() : this.gridSettings.getTwoSteps());
        const newY =
            polygonStartingPosition.y + (isSmallUnit ? this.gridSettings.getStep() : this.gridSettings.getTwoSteps());
        draw.DrawSolidPolygon(
            [
                { x: polygonStartingPosition.x, y: polygonStartingPosition.y },
                { x: polygonStartingPosition.x, y: newY },
                { x: newX, y: newY },
                { x: newX, y: polygonStartingPosition.y },
            ],
            4,
            new b2Color(0.5625, 0.9296, 0.5625),
        );
    }

    public renderHole(): void {
        let i = 0;
        while (i < this.holeLayers) {
            if (i in this.holeLayersSprites) {
                this.holeLayersSprites[i].render();
            } else {
                break;
            }

            i++;
        }
    }

    public addTerrainObstacle(obstacle: Obstacle): void {
        this.terrainObstacles.push(obstacle);
    }

    public renderTerrainSpritesBack(isLightMode: boolean): void {
        for (const o of this.terrainObstacles) {
            if (o.getType() !== ObstacleType.BLOCK) {
                o.render(isLightMode);
            }
        }
    }

    public renderTerrainSpritesFront(isLightMode: boolean): void {
        for (const o of this.terrainObstacles) {
            if (o.getType() === ObstacleType.BLOCK) {
                o.render(isLightMode);
            }
        }
    }

    public drawGrid(draw: b2Draw, largeUnitsCache: [Map<number, number[]>, Map<number, number[]>]) {
        const largeUnitsXtoY = largeUnitsCache[0];
        const largeUnitsYtoX = largeUnitsCache[1];
        const mode = localStorage.getItem("joy-mode");
        const color = mode === "light" ? new b2Color(0.2, 0.2, 0.2) : new b2Color(0.8, 0.8, 0.8);
        const positions: XY[] = [];

        // get verticals
        for (
            let newX = this.gridSettings.getMinX() + this.gridSettings.getStep();
            newX < this.gridSettings.getMaxX();
            newX += this.gridSettings.getStep()
        ) {
            let fromY = this.gridSettings.getMinY();
            for (
                let y = this.gridSettings.getMinY();
                y < this.gridSettings.getMaxY();
                y += this.gridSettings.getCellSize()
            ) {
                const possibleUnitXPositions = largeUnitsYtoX.get(y);
                if (possibleUnitXPositions?.length) {
                    for (const px of possibleUnitXPositions) {
                        if (px === newX) {
                            positions.push({ x: newX, y: fromY });
                            positions.push({ x: newX, y: y - this.gridSettings.getStep() });
                            fromY = y + this.gridSettings.getStep();
                        }
                    }
                }
            }
            positions.push({ x: newX, y: fromY });
            positions.push({ x: newX, y: this.gridSettings.getMaxY() });
        }

        // get horizontals
        for (
            let newY = this.gridSettings.getStep();
            newY < this.gridSettings.getMaxY();
            newY += this.gridSettings.getStep()
        ) {
            let fromX = this.gridSettings.getMinX();
            for (
                let x = this.gridSettings.getMinX();
                x < this.gridSettings.getMaxX();
                x += this.gridSettings.getCellSize()
            ) {
                const possibleUnitYPositions = largeUnitsXtoY.get(x);
                if (possibleUnitYPositions?.length) {
                    for (const py of possibleUnitYPositions) {
                        if (py === newY) {
                            positions.push({ x: fromX, y: newY });
                            positions.push({ x: x - this.gridSettings.getStep(), y: newY });
                            fromX = x + this.gridSettings.getStep();
                        }
                    }
                }
            }
            positions.push({ x: fromX, y: newY });
            positions.push({ x: this.gridSettings.getMaxX(), y: newY });
        }

        // draw lines
        let index = 0;
        while (index < positions.length - 1) {
            const p1 = positions[index];
            const p2 = positions[index + 1];
            draw.DrawSegment(p1, p2, color);
            index += 2;
        }
    }
}
