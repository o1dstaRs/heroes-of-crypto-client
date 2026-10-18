import { Graphics } from "pixi.js";
import type { GridSettings } from "@heroesofcrypto/common";

import type { AimGeometry } from "./opponentAimGeometry";
import { projectBattlefieldPoint, projectedCellPoints, projectedPolyline } from "./sandbox/BattlefieldVisualGrid";

export class OpponentAimOverlay {
    public readonly graphics = new Graphics({ eventMode: "none" });
    public paint(geometry: AimGeometry, settings: GridSettings): void {
        const g = this.graphics.clear();
        const color = geometry.color;
        for (const cell of geometry.cells) {
            g.poly(projectedCellPoints(cell, settings, 0.055))
                .fill({ color, alpha: 0.1 })
                .stroke({ color, width: 2, alpha: 0.85 });
        }
        const ray = geometry.ray;
        if (!ray) return;
        const points = projectedPolyline([ray.from, ray.to], settings);
        let distance = 0;
        for (let i = 2; i < points.length; i += 2) {
            const x = points[i - 2],
                y = points[i - 1];
            const dx = points[i] - x,
                dy = points[i + 1] - y;
            const length = Math.hypot(dx, dy);
            for (let dash = Math.floor(distance / 20) * 20; dash < distance + length; dash += 20) {
                const start = Math.max(0, dash - distance);
                const finish = Math.min(length, dash + 12 - distance);
                if (finish > start) {
                    g.moveTo(x + (dx * start) / length, y + (dy * start) / length)
                        .lineTo(x + (dx * finish) / length, y + (dy * finish) / length)
                        .stroke({ color, width: 2.5, alpha: 0.8, cap: "round" });
                }
            }
            distance += length;
        }
        const end = projectBattlefieldPoint(ray.to, settings);
        const radius = settings.getStep() * 0.105;
        g.circle(end.x, end.y, radius).stroke({ color, width: 2, alpha: 0.95 });
    }
    public clear(): void {
        this.graphics.clear();
    }
    public destroy(): void {
        this.graphics.destroy();
    }
}
