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

import { b2World, b2Body } from "@box2d/core";
import { RayHandler, Light, XY } from "@box2d/lights";

export class RayHandlerImpl extends RayHandler {
    private readonly world: b2World;

    public constructor(
        world: b2World,
        gl: WebGLRenderingContext,
        fboWidth: number,
        fboHeight: number,
        viewportWidth: number,
        viewportHeight: number,
        shadows: boolean,
    ) {
        super(gl, fboWidth, fboHeight, viewportWidth, viewportHeight, shadows);
        this.world = world;
    }

    public createRayCastCallback(light: Light) {
        return (point1: XY, point2: XY) =>
            this.world.RayCast(point1, point2, (fixture, point, _normal, fraction) =>
                light.reportFixture(fixture.GetFilterData(), fixture.GetBody(), point, fraction),
            );
    }

    public getBodyPosition(body: any) {
        return (body as b2Body).GetPosition();
    }

    public getBodyAngle(body: any) {
        return (body as b2Body).GetAngle();
    }
}
