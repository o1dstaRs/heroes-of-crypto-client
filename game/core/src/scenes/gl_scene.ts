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

import { BlendFunc, Light, lightSettings, RayHandler, RECOMMENDED_GAMMA_CORRECTION, XY } from "@box2d/lights";

import { g_camera } from "../utils/camera";
import { RayHandlerImpl } from "../utils/lights/RayHandlerImpl";
import { clearGlCanvas } from "../utils/gl/glUtils";
import { Settings } from "../settings";
import { selectDef } from "../ui/controls/Select";
import { checkboxDef } from "../ui/controls/Checkbox";
import { SceneControl } from "../sceneControls";
import { Scene } from "./scene";
import { SceneSettings } from "./scene_settings";

type BlendMode = "Default" | "Over-Burn" | "Some Other";

export abstract class GLScene extends Scene {
    public readonly gl_rayHandler: RayHandler;

    public gl_blendFunc: BlendFunc;

    public gl_drawDebugLight = false;

    public gl_soft = true;

    public gl_blendMode: BlendMode = "Default";

    protected constructor(public readonly gl: WebGLRenderingContext, sceneSettings: SceneSettings) {
        super(sceneSettings, { x: 0, y: 0 });
        this.gl_blendFunc = new BlendFunc(gl, gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        lightSettings.gammaCorrection = RECOMMENDED_GAMMA_CORRECTION;
        lightSettings.isDiffuse = true;

        const viewport = this.getViewportSize();
        this.gl_rayHandler = new RayHandlerImpl(
            this.sc_world,
            gl,
            g_camera.getWidth() / 4,
            g_camera.getHeight() / 4,
            viewport.x,
            viewport.y,
            false,
        );
        this.gl_rayHandler.setAmbientLight(0, 0, 0, 0.5);
        this.gl_rayHandler.setBlurNum(3);
    }

    public setupControls() {
        this.addTestControlGroup("Light", this.getLightControls());
    }

    public getLightControls(): SceneControl[] {
        return [
            selectDef("Blend Mode", ["Default", "Over-Burn", "Some Other"], this.gl_blendMode, (value) => {
                this.setBlending(value as BlendMode);
            }),
            checkboxDef("Debug Light Shapes", this.gl_drawDebugLight, (value: boolean) => {
                this.gl_drawDebugLight = value;
            }),
            checkboxDef("Soft Shadows", this.gl_soft, (value: boolean) => {
                this.gl_soft = value;
            }),
        ];
    }

    public abstract getViewportSize(): XY;

    public Resize(width: number, height: number) {
        this.gl_rayHandler.resizeFBO(width / 4, height / 4);
    }

    public Destroy() {
        super.Destroy();

        this.gl_rayHandler.dispose();
        Light.setGlobalContactFilter(null);
    }

    public setBlending(mode: BlendMode) {
        this.gl_blendMode = mode;
        if (mode === "Over-Burn") this.gl_rayHandler.diffuseBlendFunc.set(this.gl.DST_COLOR, this.gl.SRC_COLOR);
        else if (mode === "Some Other") this.gl_rayHandler.diffuseBlendFunc.set(this.gl.SRC_COLOR, this.gl.DST_COLOR);
        else this.gl_rayHandler.diffuseBlendFunc.reset();
    }

    public Step(settings: Settings, timeStep: number): number {
        super.Step(settings, timeStep);

        this.clearGlCanvas();
        this.gl_blendFunc.apply();

        return timeStep;
    }

    public clearGlCanvas() {
        //
        const mode = localStorage.getItem("joy-mode");
        if (mode === "light") {
            clearGlCanvas(this.gl, 0.8359375, 0.8359375, 0.8359375, 1);
        } else {
            clearGlCanvas(this.gl, 0.1796875, 0.1796875, 0.1796875, 1);
        }
    }

    public renderLights(settings: Settings, timeStep: number) {
        const viewport = this.getViewportSize();
        this.gl_rayHandler.setCombinedMatrix(g_camera.combined, viewport.x / 2, viewport.y / 2, viewport.x, viewport.y);

        if (timeStep > 0) {
            this.gl_rayHandler.update();
        }
        this.gl_rayHandler.render();

        if (this.gl_drawDebugLight) {
            const draw = settings.m_debugDraw;
            const drawPolygon = draw.DrawPolygon.bind(draw);
            for (const light of this.gl_rayHandler.lightList) {
                light.debugRender(drawPolygon);
            }
        }
    }
}
