import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "@react-nano/router";

import "./style.scss";
import { useManager } from "../../manager";
import { SettingsSection } from "../SettingsSection";
import { settingsCheckboxDef, settingsSliderDef } from "../../sceneControls";
import { Button } from "../controls/Button";
import type { SceneControlGroupsState } from "..";
import { TestsFolder } from "../TestsFolder";
import { getSceneLink } from "../../utils/reactUtils";

interface Box2dBarProps {
    sceneControlGroups: SceneControlGroupsState;
}

export const Box2dBar = ({ sceneControlGroups: sceneControls }: Box2dBarProps) => {
    const [tab, setTab] = useState<"controls" | "scenes" | "units">("units");
    const manager = useManager();

    const router = useRouter();
    const link = decodeURIComponent(router.path);
    const hasValidTest = useMemo(
        () => manager.groupedScenes.some((group) => group.scenes.some((scene) => link === getSceneLink(scene))),
        [manager, link],
    );

    useEffect(() => {
        if (tab) {
            setTab(tab);
        } else {
            setTab("scenes");
        }
    }, [hasValidTest, tab]);
    const settings = manager.m_settings;
    const iterationControls = [
        settingsSliderDef(settings, "m_velocityIterations", "Velocity Iters", 0, 50, 1),
        settingsSliderDef(settings, "m_positionIterations", "Position Iters", 0, 50, 1),
        settingsSliderDef(settings, "m_particleIterations", "Particle Iters", 0, 50, 1),
        settingsSliderDef(settings, "m_hertz", "Hertz", 5, 120, 1),
    ];
    const settingsControls = [
        settingsCheckboxDef(settings, "m_enableSleep", "Sleep"),
        settingsCheckboxDef(settings, "m_enableWarmStarting", "Warm Starting"),
        settingsCheckboxDef(settings, "m_enableContinuous", "Time of Impact"),
        settingsCheckboxDef(settings, "m_enableSubStepping", "Sub-Stepping"),
    ];
    const drawControls = [
        settingsCheckboxDef(settings, "m_drawShapes", "Shapes"),
        settingsCheckboxDef(settings, "m_drawParticles", "Particles"),
        settingsCheckboxDef(settings, "m_drawJoints", "Joints"),
        settingsCheckboxDef(settings, "m_drawAABBs", "AABBs"),
        settingsCheckboxDef(settings, "m_drawContactPoints", "Contact Points"),
        settingsCheckboxDef(settings, "m_drawContactNormals", "Contact Normals"),
        settingsCheckboxDef(settings, "m_drawContactImpulse", "Contact Impulses"),
        settingsCheckboxDef(settings, "m_drawFrictionImpulse", "Friction Impulses"),
        settingsCheckboxDef(settings, "m_drawCOMs", "Center of Masses"),
    ];
    const overlayControls = [
        settingsCheckboxDef(settings, "m_drawStats", "Statistics"),
        settingsCheckboxDef(settings, "m_drawInputHelp", "Input Help"),
        settingsCheckboxDef(settings, "m_drawProfile", "Profile"),
        settingsCheckboxDef(settings, "m_drawFpsMeter", "FPS Meter"),
    ];
    const unitControls = [settingsSliderDef(settings, "m_amountOfSelectedUnits", "# units", 1, 1000, 1)];
    return (
        <div className="box2dbar">
            <div className="box2dbar--tabs">
                <div onClick={() => setTab("controls")} className={tab === "controls" ? "active-tab" : ""}>
                    Box2d
                </div>
                <div onClick={() => setTab("scenes")} className={tab === "scenes" ? "active-tab" : ""}>
                    Scenes
                </div>
                <div onClick={() => setTab("units")} className={tab === "units" ? "active-tab" : ""}>
                    Units
                </div>
            </div>
            <div className={tab === "controls" ? "tab-content" : "tab-content tab-content-hidden"}>
                <SettingsSection legend="Iterations" controls={iterationControls} />
                <SettingsSection legend="General" controls={settingsControls} />
                <SettingsSection legend="Draw" controls={drawControls} />
                <SettingsSection legend="Overlay" controls={overlayControls} />
                {sceneControls.groups.map((group, i) => (
                    <SettingsSection
                        defaultOpen
                        legend={`[Test] ${group.legend}`}
                        key={`${sceneControls.key}-${i}`}
                        controls={group.controls}
                    />
                ))}
            </div>
            <div className={tab === "scenes" ? "tab-content" : "tab-content tab-content-hidden"}>
                {manager.groupedScenes.map(({ name, scenes }) => (
                    <TestsFolder key={name} name={name} tests={scenes} link={link} />
                ))}
            </div>
            <div className={tab === "units" ? "tab-content" : "tab-content tab-content-hidden"}>
                <SettingsSection legend="Amount" controls={unitControls} defaultOpen />
            </div>
            {tab === "controls" && (
                <div className="box2dbar--buttons">
                    <Button label="Reset Camera (R)" onClick={() => manager.HomeCamera()} />
                    <Button label="Start (S)" onClick={() => manager.StartGame()} />
                </div>
            )}
            {tab === "units" && (
                <div className="box2dbar--buttons">
                    <Button label="Accept" onClick={() => manager.Accept()} />
                    <Button label="Clone" onClick={() => manager.Clone()} />
                </div>
            )}
        </div>
    );
};
