// game/core/src/PixiDrawablePlacement.ts
import { Graphics } from "pixi.js";
import {
    HoCMath,
    GridSettings,
    SquarePlacement,
    RectanglePlacement,
    PlacementPositionType,
    IPlacement,
} from "@heroesofcrypto/common";

export interface IDrawablePlacement extends IPlacement {
    draw(gfx: Graphics): void;
}

function rgb255(r: number, g: number, b: number): number {
    return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
}

function buildInsetRectVerts(xLeft: number, yUpper: number, xRight: number, yLower: number, inset = 1): HoCMath.XY[] {
    return [
        { x: xLeft + inset, y: yUpper - inset },
        { x: xRight - inset, y: yUpper - inset },
        { x: xRight - inset, y: yLower + inset },
        { x: xLeft + inset, y: yLower + inset },
    ];
}

function drawQuadFilled(gfx: Graphics, verts: HoCMath.XY[], color: number, alpha = 0.35): void {
    console.log(
        "drawQuadFilled verts:",
        verts.map((v, i) => ({ index: i, x: v.x, y: v.y })),
    );
    gfx.moveTo(verts[0].x, verts[0].y)
        .lineTo(verts[1].x, verts[1].y)
        .lineTo(verts[2].x, verts[2].y)
        .lineTo(verts[3].x, verts[3].y)
        .closePath()
        .fill({ color, alpha });
}

export class DrawableSquarePlacement extends SquarePlacement implements IDrawablePlacement {
    private readonly vertices: HoCMath.XY[];
    public constructor(gs: GridSettings, pos: PlacementPositionType, size = 3) {
        super(gs, pos, size);
        this.vertices = buildInsetRectVerts(this.xLeft, this.yUpper, this.xRight, this.yLower, 1);
    }
    public draw(gfx: Graphics): void {
        const isLower =
            this.placementPositionType === PlacementPositionType.LOWER_RIGHT ||
            this.placementPositionType === PlacementPositionType.LOWER_LEFT;

        const fillColor = isLower ? rgb255(75, 100, 54) : rgb255(194, 97, 73);
        drawQuadFilled(gfx, this.vertices, fillColor);
    }
}

export class DrawableRectanglePlacement extends RectanglePlacement implements IDrawablePlacement {
    private readonly vertices: HoCMath.XY[];
    public constructor(gs: GridSettings, pos: PlacementPositionType, size = 3) {
        super(gs, pos, size);
        this.vertices = buildInsetRectVerts(this.xLeft, this.yUpper, this.xRight, this.yLower, 1);
    }
    public draw(gfx: Graphics): void {
        const isLower =
            this.placementPositionType === PlacementPositionType.LOWER_RIGHT ||
            this.placementPositionType === PlacementPositionType.LOWER_LEFT;

        const fillColor = isLower ? rgb255(75, 100, 54) : rgb255(194, 97, 73);
        drawQuadFilled(gfx, this.vertices, fillColor);
    }
}
