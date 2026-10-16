import { describe, expect, test } from "bun:test";
import { GridConstants, GridMath, GridSettings } from "@heroesofcrypto/common";
import { Container, Graphics } from "pixi.js";

import { HoverManager, type ISandboxHoverContext } from "./HoverManager";
import { projectBattlefieldPoint } from "./sandbox/BattlefieldVisualGrid";

const settings = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);

describe("Area Throw overlay on the painted battlefield", () => {
    for (const mirrored of [false, true]) {
        for (const scale of [0.62, 1.2]) {
            for (const center of [
                { x: 0, y: 0 },
                { x: 7, y: 8 },
                { x: 15, y: 15 },
            ]) {
                test(`center ${center.x},${center.y}, scale ${scale}, mirrored ${mirrored} covers exactly the landing cells`, () => {
                    const stage = new Container();
                    const world = new Container();
                    world.position.set(750, 640);
                    world.scale.set(mirrored ? -0.9 : 0.9, -scale);
                    stage.addChild(world);
                    const hover = new HoverManager({
                        sceneSettings: { getGridSettings: () => settings },
                        attachToWorldRoot: (child: Container) => world.addChild(child),
                        texAny: () => undefined,
                        getCurrentActiveUnit: () => undefined,
                    } as unknown as ISandboxHoverContext);
                    hover.onCameraChanged();
                    const area = (hover as unknown as { aoeGraphics: Graphics }).aoeGraphics;
                    const cells = [...GridMath.getCellsAroundCell(settings, center), center];
                    hover.drawAOEArea(cells);

                    // Hit-test the actual Pixi polygon after the camera's y flip, zoom and board mirror.
                    // Testing every board cell also catches an outline offset or an oversized rectangle.
                    for (let y = 0; y < settings.getGridSize(); y++) {
                        for (let x = 0; x < settings.getGridSize(); x++) {
                            const logical = GridMath.getPositionForCell(
                                { x, y },
                                settings.getMinX(),
                                settings.getStep(),
                                settings.getHalfStep(),
                            );
                            const screen = world.toGlobal(projectBattlefieldPoint(logical, settings));
                            const inside = area.containsPoint(area.toLocal(screen));
                            expect(inside).toBe(Math.abs(x - center.x) <= 1 && Math.abs(y - center.y) <= 1);
                        }
                    }

                    hover.clearAOEArea();
                    const impact = projectBattlefieldPoint(
                        GridMath.getPositionForCell(
                            center,
                            settings.getMinX(),
                            settings.getStep(),
                            settings.getHalfStep(),
                        ),
                        settings,
                    );
                    expect(area.containsPoint(impact)).toBe(false);
                    stage.destroy({ children: true });
                });
            }
        }
    }
});
