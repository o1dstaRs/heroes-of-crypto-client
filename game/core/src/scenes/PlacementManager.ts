// game/core/src/scenes/PlacementManager.ts
import { Graphics } from "pixi.js";
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
    private lowerPlacements: [IDrawablePlacement?, IDrawablePlacement?] = [];
    private upperPlacements: [IDrawablePlacement?, IDrawablePlacement?] = [];
    private allowedPlacementCellHashes = new Set<number>();
    private allowedPlacementCellHashesPerTeam = new Map<TeamType, Set<number>>([
        [TeamVals.LOWER, new Set<number>()],
        [TeamVals.UPPER, new Set<number>()],
    ]);
    public constructor(private readonly gridSettings: GridSettings) {
        this.rebuildFromFightProps();
    }
    /** Rebuild placements + allowed hashes from current FightProperties */
    public rebuildFromFightProps(): void {
        this.lowerPlacements = [];
        this.upperPlacements = [];

        this.allowedPlacementCellHashes.clear();
        this.allowedPlacementCellHashesPerTeam.get(TeamVals.LOWER)!.clear();
        this.allowedPlacementCellHashesPerTeam.get(TeamVals.UPPER)!.clear();

        const fp = FightStateManager.getInstance().getFightProperties();
        const augLower = fp.getAugmentPlacement(TeamVals.LOWER);
        const augUpper = fp.getAugmentPlacement(TeamVals.UPPER);
        const placementType = fp.getPlacementType();

        if (placementType === PlacementType.RECTANGLE) {
            if (0 in augLower) {
                this.lowerPlacements[0] = new DrawableRectanglePlacement(
                    this.gridSettings,
                    PlacementPositionType.LOWER_LEFT,
                    augLower[0],
                );
            }
            if (0 in augUpper) {
                this.upperPlacements[0] = new DrawableRectanglePlacement(
                    this.gridSettings,
                    PlacementPositionType.UPPER_LEFT,
                    augUpper[0],
                );
            }
        } else {
            if (0 in augLower) {
                this.lowerPlacements[0] = new DrawableSquarePlacement(
                    this.gridSettings,
                    PlacementPositionType.LOWER_LEFT,
                    augLower[0],
                );
            }
            if (1 in augLower) {
                this.lowerPlacements[1] = new DrawableSquarePlacement(
                    this.gridSettings,
                    PlacementPositionType.LOWER_RIGHT,
                    augLower[1],
                );
            }
            if (0 in augUpper) {
                this.upperPlacements[0] = new DrawableSquarePlacement(
                    this.gridSettings,
                    PlacementPositionType.UPPER_RIGHT,
                    augUpper[0],
                );
            }
            if (1 in augUpper) {
                this.upperPlacements[1] = new DrawableSquarePlacement(
                    this.gridSettings,
                    PlacementPositionType.UPPER_LEFT,
                    augUpper[1],
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

        addHashes(TeamVals.LOWER, this.lowerPlacements[0]);
        addHashes(TeamVals.LOWER, this.lowerPlacements[1]);
        addHashes(TeamVals.UPPER, this.upperPlacements[0]);
        addHashes(TeamVals.UPPER, this.upperPlacements[1]);
    }
    /** Draw all placements or only for a specific team */
    public draw(gfx: Graphics, team?: TeamType): void {
        const drawOne = (p?: IDrawablePlacement) => p && p.draw(gfx);

        if (team === undefined) {
            drawOne(this.lowerPlacements[0]);
            drawOne(this.lowerPlacements[1]);
            drawOne(this.upperPlacements[0]);
            drawOne(this.upperPlacements[1]);
        } else if (team === TeamVals.LOWER) {
            drawOne(this.lowerPlacements[0]);
            drawOne(this.lowerPlacements[1]);
        } else if (team === TeamVals.UPPER) {
            drawOne(this.upperPlacements[0]);
            drawOne(this.upperPlacements[1]);
        }
    }
    public getPlacement(teamType: TeamType, placementIndex: number): IPlacement | undefined {
        const placements = teamType === TeamVals.LOWER ? this.lowerPlacements : this.upperPlacements;
        return placementIndex in placements ? placements[placementIndex] : undefined;
    }
    public getAllowedPlacementCellHashes(): ReadonlySet<number> {
        return this.allowedPlacementCellHashes;
    }
    public getAllowedPlacementCellHashesForTeam(team: TeamType): ReadonlySet<number> | undefined {
        return this.allowedPlacementCellHashesPerTeam.get(team);
    }
}
