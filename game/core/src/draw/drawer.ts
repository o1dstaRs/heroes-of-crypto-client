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

import { GridType } from "../grid/grid";
import { getCellForPosition, getCellsAroundPoint, getPointForCell, hasXY } from "../grid/grid_math";
import { GridSettings } from "../grid/grid_settings";
import { Obstacle, ObstacleType } from "../obstacles/obstacle";
import { ObstacleGenerator } from "../obstacles/obstacle_generator";
import {
    MAX_FPS,
    MAX_HOLE_LAYERS,
    MOUNTAIN_ENLARGE_DOUBLE_X,
    MOUNTAIN_ENLARGE_DOUBLE_Y,
    MOUNTAIN_ENLARGE_X,
    MOUNTAIN_ENLARGE_Y,
} from "../statics";
import { Unit } from "../units/units";
import { DefaultShader } from "../utils/gl/defaultShader";
import { PreloadedTextures } from "../utils/gl/preload";
import { Sprite } from "../utils/gl/Sprite";
import { BULLET_ANIMATION_SPEED, MOVE_ANIMATION_SPEED } from "./animation_settings";

export interface IBullet {
    body: b2Body;
    fixture: b2Fixture;
    fromPosition: XY;
    toPosition: XY;
    nextEnemyPosition: XY;
    nextEnemyCellIndices: number[];
}

export class Drawer {
    private readonly gridSettings: GridSettings;

    private readonly world: b2World;

    private readonly upNextFontWhiteSprite: Sprite;

    private readonly upNextFontBlackSprite: Sprite;

    private readonly holeLayersSprites: Sprite[] = new Array(MAX_HOLE_LAYERS);

    private readonly terrainObstacles: Obstacle[];

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

    public constructor(
        gridSettings: GridSettings,
        world: b2World,
        gl: WebGLRenderingContext,
        shader: DefaultShader,
        textures: PreloadedTextures,
        gridType: GridType,
        obstacleGenerator: ObstacleGenerator,
    ) {
        this.gridSettings = gridSettings;
        this.world = world;
        this.animating = false;
        this.animatingDoubleShot = false;
        this.onlyUniqueBulletSourcesRemaining = false;
        this.upNextFontWhiteSprite = new Sprite(gl, shader, textures.up_next_white_font.texture);
        this.upNextFontBlackSprite = new Sprite(gl, shader, textures.up_next_black_font.texture);

        this.obstacleGenerator = obstacleGenerator;
        this.upNextFontWhiteSprite.setRect(
            gridSettings.getMinX() - gridSettings.getTwoSteps() - 24,
            gridSettings.getTwoSteps() + 16,
            gridSettings.getTwoSteps(),
            gridSettings.getHalfStep(),
        );
        this.upNextFontBlackSprite.setRect(
            gridSettings.getMinX() - gridSettings.getTwoSteps() - 24,
            gridSettings.getTwoSteps() + 16,
            gridSettings.getTwoSteps(),
            gridSettings.getHalfStep(),
        );

        const centerY = this.gridSettings.getMaxY() >> 1;
        if (gridType === GridType.WATER_CENTER) {
            this.terrainObstacles = [
                this.obstacleGenerator.generateWater(
                    gl,
                    shader,
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
                    gl,
                    shader,
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
                    gl,
                    shader,
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
        this.initHoleLayers(gl, shader, textures);
    }

    private initHoleLayers(gl: WebGLRenderingContext, shader: DefaultShader, textures: PreloadedTextures) {
        this.holeLayersSprites[0] = new Sprite(gl, shader, textures.spacehole_1.texture);
        this.holeLayersSprites[1] = new Sprite(gl, shader, textures.spacehole_2.texture);
        this.holeLayersSprites[2] = new Sprite(gl, shader, textures.spacehole_3.texture);
        this.holeLayersSprites[3] = new Sprite(gl, shader, textures.spacehole_4.texture);
        this.holeLayersSprites[4] = new Sprite(gl, shader, textures.spacehole_5.texture);

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

    private moveUnit(fps: number, currentTick: number) {
        const ratioToMaxFps = MAX_FPS / fps;
        if (
            !this.moveAnimationBody ||
            !this.moveAnimationUnit ||
            !this.moveAnimationPath?.length ||
            this.moveAnimationIndex >= this.moveAnimationPath.length
        ) {
            return;
        }

        this.moveAnimationUnit.render(fps, currentTick, false /* not used */, true);
        const isSmallUnit = this.moveAnimationUnit.isSmallSize();

        const movingTarget = getPointForCell(
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
            this.moveAnimationUnit.setPosition(nextX, nextY);
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

                    const bodyCell = getCellForPosition(this.gridSettings, body.GetPosition());
                    if (!bodyCell) {
                        bulletsToDestroy.push(b);
                        continue;
                    }

                    const toPositionCell = getCellForPosition(this.gridSettings, b.toPosition);
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
            const cell = getCellForPosition(this.gridSettings, affectedUnit.getPosition());
            if (cell) {
                cells = [cell];
            } else {
                cells = [];
            }
        } else {
            cells = getCellsAroundPoint(this.gridSettings, affectedUnit.getPosition());
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
    ): void {
        if (currentActivePath?.length) {
            for (const p of currentActivePath) {
                const movePoint = getPointForCell(
                    p,
                    this.gridSettings.getMinX(),
                    this.gridSettings.getStep(),
                    this.gridSettings.getHalfStep(),
                );

                if (hoverAttackFromHashes?.has((p.x << 4) | p.y) || hasXY(movePoint, currentActiveUnitPositions)) {
                    continue;
                }

                const polygonStartingPosition: XY = {
                    x: movePoint.x - this.gridSettings.getHalfStep(),
                    y: movePoint.y - this.gridSettings.getHalfStep(),
                };
                const newX = polygonStartingPosition.x + this.gridSettings.getStep();
                const newY = polygonStartingPosition.y + this.gridSettings.getStep();
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
            }
        }
    }

    public animate(fps: number, currentTick: number): void {
        if (
            this.moveAnimationPath &&
            (this.moveAnimationIndex >= this.moveAnimationPath.length || this.moveAnimationIndex <= 0)
        ) {
            this.moveAnimationIndex = 0;
            this.moveAnimationPath = undefined;
        }

        if (!this.moveAnimationPath && !this.bullets?.length) {
            this.animating = false;
            this.animatingDoubleShot = false;
            this.onlyUniqueBulletSourcesRemaining = false;
            return;
        }

        this.moveBullets(fps);

        if (!this.moveAnimationPath && !this.bullets?.length) {
            this.animating = false;
            this.animatingDoubleShot = false;
            this.onlyUniqueBulletSourcesRemaining = false;
            return;
        }

        this.moveUnit(fps, currentTick);
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
                    const movePoint = getPointForCell(
                        cell,
                        this.gridSettings.getMinX(),
                        this.gridSettings.getStep(),
                        this.gridSettings.getHalfStep(),
                    );

                    const polygonStartingPosition: XY = {
                        x: movePoint.x - this.gridSettings.getHalfStep(),
                        y: movePoint.y - this.gridSettings.getHalfStep(),
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
                    const movePoint = getPointForCell(
                        cell,
                        this.gridSettings.getMinX(),
                        this.gridSettings.getStep(),
                        this.gridSettings.getHalfStep(),
                    );

                    const polygonStartingPosition: XY = {
                        x: movePoint.x - this.gridSettings.getHalfStep(),
                        y: movePoint.y - this.gridSettings.getHalfStep(),
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

    public drawAttackFrom(draw: b2Draw, fromPoint: XY, isSmallUnit = true): void {
        const polygonStartingPosition: XY = {
            x: fromPoint.x - this.gridSettings.getHalfStep() - (isSmallUnit ? 0 : this.gridSettings.getStep()),
            y: fromPoint.y - this.gridSettings.getHalfStep() - (isSmallUnit ? 0 : this.gridSettings.getStep()),
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

    public renderUpNextFonts(
        draw: b2Draw,
        fps: number,
        currentTick: number,
        isLightMode: boolean,
        unitsNext: Unit[],
        isAnimationLocked: boolean,
        currentActiveUnitId?: string,
    ): void {
        if (isLightMode) {
            this.upNextFontBlackSprite.render();
        } else {
            this.upNextFontWhiteSprite.render();
        }
        let i = 1;
        let shift = 1;
        for (const u of unitsNext) {
            u.render(
                fps,
                currentTick,
                isLightMode,
                isAnimationLocked,
                draw,
                i++,
                shift,
                u.getId() === currentActiveUnitId,
            );
            if (!u.isSmallSize()) {
                shift++;
            }
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
        const points: XY[] = [];

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
                            points.push({ x: newX, y: fromY });
                            points.push({ x: newX, y: y - this.gridSettings.getStep() });
                            fromY = y + this.gridSettings.getStep();
                        }
                    }
                }
            }
            points.push({ x: newX, y: fromY });
            points.push({ x: newX, y: this.gridSettings.getMaxY() });
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
                            points.push({ x: fromX, y: newY });
                            points.push({ x: x - this.gridSettings.getStep(), y: newY });
                            fromX = x + this.gridSettings.getStep();
                        }
                    }
                }
            }
            points.push({ x: fromX, y: newY });
            points.push({ x: this.gridSettings.getMaxX(), y: newY });
        }

        // draw lines
        let index = 0;
        while (index < points.length - 1) {
            const p1 = points[index];
            const p2 = points[index + 1];
            draw.DrawSegment(p1, p2, color);
            index += 2;
        }
    }
}
