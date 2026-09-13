import { RangedProjectiles as Legacy } from "./RangedProjectiles";
import {
    RangedProjectiles as Approved,
    type IRangedProjectilesContext,
    type IFireProjectileOptions,
} from "./LevelOneRangedProjectiles";
export * from "./LevelOneRangedProjectiles";
export class RangedProjectiles extends Legacy {
    private readonly approved: Approved;
    public constructor(context: IRangedProjectilesContext) {
        super(context);
        this.approved = new Approved(context);
    }
    private usesApproved(opts: IFireProjectileOptions): boolean {
        return !!(opts.orcAxe || opts.arbalesterBolt || opts.centaurSpear || opts.dryadArrow);
    }
    public override hasActive(): boolean {
        return super.hasActive() || this.approved.hasActive();
    }
    public prepare(opts: IFireProjectileOptions): Promise<void> {
        return this.usesApproved(opts) ? this.approved.prepare(opts) : Promise.resolve();
    }
    public override fire(opts: IFireProjectileOptions): Promise<void> {
        return this.usesApproved(opts) ? this.approved.fire(opts) : super.fire(opts);
    }
    public override update(dt: number): void {
        super.update(dt);
        this.approved.update(dt);
    }
    public override clear(options: { keepInFlight?: boolean } = {}): void {
        super.clear(options);
        this.approved?.clear(options);
    }
    public override destroy(): void {
        super.destroy();
        this.approved.destroy();
    }
}
