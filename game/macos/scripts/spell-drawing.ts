// The native build records the spell modules' Pixi draw calls for SwiftUI Canvas.
// These classes cover the display operations used by those modules and have no browser or GPU dependencies.
type Transform = [number, number, number, number, number, number];
type Paint = { color?: number; alpha?: number; width?: number };
type Shape = { kind: "points"; points: number[] } | { kind: "circle"; x: number; y: number; radius: number };

function concatenate([a, b, c, d, x, y]: Transform, [e, f, g, h, u, v]: Transform): Transform {
    return [a * e + c * f, b * e + d * f, a * g + c * h, b * g + d * h, a * u + c * v + x, b * u + d * v + y];
}

export class Point {
    constructor(
        public x = 0,
        public y = x,
    ) {}
    set(x: number, y = x): this {
        this.x = x;
        this.y = y;
        return this;
    }

    copyFrom(point: Point): void {
        this.set(point.x, point.y);
    }
}

export class Container {
    children: Container[] = [];
    parent?: Container;
    position = new Point();
    scale = new Point(1);
    rotation = 0;
    alpha = 1;
    zIndex = 0;
    sortableChildren = false;
    visible = true;
    renderable = true;
    destroyed = false;
    blendMode = "normal";
    filters: (BlurFilter | Filter)[] | null = null;

    addChild(...nodes: Container[]): void {
        for (const node of nodes) {
            node.detach();
            node.parent = this;
            this.children.push(node);
        }
    }

    private detach(): void {
        if (!this.parent) return;
        const siblings = this.parent.children;
        siblings.splice(siblings.indexOf(this), 1);
        this.parent = undefined;
    }

    destroy(options?: { children?: boolean }): void {
        this.detach();
        if (options?.children) for (const child of this.children.slice()) child.destroy(options);
        this.destroyed = true;
    }

    transform(): Transform {
        const cos = Math.cos(this.rotation),
            sin = Math.sin(this.rotation);
        return [
            cos * this.scale.x,
            sin * this.scale.x,
            -sin * this.scale.y,
            cos * this.scale.y,
            this.position.x,
            this.position.y,
        ];
    }

    getGlobalTransform() {
        let matrix = this.transform();
        for (let node = this.parent; node; node = node.parent) matrix = concatenate(node.transform(), matrix);
        const [a, b, c, d, tx, ty] = matrix;
        return { a, b, c, d, tx, ty };
    }

    toGlobal(point: Point, out: Point): Point {
        const { a, b, c, d, tx, ty } = this.getGlobalTransform();
        out.set(a * point.x + c * point.y + tx, b * point.x + d * point.y + ty);
        return out;
    }

    toLocal(point: Point, _from: undefined, out: Point): Point {
        const { a, b, c, d, tx, ty } = this.getGlobalTransform();
        const x = point.x - tx;
        const y = point.y - ty;
        const det = a * d - b * c;
        out.set((d * x - c * y) / det, (a * y - b * x) / det);
        return out;
    }
}

export class Rectangle {
    constructor(
        public x: number,
        public y: number,
        public width: number,
        public height: number,
    ) {}
}

type Source = { id: number; width: number; height: number };
export const materialPixels: Uint8ClampedArray[] = [];

export class Texture {
    static readonly WHITE = new Texture({ source: { id: 0, width: 1, height: 1 } });
    readonly source: Source;
    readonly frame: Rectangle;

    constructor({ source, frame }: { source: Source; frame?: Rectangle }) {
        this.source = source;
        this.frame = frame ?? new Rectangle(0, 0, source.width, source.height);
    }

    static from(canvas: { pixels: Uint8ClampedArray; width: number; height: number }): Texture {
        const id = materialPixels.push(canvas.pixels);
        return new Texture({ source: { id, width: canvas.width, height: canvas.height } });
    }

    get index(): number {
        const { x, y, width, height } = this.frame;
        return x / width + (y / height) * Math.floor(this.source.width / width);
    }

    // The decoded materials live for the lifetime of the native renderer.
    destroy(): void {}
}

export const atlasSources = new Map<string, Source>();
export const Assets = {
    async load(name: string): Promise<Texture> {
        const source = atlasSources.get(name);
        if (!source) throw new Error(`Unknown spell atlas ${name}`);
        return new Texture({ source });
    },
};

export class Sprite extends Container {
    anchor = new Point();
    tint = 0xffffff;
    width = 0;
    height = 0;

    constructor(public texture = Texture.WHITE) {
        super();
        this.width = texture.frame.width;
        this.height = texture.frame.height;
    }
}

export class GraphicsContext {
    shapes: { shape: Shape; paint: Paint }[] = [];
    private shape: Shape = { kind: "points", points: [] };

    circle(x: number, y: number, radius: number): this {
        this.shape = { kind: "circle", x, y, radius };
        return this;
    }

    star(x: number, y: number, points: number, radius: number, inner: number): this {
        const outline: number[] = [];
        for (let i = 0; i < points * 2; i++) {
            const length = i % 2 === 0 ? radius : inner;
            const angle = (i / points) * Math.PI - Math.PI / 2;
            outline.push(x + length * Math.cos(angle), y + length * Math.sin(angle));
        }
        outline.push(outline[0], outline[1]);
        return this.poly(outline);
    }

    poly(points: number[]): this {
        this.shape = { kind: "points", points };
        return this;
    }

    fill(paint: Paint | number): this {
        return this.stroke(typeof paint === "number" ? { color: paint } : paint);
    }

    stroke(paint: Paint): this {
        this.shapes.push({ shape: this.shape, paint });
        return this;
    }

    destroy(): void {
        this.shapes.length = 0;
    }
}

export class Graphics extends Container {
    private shape: Shape = { kind: "points", points: [] };
    constructor(readonly context = new GraphicsContext()) {
        super();
    }
    clear(): this {
        this.context.shapes.length = 0;
        return this;
    }
    moveTo(x: number, y: number): this {
        return this.poly([x, y]);
    }
    lineTo(x: number, y: number): this {
        if (this.shape.kind === "points") this.shape.points.push(x, y);
        return this;
    }
    poly(points: number[]): this {
        this.shape = { kind: "points", points };
        return this;
    }
    circle(x: number, y: number, radius: number): this {
        this.shape = { kind: "circle", x, y, radius };
        return this;
    }
    fill(paint: Paint | number): this {
        return this.stroke(typeof paint === "number" ? { color: paint } : paint);
    }
    stroke(paint: Paint): this {
        if (this.shape.kind === "circle") this.context.circle(this.shape.x, this.shape.y, this.shape.radius);
        else this.context.poly(this.shape.points);
        this.context.stroke(paint);
        return this;
    }
}

export class BlurFilter {
    constructor(readonly options: { strength: number }) {}
    destroy(): void {}
}

export class Filter {
    readonly resources: { atmosphere: { uniforms: Record<string, Float32Array | number> } };
    constructor(options: { resources: { atmosphere: Record<string, { value: Float32Array | number }> } }) {
        const uniforms = Object.fromEntries(
            Object.entries(options.resources.atmosphere).map(([key, entry]) => [key, entry.value]),
        );
        this.resources = { atmosphere: { uniforms } };
    }
    apply(): void {}
    destroy(): void {}
}
export class Matrix {}
export const GlProgram = { from: () => null };

// Each command has a shared transform and paint followed by a sprite, path, or circle. Layer
// packets retain Pixi depth so the native wall flames can interleave with creature sprites.
export function recordLayer(layer: Container, world: Transform = [1, 0, 0, -1, 0, 0]): Float32Array {
    const list: number[] = [];
    function record(node: Container, parent: Transform, opacity: number): void {
        if (!node.visible || !node.renderable || node.destroyed || node.alpha <= 0) return;
        const matrix = concatenate(parent, node.transform());
        const alpha = opacity * node.alpha;
        const add = node.blendMode === "add" ? 1 : 0;
        const blur = node.filters?.find((f) => f instanceof BlurFilter)?.options.strength ?? 0;
        if (node instanceof Sprite && node.width > 0 && node.height > 0) {
            list.push(
                0,
                alpha,
                add,
                node.tint,
                blur,
                ...matrix,
                node.texture.source.id,
                node.texture.index,
                -node.anchor.x * node.width,
                -node.anchor.y * node.height,
                node.width,
                node.height,
            );
        } else if (node instanceof Graphics) {
            for (const { shape, paint } of node.context.shapes) {
                const header = [alpha * (paint.alpha ?? 1), add, paint.color ?? 0xffffff, blur, ...matrix];
                if (shape.kind === "circle") list.push(2, ...header, shape.x, shape.y, shape.radius);
                else list.push(1, ...header, paint.width ?? 0, shape.points.length, ...shape.points);
            }
        }
        const children = node.sortableChildren
            ? node.children.slice().sort((a, b) => a.zIndex - b.zIndex)
            : node.children;
        for (const child of children) record(child, matrix, alpha);
    }
    record(layer, world, 1);
    return new Float32Array(list);
}
