import type { GridSettings, HoCMath, UnitProperties } from "@heroesofcrypto/common";
import { Container, Graphics } from "pixi.js";

type HelpingHandProperties = Pick<
    UnitProperties,
    "applied_buffs" | "applied_buffs_laps" | "helping_hand_caster_id" | "helping_hand_penalty_id"
>;

export interface HelpingHandUnit {
    getUnitProperties(): HelpingHandProperties;
    hasBuffActive(name: string): boolean;
    isDead(): boolean;
    getDisplayedAmount?(): number;
    getVisualCenter?(settings: GridSettings): HoCMath.XY;
}

interface HelpingHandLinksContext {
    getUnits(): ReadonlyMap<string, HelpingHandUnit> | undefined;
    getGridSettings(): GridSettings | undefined;
    attachToWorldRoot(container: Container, zIndex: number): void;
}

interface Link {
    graphics: Graphics;
    casterId: string;
    penaltyId: string;
    phase: number;
    seen: number;
}

interface PresentedLink {
    casterId: string;
    penaltyId: string;
    caster: HelpingHandUnit;
    recipient: HelpingHandUnit;
    penalty?: HelpingHandUnit;
}

const TAU = Math.PI * 2;
const STRAND_SEGMENTS = 16;
const MOTE_COUNT = 4;

const linkPhase = (key: string): number => {
    let hash = 2166136261;
    for (let index = 0; index < key.length; index++) hash = Math.imul(hash ^ key.charCodeAt(index), 16777619);
    return ((hash >>> 0) / 4294967296) * TAU;
};

const hasHelpingHand = (unit: HelpingHandUnit, properties: HelpingHandProperties): boolean => {
    if (unit.hasBuffActive("Helping Hand")) return true;
    return properties.applied_buffs.some(
        (name, index) => name === "Helping Hand" && properties.applied_buffs_laps[index] > 0,
    );
};

const isPresented = (unit: HelpingHandUnit): boolean => {
    const amount = unit.getDisplayedAmount?.();
    return amount === undefined ? !unit.isDead() : amount > 0;
};

export class HelpingHandLinks {
    private readonly links = new Map<string, Link>();
    private readonly presentation = new Map<string, PresentedLink>();
    private readonly ended = new Map<string, Pick<PresentedLink, "casterId" | "penaltyId">>();
    private elapsedSeconds = 0;
    private frame = 0;
    public constructor(private readonly context: HelpingHandLinksContext) {}
    public get active(): boolean {
        return this.links.size > 0;
    }
    public capturePresentation(): void {
        this.presentation.clear();
        const units = this.context.getUnits();
        if (!units) return;
        for (const [recipientId, recipient] of units) {
            const link = this.liveLink(recipientId, recipient, units);
            if (link) this.presentation.set(recipientId, link);
        }
    }
    public endForUnit(unitId: string): void {
        for (const [recipientId, link] of this.presentation) {
            if (recipientId !== unitId && link.casterId !== unitId && link.penaltyId !== unitId) continue;
            this.ended.set(recipientId, { casterId: link.casterId, penaltyId: link.penaltyId });
            this.presentation.delete(recipientId);
        }
        for (const [recipientId, link] of this.links) {
            if (recipientId !== unitId && link.casterId !== unitId && link.penaltyId !== unitId) continue;
            this.ended.set(recipientId, { casterId: link.casterId, penaltyId: link.penaltyId });
            link.graphics.destroy();
        }
    }
    private wasEnded(recipientId: string, casterId: string, penaltyId: string): boolean {
        const ended = this.ended.get(recipientId);
        if (!ended) return false;
        if (ended.casterId === casterId && ended.penaltyId === penaltyId) return true;
        this.ended.delete(recipientId);
        return false;
    }
    private liveLink(
        recipientId: string,
        recipient: HelpingHandUnit,
        units: ReadonlyMap<string, HelpingHandUnit>,
    ): PresentedLink | undefined {
        const properties = recipient.getUnitProperties?.();
        if (!properties) return undefined;
        const casterId = properties.helping_hand_caster_id;
        const penaltyId = properties.helping_hand_penalty_id;
        if (!casterId || !penaltyId || recipient.isDead() || !hasHelpingHand(recipient, properties)) return undefined;
        const caster = units.get(casterId);
        if (!caster || caster.isDead() || !isPresented(caster) || !isPresented(recipient)) return undefined;
        const penalty = units.get(penaltyId);
        if (penalty && (penalty.isDead() || !isPresented(penalty))) return undefined;
        if (this.wasEnded(recipientId, casterId, penaltyId)) return undefined;
        return { casterId, penaltyId, caster, recipient, penalty };
    }
    public update(dt: number): void {
        if (Number.isFinite(dt) && dt > 0) this.elapsedSeconds = (this.elapsedSeconds + dt) % 120;
        const units = this.context.getUnits();
        const settings = this.context.getGridSettings();
        if (!units || !settings) {
            this.clear();
            return;
        }
        const cell = settings.getCellSize();
        if (!Number.isFinite(cell) || cell <= 0) {
            this.clear();
            return;
        }
        this.frame++;
        for (const recipientId of this.ended.keys()) {
            const recipient = units.get(recipientId);
            const properties = recipient?.getUnitProperties?.();
            if (
                !recipient ||
                !properties?.helping_hand_caster_id ||
                !properties.helping_hand_penalty_id ||
                !hasHelpingHand(recipient, properties)
            )
                this.ended.delete(recipientId);
        }
        for (const [recipientId, recipient] of units) {
            const current = this.liveLink(recipientId, recipient, units);
            if (!current) continue;
            const captured = this.presentation.get(recipientId);
            if (captured) {
                if (captured.casterId === current.casterId && captured.penaltyId === current.penaltyId)
                    this.presentation.set(recipientId, current);
                else this.presentation.delete(recipientId);
            }
            this.showLink(recipientId, current, settings, cell);
        }
        for (const [recipientId, captured] of this.presentation) {
            if (this.links.get(recipientId)?.seen === this.frame) continue;
            const caster = units.get(captured.casterId) ?? captured.caster;
            const recipient = units.get(recipientId) ?? captured.recipient;
            const penalty = units.get(captured.penaltyId) ?? captured.penalty;
            const properties = recipient.getUnitProperties();
            if (
                properties.helping_hand_caster_id ||
                properties.helping_hand_penalty_id ||
                (!caster.isDead() && !recipient.isDead() && !penalty?.isDead()) ||
                !isPresented(caster) ||
                !isPresented(recipient) ||
                (penalty && !isPresented(penalty)) ||
                this.wasEnded(recipientId, captured.casterId, captured.penaltyId)
            ) {
                this.presentation.delete(recipientId);
                continue;
            }
            this.showLink(recipientId, { ...captured, caster, recipient, penalty }, settings, cell);
        }
        for (const link of this.links.values()) {
            if (link.seen !== this.frame) link.graphics.destroy();
        }
    }
    private showLink(recipientId: string, endpoints: PresentedLink, settings: GridSettings, cell: number): void {
        const { casterId, penaltyId, caster, recipient } = endpoints;
        const from = caster.getVisualCenter?.(settings);
        const to = recipient.getVisualCenter?.(settings);
        if (!from || !to || ![from.x, from.y, to.x, to.y].every(Number.isFinite)) return;
        let link = this.links.get(recipientId);
        if (link && (link.casterId !== casterId || link.penaltyId !== penaltyId)) {
            link.graphics.destroy();
            link = undefined;
        }
        if (!link) {
            const graphics = new Graphics();
            graphics.label = "helping-hand-link";
            graphics.eventMode = "none";
            graphics.blendMode = "add";
            link = {
                graphics,
                casterId,
                penaltyId,
                phase: linkPhase(`${casterId}:${recipientId}:${penaltyId}`),
                seen: this.frame,
            };
            this.links.set(recipientId, link);
            graphics.once("destroyed", () => {
                if (this.links.get(recipientId)?.graphics !== graphics) return;
                this.links.delete(recipientId);
                this.presentation.delete(recipientId);
            });
            this.context.attachToWorldRoot(graphics, 5502);
        }
        link.seen = this.frame;
        link.graphics.position.set(from.x, from.y);
        this.draw(link, to.x - from.x, to.y - from.y, cell);
    }
    private draw(link: Link, dx: number, dy: number, cell: number): void {
        const graphics = link.graphics;
        const distance = Math.hypot(dx, dy);
        const nx = distance > 0 ? -dy / distance : 0;
        const ny = distance > 0 ? dx / distance : 1;
        const bend = Math.min(cell * 0.8, distance * 0.18);
        const phase = link.phase + (this.elapsedSeconds * TAU) / 6;
        const pulse = 0.8 + Math.sin(link.phase + (this.elapsedSeconds * TAU) / 4) * 0.2;
        const sample = (t: number, braid: number): HoCMath.XY => {
            const envelope = Math.sin(t * Math.PI);
            const wave = envelope * cell * (0.035 * Math.sin(t * TAU + phase) + braid * 0.065);
            return { x: dx * t + nx * wave, y: dy * t + bend * envelope + ny * wave };
        };
        const strand = (braid: number, width: number, color: number, alpha: number): void => {
            graphics.moveTo(0, 0);
            for (let index = 1; index < STRAND_SEGMENTS; index++) {
                const point = sample(index / STRAND_SEGMENTS, braid);
                graphics.lineTo(point.x, point.y);
            }
            graphics.lineTo(dx, dy).stroke({ width: cell * width, color, alpha: alpha * pulse });
        };
        graphics.clear();
        strand(0, 0.12, 0xfcae28, 0.035);
        strand(0, 0.05, 0xffc84f, 0.15);
        strand(0, 0.014, 0xfff1b1, 0.82);
        strand(Math.sin(phase), 0.009, 0xffd776, 0.45);
        strand(-Math.sin(phase), 0.009, 0xffd776, 0.45);
        for (let index = 0; index < MOTE_COUNT; index++) {
            const t = (this.elapsedSeconds / 5 + index / MOTE_COUNT + link.phase / TAU) % 1;
            const point = sample(t, Math.sin(phase + index) * 0.55);
            const brightness = Math.sin(t * Math.PI);
            const radius = cell * (0.018 + 0.01 * brightness);
            graphics.circle(point.x, point.y, radius * 3.5).fill({ color: 0xffc44d, alpha: brightness * 0.065 });
            graphics.circle(point.x, point.y, radius * 1.65).fill({ color: 0xffd570, alpha: brightness * 0.2 });
            graphics.circle(point.x, point.y, radius * 0.6).fill({ color: 0xfff5ce, alpha: brightness * 0.95 });
        }
        for (const point of [
            { x: 0, y: 0 },
            { x: dx, y: dy },
        ]) {
            const radius = cell * (0.12 + 0.015 * pulse);
            graphics.ellipse(point.x, point.y, radius, radius * 0.6).stroke({
                color: 0xffc54e,
                width: cell * 0.055,
                alpha: 0.09 * pulse,
            });
            graphics.ellipse(point.x, point.y, radius, radius * 0.6).stroke({
                color: 0xffdf8b,
                width: cell * 0.012,
                alpha: 0.55 * pulse,
            });
            graphics.circle(point.x, point.y, cell * 0.035).fill({ color: 0xffefb0, alpha: 0.65 * pulse });
        }
    }
    public clear(): void {
        for (const link of this.links.values()) link.graphics.destroy();
        this.links.clear();
        this.presentation.clear();
        this.ended.clear();
        this.elapsedSeconds = 0;
    }
}
