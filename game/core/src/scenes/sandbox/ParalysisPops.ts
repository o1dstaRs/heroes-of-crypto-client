import type { Container } from "pixi.js";
import { CommonFlagPops } from "./CommonFlagPops";

type Anchor = Readonly<{ x: number; y: number }>;

/** Painted cels derived from the Paralysis icon, using the same playback as Ogre Mage's symbols. */
export class ParalysisPops {
    private readonly layer: CommonFlagPops;
    public constructor(
        attach: (container: Container, zIndex: number) => void,
        now: () => number = () => performance.now(),
    ) {
        this.layer = new CommonFlagPops("paralysis", attach, now);
    }
    public async spawn(id: string, cell: number, follow: () => Anchor | undefined): Promise<void> {
        const anchor = follow();
        if (anchor) await this.layer.spawn(id, anchor, cell, follow);
    }
    public update(): void {
        this.layer.update(0);
    }
    public clear(): void {
        this.layer.clear();
    }
}
