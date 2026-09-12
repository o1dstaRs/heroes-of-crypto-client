import React, { useEffect, useState } from "react";
import { GridMath } from "@heroesofcrypto/common";

import {
    getShotTrajectoryStyle,
    setShotTrajectoryStyle,
    SHOT_TRAJECTORY_STYLES,
    type ShotTrajectoryStyle,
} from "../scenes/shotTrajectoryStyle";
import { images } from "../generated/image_imports";
import {
    RANGE_TARGET_EDGE_SELECTED_SCALE,
    rangeTargetEdgeMarkerDisplayLength,
    rangeTargetEdgeTrajectoryEndpoint,
    SHOT_ARROWHEAD_SIZE_SCALE,
    SHOT_ARROWHEAD_WELD_SEAM_HEIGHT_SCALE,
    SHOT_ARROWHEAD_WELD_SPARK_COUNT,
    SHOT_ARROWHEAD_WELD_SPARK_MAX_LENGTH,
    SHOT_ARROWHEAD_WELD_ZONE_LENGTH_SCALE,
    SHOT_FLETCHING_SIZE_SCALE,
    SHOT_ORC_ARROWHEAD_AXIS_ANCHOR_Y,
    SHOT_ORC_FLETCHING_AXIS_ANCHOR_Y,
    SHOT_ORC_SHAFT_AXIS_ANCHOR_Y,
    SHOT_SHAFT_RENDER_LENGTH,
    SHOT_SHAFT_SPEED,
    SHOT_SHAFT_SPACING,
    SHOT_SHAFT_TARGET_PENETRATION_SCALE,
} from "../scenes/HoverManager";
import {
    DEFAULT_SHOT_TRAJECTORY_TUNING,
    getShotTrajectoryTuning,
    resetShotTrajectoryTuning,
    setShotTrajectoryTuning,
    SHOT_ARROWHEAD_AUTHORING_WIDTH,
    SHOT_FLETCHING_AUTHORING_WIDTH,
    shotCasingVisibleSlice,
    shotTrajectoryAuthoringOffsetToWorld,
    type ShotTrajectoryOriginTuning,
    type ShotTrajectoryTransformTuning,
    type ShotTrajectoryTuning,
} from "../scenes/shotTrajectoryTuning";

const NumericControl: React.FC<{
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    suffix?: string;
    onChange: (value: number) => void;
}> = ({ label, value, min, max, step, suffix, onChange }) => (
    <label style={{ display: "grid", gridTemplateColumns: "150px 1fr 92px", gap: 12, alignItems: "center" }}>
        <span style={{ color: "#d8bf8b" }}>{label}</span>
        <input
            type="range"
            value={value}
            min={min}
            max={max}
            step={step}
            onInput={(event) => onChange(Number((event.target as HTMLInputElement).value))}
            style={{ width: "100%", accentColor: "#e7a92e" }}
        />
        <span style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 4 }}>
            <input
                type="number"
                value={value}
                min={min}
                max={max}
                step={step}
                onChange={(event) => onChange(Number(event.target.value))}
                style={{
                    minWidth: 0,
                    width: "100%",
                    padding: "7px 5px",
                    color: "#fff0c3",
                    background: "#090604",
                    border: "1px solid #6f4d25",
                    borderRadius: 5,
                }}
            />
            {suffix && <small style={{ color: "#8e7b5c" }}>{suffix}</small>}
        </span>
    </label>
);

const TransformControls: React.FC<{
    title: string;
    description: string;
    color: string;
    value: ShotTrajectoryTransformTuning;
    onChange: (patch: Partial<ShotTrajectoryTransformTuning>) => void;
}> = ({ title, description, color, value, onChange }) => (
    <section
        style={{
            padding: 18,
            border: `1px solid ${color}`,
            borderRadius: 10,
            background: "rgba(10,7,4,.76)",
        }}
    >
        <h3 style={{ margin: 0, color, fontSize: 18, letterSpacing: ".05em" }}>{title}</h3>
        <p style={{ margin: "7px 0 17px", color: "#9e8b6a", lineHeight: 1.45 }}>{description}</p>
        <div style={{ display: "grid", gap: 11 }}>
            <NumericControl
                label="Вдоль траектории"
                value={value.offsetAlong}
                min={-160}
                max={160}
                step={1}
                suffix="px"
                onChange={(offsetAlong) => onChange({ offsetAlong })}
            />
            <NumericControl
                label="Поперёк траектории"
                value={value.offsetPerpendicular}
                min={-160}
                max={160}
                step={1}
                suffix="px"
                onChange={(offsetPerpendicular) => onChange({ offsetPerpendicular })}
            />
            <NumericControl
                label="Поворот"
                value={value.rotationDegrees}
                min={-180}
                max={180}
                step={1}
                suffix="°"
                onChange={(rotationDegrees) => onChange({ rotationDegrees })}
            />
            <NumericControl
                label="Масштаб"
                value={value.scale}
                min={0.2}
                max={3}
                step={0.01}
                suffix="×"
                onChange={(scale) => onChange({ scale })}
            />
        </div>
    </section>
);

const OriginControls: React.FC<{
    value: ShotTrajectoryOriginTuning;
    onChange: (patch: Partial<ShotTrajectoryOriginTuning>) => void;
}> = ({ value, onChange }) => (
    <section
        style={{
            padding: 18,
            border: "1px solid #3de17b",
            borderRadius: 10,
            background: "rgba(10,7,4,.76)",
        }}
    >
        <h3 style={{ margin: 0, color: "#3de17b", fontSize: 18, letterSpacing: ".05em" }}>4 · ТОЧКА ВЫХОДА ПАТРОНА</h3>
        <p style={{ margin: "7px 0 17px", color: "#9e8b6a", lineHeight: 1.45 }}>
            Двигает только зелёную точку внутри оперения. Само оперение остаётся на месте.
        </p>
        <div style={{ display: "grid", gap: 11 }}>
            <NumericControl
                label="Вдоль траектории"
                value={value.offsetAlong}
                min={-160}
                max={160}
                step={1}
                suffix="px"
                onChange={(offsetAlong) => onChange({ offsetAlong })}
            />
            <NumericControl
                label="Поперёк траектории"
                value={value.offsetPerpendicular}
                min={-160}
                max={160}
                step={1}
                suffix="px"
                onChange={(offsetPerpendicular) => onChange({ offsetPerpendicular })}
            />
        </div>
    </section>
);

const CalibrationPreview: React.FC<{
    tuning: ShotTrajectoryTuning;
    onOriginChange: (patch: Partial<ShotTrajectoryOriginTuning>) => void;
    onEmergenceSparkChange: (patch: Partial<ShotTrajectoryTransformTuning>) => void;
    onSparkChange: (patch: Partial<ShotTrajectoryTransformTuning>) => void;
}> = ({ tuning, onOriginChange, onEmergenceSparkChange, onSparkChange }) => {
    const [animationMs, setAnimationMs] = useState(0);
    const [previewReversed, setPreviewReversed] = useState(true);
    const [originMarkerVisible, setOriginMarkerVisible] = useState(true);
    useEffect(() => {
        let frame = 0;
        const startedAt = performance.now();
        const animate = (now: number) => {
            setAnimationMs(now - startedAt);
            frame = requestAnimationFrame(animate);
        };
        frame = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(frame);
    }, []);

    const previewWidth = 1200;
    const previewHeight = 360;
    const leftPoint = { x: 105, y: 125 };
    const rightPoint = { x: 1090, y: 250 };
    const from = previewReversed ? rightPoint : leftPoint;
    const markerCenter = previewReversed ? leftPoint : rightPoint;
    const targetSide = previewReversed ? GridMath.RangeAttackCellSide.RIGHT : GridMath.RangeAttackCellSide.LEFT;
    const cellSize = 128;
    const trajectoryEnd = rangeTargetEdgeTrajectoryEndpoint(from, markerCenter, targetSide, cellSize, { x: 1, y: 1 });
    const fromX = from.x;
    const fromY = from.y;
    const endX = trajectoryEnd.x;
    const endY = trajectoryEnd.y;
    const rayX = endX - fromX;
    const rayY = endY - fromY;
    const arrowLen = Math.hypot(rayX, rayY);
    const ux = rayX / arrowLen;
    const uy = rayY / arrowLen;
    const nx = -uy;
    const ny = ux;
    const angleDegrees = (Math.atan2(rayY, rayX) * 180) / Math.PI;
    const markerAngleDegrees = (Math.atan2(markerCenter.y - fromY, markerCenter.x - fromX) * 180) / Math.PI;
    const fletchingBaseLength = Math.min(78, Math.max(44, cellSize * 0.58)) * SHOT_FLETCHING_SIZE_SCALE;
    const fletchingLength = fletchingBaseLength * tuning.emergence.scale;
    const fletchingHeight = fletchingLength * (176 / 288);
    const fletchingAuthoringScale = fletchingBaseLength / SHOT_FLETCHING_AUTHORING_WIDTH;
    const fletchingOffsetAlong = shotTrajectoryAuthoringOffsetToWorld(
        tuning.emergence.offsetAlong,
        fletchingBaseLength,
        SHOT_FLETCHING_AUTHORING_WIDTH,
    );
    const fletchingOffsetPerpendicular = shotTrajectoryAuthoringOffsetToWorld(
        tuning.emergence.offsetPerpendicular,
        fletchingBaseLength,
        SHOT_FLETCHING_AUTHORING_WIDTH,
    );
    const projectileOriginAlong = shotTrajectoryAuthoringOffsetToWorld(
        tuning.projectileOrigin.offsetAlong,
        fletchingBaseLength,
        SHOT_FLETCHING_AUTHORING_WIDTH,
    );
    const projectileOriginPerpendicular = shotTrajectoryAuthoringOffsetToWorld(
        tuning.projectileOrigin.offsetPerpendicular,
        fletchingBaseLength,
        SHOT_FLETCHING_AUTHORING_WIDTH,
    );
    const fletchingX = fromX + ux * fletchingOffsetAlong + nx * fletchingOffsetPerpendicular;
    const fletchingY = fromY + uy * fletchingOffsetAlong + ny * fletchingOffsetPerpendicular;
    const originX = fletchingX + ux * projectileOriginAlong + nx * projectileOriginPerpendicular;
    const originY = fletchingY + uy * projectileOriginAlong + ny * projectileOriginPerpendicular;
    const emergenceSparkOffsetAlong = shotTrajectoryAuthoringOffsetToWorld(
        tuning.emergenceSparks.offsetAlong,
        fletchingBaseLength,
        SHOT_FLETCHING_AUTHORING_WIDTH,
    );
    const emergenceSparkOffsetPerpendicular = shotTrajectoryAuthoringOffsetToWorld(
        tuning.emergenceSparks.offsetPerpendicular,
        fletchingBaseLength,
        SHOT_FLETCHING_AUTHORING_WIDTH,
    );
    const emergenceSparkX = originX + ux * emergenceSparkOffsetAlong + nx * emergenceSparkOffsetPerpendicular;
    const emergenceSparkY = originY + uy * emergenceSparkOffsetAlong + ny * emergenceSparkOffsetPerpendicular;
    const startClearance = Math.max(0, fletchingOffsetAlong + projectileOriginAlong);
    const originLateralOffset = fletchingOffsetPerpendicular + projectileOriginPerpendicular;

    const arrowheadLength =
        rangeTargetEdgeMarkerDisplayLength(cellSize) * RANGE_TARGET_EDGE_SELECTED_SCALE * SHOT_ARROWHEAD_SIZE_SCALE;
    const arrowheadHeight = arrowheadLength * (260 / 384);
    const arrowheadAuthoringScale = arrowheadLength / SHOT_ARROWHEAD_AUTHORING_WIDTH;
    const contactOffsetAlong = shotTrajectoryAuthoringOffsetToWorld(
        tuning.contactSparks.offsetAlong,
        arrowheadLength,
        SHOT_ARROWHEAD_AUTHORING_WIDTH,
    );
    const contactOffsetPerpendicular = shotTrajectoryAuthoringOffsetToWorld(
        tuning.contactSparks.offsetPerpendicular,
        arrowheadLength,
        SHOT_ARROWHEAD_AUTHORING_WIDTH,
    );
    const sparkX = endX + ux * contactOffsetAlong + nx * contactOffsetPerpendicular;
    const sparkY = endY + uy * contactOffsetAlong + ny * contactOffsetPerpendicular;

    const shaftLength = SHOT_SHAFT_RENDER_LENGTH;
    const shaftHeight = shaftLength * (216 / 416);
    const shaftPhase = ((animationMs / 1000) * SHOT_SHAFT_SPEED) % SHOT_SHAFT_SPACING;
    const endClearance = arrowLen + shaftLength * SHOT_SHAFT_TARGET_PENETRATION_SCALE;
    const casings: Array<{
        d: number;
        lateral: number;
        sourceStartFraction: number;
        sourceEndFraction: number;
    }> = [];
    let emergenceContactStrength = 0;
    let contactStrength = 0;
    for (let d = shaftPhase - SHOT_SHAFT_SPACING; d < arrowLen + SHOT_SHAFT_SPACING; d += SHOT_SHAFT_SPACING) {
        const segmentStart = d - shaftLength / 2;
        const segmentEnd = d + shaftLength / 2;
        if (segmentStart <= startClearance && segmentEnd >= startClearance) {
            const contactProgress = Math.max(0, Math.min(1, (segmentEnd - startClearance) / shaftLength));
            emergenceContactStrength = Math.max(
                emergenceContactStrength,
                0.35 + Math.sin(contactProgress * Math.PI) * 0.65,
            );
        }
        if (segmentStart <= arrowLen && segmentEnd >= arrowLen) {
            const contactProgress = Math.max(0, Math.min(1, (segmentEnd - arrowLen) / shaftLength));
            contactStrength = Math.max(contactStrength, 0.35 + Math.sin(contactProgress * Math.PI) * 0.65);
        }
        const visibleSlice = shotCasingVisibleSlice(d, shaftLength, startClearance, endClearance);
        if (!visibleSlice) continue;
        const pathProgress = Math.max(0, Math.min(1, (d - startClearance) / Math.max(1, arrowLen - startClearance)));
        casings.push({
            d,
            lateral: originLateralOffset * (1 - pathProgress),
            sourceStartFraction: visibleSlice.sourceStartFraction,
            sourceEndFraction: visibleSlice.sourceEndFraction,
        });
    }

    const startDrag = (
        event: React.PointerEvent<SVGCircleElement>,
        initial: ShotTrajectoryOriginTuning,
        onChange: (patch: Partial<ShotTrajectoryOriginTuning>) => void,
        authoringScale: number,
    ) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        const svg = event.currentTarget.ownerSVGElement;
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        const startX = event.clientX;
        const startY = event.clientY;
        const move = (pointerEvent: PointerEvent) => {
            const deltaX = ((pointerEvent.clientX - startX) * previewWidth) / rect.width;
            const deltaY = ((pointerEvent.clientY - startY) * previewHeight) / rect.height;
            onChange({
                offsetAlong: Math.round(initial.offsetAlong + (deltaX * ux + deltaY * uy) / authoringScale),
                offsetPerpendicular: Math.round(
                    initial.offsetPerpendicular + (deltaX * nx + deltaY * ny) / authoringScale,
                ),
            });
        };
        const stop = () => {
            window.removeEventListener("pointermove", move, true);
            window.removeEventListener("pointerup", stop, true);
            window.removeEventListener("pointercancel", stop, true);
        };
        window.addEventListener("pointermove", move, true);
        window.addEventListener("pointerup", stop, true);
        window.addEventListener("pointercancel", stop, true);
    };
    const animationPhase = animationMs / 1000;
    const flicker = 0.72 + 0.28 * Math.sin(animationPhase * 16.7);
    // Keep a faint copy of the real in-game weld seam visible between casing contacts so the editor
    // remains usable. Its bright pulse and rays still follow the same contact animation as the game.
    const weldVisual = (sparkTuning: ShotTrajectoryTransformTuning, contact: number) => {
        const burstScale = Math.max(0.28, contact) * flicker;
        const seamHalfThickness = Math.max(
            3.5,
            (shaftHeight * SHOT_ARROWHEAD_WELD_SEAM_HEIGHT_SCALE * sparkTuning.scale) / 2,
        );
        const jointZoneHalfLength = shaftLength * SHOT_ARROWHEAD_WELD_ZONE_LENGTH_SCALE * sparkTuning.scale;
        const sparkRays = Array.from({ length: SHOT_ARROWHEAD_WELD_SPARK_COUNT }, (_, sparkIndex) => {
            const sparkPhase = animationPhase * 21.3 + sparkIndex * 2.41;
            const seamOffset = (sparkIndex / (SHOT_ARROWHEAD_WELD_SPARK_COUNT - 1) - 0.5) * seamHalfThickness * 2;
            const longitudinalOffset = Math.sin(sparkPhase * 0.73) * jointZoneHalfLength;
            const spread = (sparkIndex / (SHOT_ARROWHEAD_WELD_SPARK_COUNT - 1) - 0.5) * Math.PI;
            const rayAngle = Math.PI + spread + Math.sin(sparkPhase) * 0.18;
            const rayLength =
                (2.2 + (0.5 + 0.5 * Math.sin(sparkPhase * 1.37)) * SHOT_ARROWHEAD_WELD_SPARK_MAX_LENGTH) *
                burstScale *
                sparkTuning.scale;
            return {
                x: longitudinalOffset,
                y: seamOffset,
                startDx: Math.cos(rayAngle) * 0.8,
                startDy: Math.sin(rayAngle) * 0.8,
                dx: Math.cos(rayAngle) * rayLength,
                dy: Math.sin(rayAngle) * rayLength,
            };
        });
        return { burstScale, seamHalfThickness, jointZoneHalfLength, sparkRays };
    };
    const emergenceWeld = weldVisual(tuning.emergenceSparks, emergenceContactStrength);
    const contactWeld = weldVisual(tuning.contactSparks, contactStrength);

    return (
        <div
            style={{
                overflow: "hidden",
                border: "1px solid #5d4226",
                borderRadius: 10,
                background: "#090705",
            }}
        >
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "9px 12px",
                    color: "#c4ae83",
                    borderBottom: "1px solid #3f2b1b",
                }}
            >
                <span style={{ marginRight: "auto" }}>Фактическая игровая геометрия</span>
                <button
                    type="button"
                    aria-pressed={originMarkerVisible}
                    onClick={() => setOriginMarkerVisible((visible) => !visible)}
                    style={{
                        padding: "5px 11px",
                        color: originMarkerVisible ? "#8ff0b4" : "#9e8b6a",
                        background: originMarkerVisible ? "#173521" : "#16100b",
                        border: `1px solid ${originMarkerVisible ? "#3de17b" : "#6f4d25"}`,
                        borderRadius: 5,
                        cursor: "pointer",
                    }}
                >
                    ЗЕЛЁНЫЙ КРУГ: {originMarkerVisible ? "ВКЛ" : "ВЫКЛ"}
                </button>
                <button
                    type="button"
                    onClick={() => setPreviewReversed(false)}
                    style={{
                        padding: "5px 11px",
                        color: previewReversed ? "#9e8b6a" : "#edcf8d",
                        background: previewReversed ? "#16100b" : "#3a2915",
                        border: "1px solid #6f4d25",
                        borderRadius: 5,
                        cursor: "pointer",
                    }}
                >
                    СЛЕВА → НАПРАВО
                </button>
                <button
                    type="button"
                    onClick={() => setPreviewReversed(true)}
                    style={{
                        padding: "5px 11px",
                        color: previewReversed ? "#edcf8d" : "#9e8b6a",
                        background: previewReversed ? "#3a2915" : "#16100b",
                        border: "1px solid #6f4d25",
                        borderRadius: 5,
                        cursor: "pointer",
                    }}
                >
                    СПРАВА → НАЛЕВО
                </button>
            </div>
            <svg
                viewBox={`0 0 ${previewWidth} ${previewHeight}`}
                width="100%"
                role="img"
                aria-label="Интерактивная калибровка выхода патронов и сварочной полоски искр"
                style={{ display: "block", borderRadius: 10, background: "#090705", touchAction: "none" }}
            >
                <defs>
                    <pattern id="trajectory-grid" width="64" height="64" patternUnits="userSpaceOnUse">
                        <path d="M64 0H0V64" fill="none" stroke="#49331f" strokeWidth="1" opacity=".65" />
                    </pattern>
                    <filter id="weld-glow" x="-100%" y="-100%" width="300%" height="300%">
                        <feGaussianBlur stdDeviation="4" result="blur" />
                        <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                </defs>
                <rect width={previewWidth} height={previewHeight} fill="url(#trajectory-grid)" />
                <line
                    x1={fromX}
                    y1={fromY}
                    x2={endX}
                    y2={endY}
                    stroke="#6b4d24"
                    strokeWidth="1"
                    strokeDasharray="5 8"
                />
                <g
                    transform={`translate(${fletchingX} ${fletchingY}) rotate(${angleDegrees + tuning.emergence.rotationDegrees})`}
                >
                    <image
                        href={images.shot_trajectory_orc_bronze_fletching_distant_match_v8}
                        x={-fletchingLength / 2}
                        y={-fletchingHeight * SHOT_ORC_FLETCHING_AXIS_ANCHOR_Y}
                        width={fletchingLength}
                        height={fletchingHeight}
                        preserveAspectRatio="xMidYMid meet"
                    />
                </g>
                {casings.map((casing, index) => {
                    const x = fromX + ux * casing.d + nx * casing.lateral;
                    const y = fromY + uy * casing.d + ny * casing.lateral;
                    const clipX = -shaftLength / 2 + shaftLength * casing.sourceStartFraction;
                    const clipWidth = shaftLength * (casing.sourceEndFraction - casing.sourceStartFraction);
                    const clipId = `runtime-casing-clip-${index}`;
                    return (
                        <g key={index} transform={`translate(${x} ${y}) rotate(${angleDegrees})`}>
                            <defs>
                                <clipPath id={clipId}>
                                    <rect x={clipX} y={-shaftHeight} width={clipWidth} height={shaftHeight * 2} />
                                </clipPath>
                            </defs>
                            <image
                                href={images.shot_trajectory_hammered_bronze_casing_sprite_v4}
                                x={-shaftLength / 2}
                                y={-shaftHeight * SHOT_ORC_SHAFT_AXIS_ANCHOR_Y}
                                width={shaftLength}
                                height={shaftHeight}
                                clipPath={`url(#${clipId})`}
                                preserveAspectRatio="none"
                            />
                        </g>
                    );
                })}
                <g transform={`translate(${markerCenter.x} ${markerCenter.y}) rotate(${markerAngleDegrees})`}>
                    <image
                        href={images.shot_trajectory_orc_bronze_arrowhead_distant_match_v8}
                        x={-arrowheadLength * 0.66}
                        y={-arrowheadHeight * SHOT_ORC_ARROWHEAD_AXIS_ANCHOR_Y}
                        width={arrowheadLength}
                        height={arrowheadHeight}
                        preserveAspectRatio="none"
                    />
                </g>
                <g
                    transform={`translate(${emergenceSparkX} ${emergenceSparkY}) rotate(${angleDegrees + tuning.emergenceSparks.rotationDegrees})`}
                    filter="url(#weld-glow)"
                    style={{ pointerEvents: "none" }}
                >
                    <line
                        x1="0"
                        y1={-emergenceWeld.seamHalfThickness}
                        x2="0"
                        y2={emergenceWeld.seamHalfThickness}
                        stroke="#ff8a18"
                        strokeWidth="5.6"
                        strokeLinecap="round"
                        opacity={0.24 + emergenceWeld.burstScale * 0.38}
                    />
                    <line
                        x1="0"
                        y1={-emergenceWeld.seamHalfThickness}
                        x2="0"
                        y2={emergenceWeld.seamHalfThickness}
                        stroke="#ffffdc"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        opacity={0.68 + emergenceWeld.burstScale * 0.32}
                    />
                    <line
                        x1={-emergenceWeld.jointZoneHalfLength}
                        y1="0"
                        x2={emergenceWeld.jointZoneHalfLength}
                        y2="0"
                        stroke="#ffa11f"
                        strokeWidth="3.2"
                        strokeLinecap="round"
                        opacity={0.12 + emergenceWeld.burstScale * 0.18}
                    />
                    {emergenceWeld.sparkRays.map((ray, sparkIndex) => (
                        <line
                            key={sparkIndex}
                            x1={ray.x + ray.startDx}
                            y1={ray.y + ray.startDy}
                            x2={ray.x + ray.dx}
                            y2={ray.y + ray.dy}
                            stroke={sparkIndex % 2 === 0 ? "#ffffe2" : "#ffb52f"}
                            strokeWidth={0.9 + emergenceWeld.burstScale * 0.55}
                            strokeLinecap="round"
                            opacity={0.55 + emergenceWeld.burstScale * 0.45}
                        />
                    ))}
                </g>
                <g
                    transform={`translate(${sparkX} ${sparkY}) rotate(${markerAngleDegrees + tuning.contactSparks.rotationDegrees})`}
                    filter="url(#weld-glow)"
                    style={{ pointerEvents: "none" }}
                >
                    <line
                        x1="0"
                        y1={-contactWeld.seamHalfThickness}
                        x2="0"
                        y2={contactWeld.seamHalfThickness}
                        stroke="#ff8a18"
                        strokeWidth="5.6"
                        strokeLinecap="round"
                        opacity={0.24 + contactWeld.burstScale * 0.38}
                    />
                    <line
                        x1="0"
                        y1={-contactWeld.seamHalfThickness}
                        x2="0"
                        y2={contactWeld.seamHalfThickness}
                        stroke="#ffffdc"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        opacity={0.68 + contactWeld.burstScale * 0.32}
                    />
                    <line
                        x1={-contactWeld.jointZoneHalfLength}
                        y1="0"
                        x2={contactWeld.jointZoneHalfLength}
                        y2="0"
                        stroke="#ffa11f"
                        strokeWidth="3.2"
                        strokeLinecap="round"
                        opacity={0.12 + contactWeld.burstScale * 0.18}
                    />
                    {contactWeld.sparkRays.map((ray, sparkIndex) => (
                        <line
                            key={sparkIndex}
                            x1={ray.x + ray.startDx}
                            y1={ray.y + ray.startDy}
                            x2={ray.x + ray.dx}
                            y2={ray.y + ray.dy}
                            stroke={sparkIndex % 2 === 0 ? "#ffffe2" : "#ffb52f"}
                            strokeWidth={0.9 + contactWeld.burstScale * 0.55}
                            strokeLinecap="round"
                            opacity={0.55 + contactWeld.burstScale * 0.45}
                        />
                    ))}
                </g>
                <circle
                    cx={emergenceSparkX}
                    cy={emergenceSparkY}
                    r="22"
                    fill="transparent"
                    style={{ cursor: "move", pointerEvents: "all", touchAction: "none" }}
                    onPointerDown={(event) =>
                        startDrag(event, tuning.emergenceSparks, onEmergenceSparkChange, fletchingAuthoringScale)
                    }
                />
                <circle
                    cx={originX}
                    cy={originY}
                    r="22"
                    fill="transparent"
                    style={{ cursor: "move", pointerEvents: "all", touchAction: "none" }}
                    onPointerDown={(event) =>
                        startDrag(event, tuning.projectileOrigin, onOriginChange, fletchingAuthoringScale)
                    }
                />
                {originMarkerVisible && (
                    <circle
                        cx={originX}
                        cy={originY}
                        r="10"
                        fill="#23df79"
                        stroke="#eafff2"
                        strokeWidth="2"
                        style={{ pointerEvents: "none" }}
                    />
                )}
                <circle
                    cx={sparkX}
                    cy={sparkY}
                    r="22"
                    fill="transparent"
                    style={{ cursor: "move", pointerEvents: "all", touchAction: "none" }}
                    onPointerDown={(event) =>
                        startDrag(event, tuning.contactSparks, onSparkChange, arrowheadAuthoringScale)
                    }
                />
                <text x="24" y="30" fill="#c4ae83" fontSize="16">
                    Фактический игровой масштаб · патроны выходят постепенно · точку и обе полоски можно перетаскивать
                </text>
            </svg>
        </div>
    );
};

const TrajectoryPreview: React.FC<{ style: ShotTrajectoryStyle }> = ({ style }) => {
    const common = { x1: 28, y1: 80, x2: 332, y2: 80 };
    return (
        <svg viewBox="0 0 375 160" width="100%" height="160" role="img" aria-label={style}>
            <defs>
                <filter id={`glow-${style}`} x="-20%" y="-60%" width="140%" height="220%">
                    <feGaussianBlur stdDeviation="5" result="blur" />
                    <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
                <linearGradient id={`casing-${style}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#fff0a5" />
                    <stop offset="0.34" stopColor="#efb643" />
                    <stop offset="0.72" stopColor="#b76518" />
                    <stop offset="1" stopColor="#602b0b" />
                </linearGradient>
            </defs>
            {style !== "forged-double-chevrons" && style !== "gold-casings" && (
                <line {...common} stroke="#7b2819" strokeWidth="18" opacity="0.22" strokeLinecap="round" />
            )}
            {style === "ember-dashes" && (
                <>
                    <line
                        {...common}
                        stroke="#ff9f43"
                        strokeWidth="7"
                        strokeDasharray="18 11"
                        strokeLinecap="round"
                        filter={`url(#glow-${style})`}
                    >
                        <animate
                            attributeName="stroke-dashoffset"
                            from="29"
                            to="0"
                            dur="0.55s"
                            repeatCount="indefinite"
                        />
                    </line>
                    <line {...common} stroke="#fff4dc" strokeWidth="2" strokeDasharray="18 11" strokeLinecap="round">
                        <animate
                            attributeName="stroke-dashoffset"
                            from="29"
                            to="0"
                            dur="0.55s"
                            repeatCount="indefinite"
                        />
                    </line>
                </>
            )}
            {style === "solid-gold" && (
                <>
                    <line {...common} stroke="#ff8f32" strokeWidth="10" opacity="0.3" filter={`url(#glow-${style})`} />
                    <line {...common} stroke="#ffd27a" strokeWidth="4" />
                    <circle cy="80" r="5" fill="#fff8dc">
                        <animate attributeName="cx" from="28" to="332" dur="1.25s" repeatCount="indefinite" />
                    </circle>
                </>
            )}
            {style === "twin-tracer" && (
                <>
                    <line x1="28" y1="73" x2="332" y2="73" stroke="#ffb24d" strokeWidth="3" />
                    <line x1="28" y1="87" x2="332" y2="87" stroke="#ffb24d" strokeWidth="3" />
                    <line {...common} stroke="#fffbe8" strokeWidth="2" strokeDasharray="12 16" strokeLinecap="round">
                        <animate
                            attributeName="stroke-dashoffset"
                            from="28"
                            to="0"
                            dur="0.45s"
                            repeatCount="indefinite"
                        />
                    </line>
                </>
            )}
            {style === "marching-chevrons" && (
                <>
                    <line {...common} stroke="#d98238" strokeWidth="2" opacity="0.5" />
                    {[55, 95, 135, 175, 215, 255, 295].map((x) => (
                        <path
                            key={x}
                            d={`M${x - 10} 72 L${x} 80 L${x - 10} 88`}
                            fill="none"
                            stroke="#fff0c7"
                            strokeWidth="3"
                        >
                            <animateTransform
                                attributeName="transform"
                                type="translate"
                                values="0 0;40 0"
                                dur="0.8s"
                                repeatCount="indefinite"
                            />
                        </path>
                    ))}
                </>
            )}
            {style === "double-chevron-pulses" && (
                <>
                    <line {...common} stroke="#d98238" strokeWidth="2" opacity="0.45" />
                    {[52, 102, 152, 202, 252].map((x) => (
                        <g key={x}>
                            <path
                                d={`M${x - 10} 71 L${x} 80 L${x - 10} 89 M${x + 4} 73 L${x + 12} 80 L${x + 4} 87`}
                                fill="none"
                                stroke="#fff0c7"
                                strokeWidth="3"
                                strokeLinecap="round"
                            >
                                <animateTransform
                                    attributeName="transform"
                                    type="translate"
                                    values="0 0;50 0"
                                    dur="0.9s"
                                    repeatCount="indefinite"
                                />
                            </path>
                        </g>
                    ))}
                </>
            )}
            {style === "forged-double-chevrons" && (
                <>
                    {[52, 102, 152, 202, 252].map((x) => (
                        <g key={x}>
                            <path
                                d={`M${x - 10} 71 L${x} 80 L${x - 10} 89 M${x + 4} 73 L${x + 12} 80 L${x + 4} 87`}
                                fill="none"
                                stroke="#28170f"
                                strokeWidth="8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                            <path
                                d={`M${x - 10} 71 L${x} 80 L${x - 10} 89 M${x + 4} 73 L${x + 12} 80 L${x + 4} 87`}
                                fill="none"
                                stroke="#dea958"
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                            <animateTransform
                                attributeName="transform"
                                type="translate"
                                values="0 0;50 0"
                                dur="1.05s"
                                repeatCount="indefinite"
                            />
                        </g>
                    ))}
                </>
            )}
            {style === "ember-double-chevrons" && (
                <>
                    <line {...common} stroke="#ff4d22" strokeWidth="11" opacity="0.22" filter={`url(#glow-${style})`} />
                    <line {...common} stroke="#6b2115" strokeWidth="4" opacity="0.92" />
                    {[52, 102, 152, 202, 252].map((x) => (
                        <g key={x} filter={`url(#glow-${style})`}>
                            <path
                                d={`M${x - 10} 71 L${x} 80 L${x - 10} 89 M${x + 4} 73 L${x + 12} 80 L${x + 4} 87`}
                                fill="none"
                                stroke="#5b1d12"
                                strokeWidth="8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                            <path
                                d={`M${x - 10} 71 L${x} 80 L${x - 10} 89 M${x + 4} 73 L${x + 12} 80 L${x + 4} 87`}
                                fill="none"
                                stroke="#ffab42"
                                strokeWidth="3.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                            <animateTransform
                                attributeName="transform"
                                type="translate"
                                values="0 0;50 0"
                                dur="0.76s"
                                repeatCount="indefinite"
                            />
                        </g>
                    ))}
                </>
            )}
            {style === "gold-casings" && (
                <>
                    <image
                        href={images.shot_trajectory_arrow_fletching_start_v1}
                        x="20"
                        y="62"
                        width="62"
                        height="36"
                        preserveAspectRatio="xMidYMid meet"
                    />
                    {[108, 154, 200, 246].map((x) => (
                        <image
                            key={x}
                            href={images.shot_trajectory_arrow_shaft_segment_perspective_v1}
                            x={x - 16}
                            y="70"
                            width="32"
                            height="20"
                            preserveAspectRatio="xMidYMid meet"
                        >
                            <animateTransform
                                attributeName="transform"
                                type="translate"
                                values="-46 0;0 0"
                                dur="1.05s"
                                repeatCount="indefinite"
                            />
                        </image>
                    ))}
                    <image
                        href={images.shot_trajectory_arrowhead_target_v1}
                        x="286"
                        y="61"
                        width="68"
                        height="38"
                        preserveAspectRatio="xMidYMid meet"
                    />
                </>
            )}
        </svg>
    );
};

export const ShotTrajectoryEditor: React.FC = () => {
    const [selected, setSelected] = useState<ShotTrajectoryStyle>(() => getShotTrajectoryStyle());
    const [tuning, setTuning] = useState<ShotTrajectoryTuning>(() => getShotTrajectoryTuning());
    const [status, setStatus] = useState("Значения сохраняются автоматически");
    const select = (style: ShotTrajectoryStyle) => {
        setSelected(style);
        setShotTrajectoryStyle(style);
    };
    const updateTransform = (part: keyof ShotTrajectoryTuning, patch: Partial<ShotTrajectoryTransformTuning>): void => {
        const next = setShotTrajectoryTuning({
            ...tuning,
            [part]: { ...tuning[part], ...patch },
        });
        setTuning(next);
        setStatus("Сохранено — игра получает новые значения сразу");
    };
    const updateOrigin = (patch: Partial<ShotTrajectoryOriginTuning>): void => {
        const next = setShotTrajectoryTuning({
            ...tuning,
            projectileOrigin: { ...tuning.projectileOrigin, ...patch },
        });
        setTuning(next);
        setStatus("Сохранено — точка выхода патрона обновлена");
    };
    const reset = () => {
        setTuning(resetShotTrajectoryTuning());
        setStatus("Возвращены исходные значения");
    };
    const copyJson = async () => {
        try {
            await navigator.clipboard.writeText(JSON.stringify(tuning, null, 2));
            setStatus("JSON скопирован");
        } catch {
            setStatus("Не удалось скопировать JSON");
        }
    };

    return (
        <main
            style={{
                position: "fixed",
                zIndex: 10000,
                inset: 0,
                overflowY: "auto",
                boxSizing: "border-box",
                padding: "42px clamp(22px, 5vw, 80px)",
                color: "#f5dfad",
                background:
                    "radial-gradient(circle at 50% 0%, rgba(103,40,17,.42), transparent 38%), repeating-linear-gradient(0deg, transparent 0 67px, rgba(177,112,48,.08) 68px), #100b08",
                fontFamily: "Georgia, serif",
            }}
        >
            <div style={{ maxWidth: 1120, margin: "0 auto", pointerEvents: "auto" }}>
                <h1 style={{ margin: 0, letterSpacing: "0.12em", fontSize: 30 }}>ТРАЕКТОРИЯ ВЫСТРЕЛА</h1>
                <p style={{ color: "#bca87c", fontSize: 17, marginBottom: 30 }}>
                    Выберите вариант. При прицеливании обычный игровой курсор переключается на курсор дальнего боя.
                    Настройка сохраняется в браузере и применяется к активной траектории сразу.
                </p>
                <section
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
                        gap: 20,
                    }}
                >
                    {SHOT_TRAJECTORY_STYLES.map((option) => {
                        const active = selected === option.id;
                        return (
                            <button
                                type="button"
                                key={option.id}
                                onClick={() => select(option.id)}
                                style={{
                                    padding: 0,
                                    overflow: "hidden",
                                    textAlign: "left",
                                    color: "inherit",
                                    cursor: "pointer",
                                    borderRadius: 12,
                                    border: `2px solid ${active ? "#46e47b" : "#77562e"}`,
                                    background: active ? "rgba(25,77,39,.3)" : "rgba(22,15,10,.86)",
                                    boxShadow: active ? "0 0 28px rgba(53,223,114,.2)" : "none",
                                }}
                            >
                                <TrajectoryPreview style={option.id} />
                                <div style={{ padding: "0 20px 20px" }}>
                                    <div style={{ fontSize: 19, letterSpacing: "0.06em" }}>{option.label}</div>
                                    <div style={{ marginTop: 7, color: "#ad9b78", fontSize: 15 }}>
                                        {option.description}
                                    </div>
                                    <div style={{ marginTop: 14, color: active ? "#58ed88" : "#806d4f" }}>
                                        {active ? "✓ ВЫБРАНО" : "ВЫБРАТЬ"}
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </section>

                <section style={{ marginTop: 42 }}>
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            flexWrap: "wrap",
                            gap: 12,
                            marginBottom: 16,
                        }}
                    >
                        <div style={{ flex: 1, minWidth: 280 }}>
                            <h2 style={{ margin: 0, fontSize: 24, letterSpacing: ".09em" }}>КАЛИБРОВКА УЗЛОВ</h2>
                            <p style={{ margin: "7px 0 0", color: "#a99572" }}>
                                Зелёный узел — выход патронов, светящиеся полоски — искры на выходе и у лезвия.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={copyJson}
                            style={{
                                padding: "10px 14px",
                                color: "#f5dfad",
                                background: "#25190d",
                                border: "1px solid #7b582b",
                                borderRadius: 7,
                                cursor: "pointer",
                            }}
                        >
                            СКОПИРОВАТЬ JSON
                        </button>
                        <button
                            type="button"
                            onClick={reset}
                            style={{
                                padding: "10px 14px",
                                color: "#ffc4af",
                                background: "#2c120c",
                                border: "1px solid #9d4027",
                                borderRadius: 7,
                                cursor: "pointer",
                            }}
                        >
                            СБРОСИТЬ
                        </button>
                    </div>

                    <CalibrationPreview
                        tuning={tuning}
                        onOriginChange={updateOrigin}
                        onEmergenceSparkChange={(patch) => updateTransform("emergenceSparks", patch)}
                        onSparkChange={(patch) => updateTransform("contactSparks", patch)}
                    />

                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(430px, 1fr))",
                            gap: 18,
                            marginTop: 18,
                        }}
                    >
                        <TransformControls
                            title="1 · ИСКРЫ НА ВЫХОДЕ"
                            description="Настраивает вторую сварочную полоску в месте, где патрон начинает появляться из втулки. Перетаскивайте её прямо в превью."
                            color="#ffc447"
                            value={tuning.emergenceSparks}
                            onChange={(patch) => updateTransform("emergenceSparks", patch)}
                        />
                        <TransformControls
                            title="2 · КОНТАКТНЫЕ ИСКРЫ"
                            description="Перемещает, поворачивает и масштабирует фактическую сварочную полоску в месте входа патрона в лезвие. Перетаскивайте саму полоску в превью."
                            color="#f2a12d"
                            value={tuning.contactSparks}
                            onChange={(patch) => updateTransform("contactSparks", patch)}
                        />
                        <TransformControls
                            title="3 · ОПЕРЕНИЕ И ВТУЛКА"
                            description="Сдвигает и трансформирует всё оперение со втулкой. Зелёная точка сохраняет своё положение внутри него."
                            color="#3de17b"
                            value={tuning.emergence}
                            onChange={(patch) => updateTransform("emergence", patch)}
                        />
                        <OriginControls value={tuning.projectileOrigin} onChange={updateOrigin} />
                    </div>
                    <div
                        style={{
                            marginTop: 14,
                            padding: "11px 14px",
                            color: "#c7b489",
                            borderLeft: "3px solid #9a6b2c",
                            background: "rgba(31,20,10,.7)",
                        }}
                    >
                        {status}. Исходник: масштаб выхода {DEFAULT_SHOT_TRAJECTORY_TUNING.emergence.scale}×, искры
                        выхода {DEFAULT_SHOT_TRAJECTORY_TUNING.emergenceSparks.scale}×, контактные искры{" "}
                        {DEFAULT_SHOT_TRAJECTORY_TUNING.contactSparks.scale}×.
                    </div>
                </section>
            </div>
        </main>
    );
};
