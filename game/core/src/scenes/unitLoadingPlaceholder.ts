import { Container, Graphics, Text, TextStyle } from "pixi.js";
import type { TeamType } from "@heroesofcrypto/common";

import { HOC_NUMERIC_FONT_FAMILY } from "../fontFamilies";
import { teamColor } from "./teamColors";

/**
 * What a creature shows on the board while its board image is still downloading: a token in its team colour with its
 * stack count. The match stays playable before any art arrives, since every unit is visible, on its side and countable,
 * and the unit swaps the token for its real sprite the moment the image lands.
 */

export const UNIT_LOADING_PLACEHOLDER_LABEL = "unit-loading-placeholder";

/** The token's diameter as a share of the unit's footprint side. */
const TOKEN_SIDE_FRACTION = 0.72;
const RING_COLOR = 0xdcb158;

export interface UnitLoadingPlaceholderState {
    /** Board position (already projected when the board uses the battlefield projection). */
    x: number;
    y: number;
    /** The unit's shorter footprint side in board units, perspective included. */
    side: number;
    team: TeamType;
    amount: number;
    /** Counter-scale that keeps the token round inside a non-uniform board camera. */
    compensation: { x: number; y: number };
}

export class UnitLoadingPlaceholder {
    private container?: Container;
    private disc?: Graphics;
    private label?: Text;
    private drawnTeam?: TeamType;
    private drawnRadius = -1;
    /** Show the token at the unit's current spot, creating or redrawing it only when something changed. */
    public sync(worldRoot: Container, state: UnitLoadingPlaceholderState): void {
        if (!this.container || this.container.destroyed || !this.disc || !this.label) {
            this.container = new Container();
            this.container.label = UNIT_LOADING_PLACEHOLDER_LABEL;
            this.disc = new Graphics();
            this.label = new Text({
                text: "",
                style: new TextStyle({
                    fontFamily: HOC_NUMERIC_FONT_FAMILY,
                    fontWeight: "700",
                    fill: 0xffffff,
                    stroke: { color: 0x000000, width: 3 },
                }),
            });
            this.label.anchor.set(0.5);
            this.container.addChild(this.disc, this.label);
            this.drawnTeam = undefined;
            this.drawnRadius = -1;
        }
        if (this.container.parent !== worldRoot) {
            if (!worldRoot.sortableChildren) worldRoot.sortableChildren = true;
            worldRoot.addChild(this.container);
        }

        const radius = Math.max(4, (state.side * TOKEN_SIDE_FRACTION) / 2);
        if (this.drawnTeam !== state.team || this.drawnRadius !== radius) {
            this.disc
                .clear()
                .circle(0, 0, radius)
                .fill({ color: teamColor(state.team), alpha: 0.55 })
                .stroke({ color: RING_COLOR, width: Math.max(1.5, radius * 0.12), alpha: 0.9 });
            this.label.style.fontSize = Math.max(8, Math.round(radius * 0.8));
            this.drawnTeam = state.team;
            this.drawnRadius = radius;
        }
        const text = String(Math.max(0, Math.trunc(state.amount)));
        if (this.label.text !== text) {
            this.label.text = text;
        }

        this.container.position.set(state.x, state.y);
        // The board is y-up (unit sprites flip their Y too), so flip the token to keep the count upright.
        this.container.scale.set(state.compensation.x, -state.compensation.y);
        this.container.zIndex = 4000 - state.y;
    }
    public get isShown(): boolean {
        return !!this.container && !this.container.destroyed;
    }
    public destroy(): void {
        if (this.container && !this.container.destroyed) {
            this.container.destroy({ children: true });
        }
        this.container = undefined;
        this.disc = undefined;
        this.label = undefined;
        this.drawnTeam = undefined;
        this.drawnRadius = -1;
    }
}
