// game/core/src/scenes/PlacementManager.ts
import { Container, Graphics } from "pixi.js";
import {
    GridSettings,
    PlacementPositionType,
    PlacementType,
    TeamType,
    TeamVals,
    IPlacement,
    FightStateManager,
} from "@heroesofcrypto/common";

import { DrawableRectanglePlacement, DrawableSquarePlacement, IDrawablePlacement } from "../pixi/PixiDrawablePlacement";

export class PlacementManager {
    private leftPlacements: [IDrawablePlacement?, IDrawablePlacement?] = [];
    private rightPlacements: [IDrawablePlacement?, IDrawablePlacement?] = [];
    private allowedPlacementCellHashes = new Set<number>();
    private allowedPlacementCellHashesPerTeam = new Map<TeamType, Set<number>>([
        [TeamVals.LEFT, new Set<number>()],
        [TeamVals.RIGHT, new Set<number>()],
    ]);
    public constructor(private readonly gridSettings: GridSettings) {
        this.rebuildFromFightProps();
    }
    public releaseVisuals(): void {
        for (const placement of [...this.leftPlacements, ...this.rightPlacements]) {
            placement?.releaseVisuals();
        }
    }
    /** Rebuild placements + allowed hashes from current FightProperties */
    public rebuildFromFightProps(): void {
        // Placement upgrades replace these objects. Their derived PerspectiveMesh geometry and framed
        // Texture wrappers are GPU resources, so dropping the old arrays without teardown grows memory
        // every time a player changes placement depth or a snapshot rebuilds the zone.
        this.releaseVisuals();
        this.leftPlacements = [];
        this.rightPlacements = [];

        this.allowedPlacementCellHashes.clear();
        this.allowedPlacementCellHashesPerTeam.get(TeamVals.LEFT)!.clear();
        this.allowedPlacementCellHashesPerTeam.get(TeamVals.RIGHT)!.clear();

        const fp = FightStateManager.getInstance().getFightProperties();
        const augLeft = fp.getAugmentPlacement(TeamVals.LEFT);
        const augRight = fp.getAugmentPlacement(TeamVals.RIGHT);
        const placementType = fp.getPlacementType();

        if (placementType === PlacementType.RECTANGLE) {
            // Zones follow the fight's board orientation: side-oriented boards deploy on the
            // LEFT/RIGHT x-bands (LEFT = left, RIGHT = right) exactly like the server's zones.
            const sideOriented = fp.isSideOrientedPlacement();
            if (0 in augLeft) {
                this.leftPlacements[0] = new DrawableRectanglePlacement(
                    this.gridSettings,
                    PlacementPositionType.LEFT_BOTTOM,
                    augLeft[0],
                    sideOriented,
                );
            }
            if (0 in augRight) {
                this.rightPlacements[0] = new DrawableRectanglePlacement(
                    this.gridSettings,
                    PlacementPositionType.RIGHT_BOTTOM,
                    augRight[0],
                    sideOriented,
                );
            }
        } else {
            if (0 in augLeft) {
                this.leftPlacements[0] = new DrawableSquarePlacement(
                    this.gridSettings,
                    PlacementPositionType.LEFT_BOTTOM,
                    augLeft[0],
                );
            }
            if (1 in augLeft) {
                this.leftPlacements[1] = new DrawableSquarePlacement(
                    this.gridSettings,
                    PlacementPositionType.LEFT_TOP,
                    augLeft[1],
                );
            }
            if (0 in augRight) {
                this.rightPlacements[0] = new DrawableSquarePlacement(
                    this.gridSettings,
                    PlacementPositionType.RIGHT_TOP,
                    augRight[0],
                );
            }
            if (1 in augRight) {
                this.rightPlacements[1] = new DrawableSquarePlacement(
                    this.gridSettings,
                    PlacementPositionType.RIGHT_BOTTOM,
                    augRight[1],
                );
            }
        }
        const addHashes = (team: TeamType, p?: IDrawablePlacement) => {
            if (!p) return;
            const target = this.allowedPlacementCellHashesPerTeam.get(team);
            for (const hash of p.possibleCellHashes()) {
                this.allowedPlacementCellHashes.add(hash);
                target?.add(hash);
            }
        };

        addHashes(TeamVals.LEFT, this.leftPlacements[0]);
        addHashes(TeamVals.LEFT, this.leftPlacements[1]);
        addHashes(TeamVals.RIGHT, this.rightPlacements[0]);
        addHashes(TeamVals.RIGHT, this.rightPlacements[1]);
    }
    /** Draw all placements or only for a specific team */
    public draw(gfx: Graphics, frameContainer: Container, team?: TeamType): void {
        const drawOne = (p?: IDrawablePlacement) => p && p.draw(gfx, frameContainer);

        if (team === undefined) {
            drawOne(this.leftPlacements[0]);
            drawOne(this.leftPlacements[1]);
            drawOne(this.rightPlacements[0]);
            drawOne(this.rightPlacements[1]);
        } else if (team === TeamVals.LEFT) {
            drawOne(this.leftPlacements[0]);
            drawOne(this.leftPlacements[1]);
        } else if (team === TeamVals.RIGHT) {
            drawOne(this.rightPlacements[0]);
            drawOne(this.rightPlacements[1]);
        }
    }
    public getPlacement(teamType: TeamType, placementIndex: number): IPlacement | undefined {
        const placements = teamType === TeamVals.LEFT ? this.leftPlacements : this.rightPlacements;
        return placementIndex in placements ? placements[placementIndex] : undefined;
    }
    public getAllowedPlacementCellHashes(): ReadonlySet<number> {
        return this.allowedPlacementCellHashes;
    }
    public getAllowedPlacementCellHashesForTeam(team: TeamType): ReadonlySet<number> | undefined {
        return this.allowedPlacementCellHashesPerTeam.get(team);
    }
}
