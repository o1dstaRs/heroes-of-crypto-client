import { TextureSource } from "pixi.js";

interface Residency {
    rendererUid: number | undefined;
    allocation: unknown;
}

/** A completed warm-up is valid only for the GPU allocation it actually prepared. */
export class AtlasPrewarmSources extends WeakSet<object> {
    private readonly residency = new WeakMap<object, Residency>();
    public constructor(private readonly rendererUid: () => number | undefined) {
        super();
    }
    public override add(source: object): this {
        if (source instanceof TextureSource) {
            const rendererUid = this.rendererUid();
            this.residency.set(source, {
                rendererUid,
                allocation: rendererUid === undefined ? undefined : source._gpuData[rendererUid],
            });
        }
        return super.add(source);
    }
    public override has(source: object): boolean {
        if (!super.has(source)) return false;
        const previous = this.residency.get(source);
        if (previous && source instanceof TextureSource) {
            const rendererUid = this.rendererUid();
            if (
                source.destroyed ||
                previous.rendererUid !== rendererUid ||
                previous.allocation !== (rendererUid === undefined ? undefined : source._gpuData[rendererUid])
            ) {
                this.delete(source);
                return false;
            }
        }
        return true;
    }
    public override delete(source: object): boolean {
        this.residency.delete(source);
        return super.delete(source);
    }
}
