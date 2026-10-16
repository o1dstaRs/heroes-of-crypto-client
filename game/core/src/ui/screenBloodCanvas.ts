type Point = { x: number; y: number };
type Rivulet = Point & {
    originX: number;
    radius: number;
    speed: number;
    phase: number;
    remaining: number;
    opacity: number;
};

const FADE_START_MS = 2_000;
const LIFETIME_MS = 14_000;

/** Persistent, wipeable ink on glass; the display layer supplies fading without restoring erased pixels. */
export class ScreenBloodCanvas {
    private readonly ctx: CanvasRenderingContext2D;
    private readonly display: CanvasRenderingContext2D;
    private readonly ink = document.createElement("canvas");
    private readonly probe = document.createElement("canvas");
    private readonly brush = document.createElement("canvas");
    private width = 1;
    private height = 1;
    private ratio = 1;
    private active = false;
    private inkAtImpact = 0;
    private previous?: Point;
    private probeTimer?: ReturnType<typeof setTimeout>;
    private frame?: number;
    private lastFrame = 0;
    private lastImpact = 0;
    private rivulets: Rivulet[] = [];
    public constructor(
        private readonly canvas: HTMLCanvasElement,
        private readonly onActiveChange: (active: boolean) => void,
    ) {
        this.ctx = this.ink.getContext("2d")!;
        this.display = canvas.getContext("2d")!;
        this.probe.width = 64;
        this.probe.height = 40;
        this.brush.width = this.brush.height = 128;
        const brush = this.brush.getContext("2d")!;
        const feather = brush.createRadialGradient(64, 64, 0, 64, 64, 64);
        feather.addColorStop(0, "#000");
        feather.addColorStop(0.72, "#000");
        feather.addColorStop(1, "transparent");
        brush.fillStyle = feather;
        brush.fillRect(0, 0, 128, 128);
    }
    public resize(width: number, height: number, ratio = window.devicePixelRatio || 1): void {
        width = Math.max(1, Math.round(width));
        height = Math.max(1, Math.round(height));
        ratio = Math.min(2, Math.max(1, ratio));
        if (width === this.width && height === this.height && ratio === this.ratio) return;
        // Preserve the erased pixels too: repainting the original splats would undo the player's wiping.
        const old = this.active ? document.createElement("canvas") : undefined;
        if (old) {
            old.width = this.ink.width;
            old.height = this.ink.height;
            old.getContext("2d")!.drawImage(this.ink, 0, 0);
        }
        const scaleX = width / this.width;
        const scaleY = height / this.height;
        for (const drip of this.rivulets) {
            drip.x *= scaleX;
            drip.originX *= scaleX;
            drip.y *= scaleY;
            drip.radius *= Math.min(scaleX, scaleY);
            drip.speed *= scaleY;
        }
        this.width = width;
        this.height = height;
        this.ratio = ratio;
        this.ink.width = this.canvas.width = Math.round(width * ratio);
        this.ink.height = this.canvas.height = Math.round(height * ratio);
        this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        this.display.setTransform(ratio, 0, 0, ratio, 0, 0);
        if (old) this.ctx.drawImage(old, 0, 0, width, height);
        this.paint(performance.now());
        this.leave();
    }
    public splash(impacts = 1): void {
        if (!Number.isFinite(impacts) || impacts < 1) return;
        const now = performance.now();
        if (this.active) {
            // Bake the old fade before starting the new impact's lifetime: old blood must not flash opaque.
            const opacity = this.opacity(now);
            this.ctx.save();
            this.ctx.globalCompositeOperation = "destination-in";
            this.ctx.fillStyle = `rgba(0, 0, 0, ${opacity})`;
            this.ctx.fillRect(0, 0, this.width, this.height);
            this.ctx.restore();
            for (const drip of this.rivulets) drip.opacity *= opacity;
        }
        this.lastImpact = now;
        const scale = Math.max(0.5, Math.min(1.3, Math.min(this.width, this.height) / 750));
        this.ctx.save();
        this.ctx.globalCompositeOperation = "source-over";
        // A volley remains readable even when several ricochets arrive in the same frame.
        for (let i = 0; i < Math.min(3, impacts); i++) {
            const left = Math.random() < 0.5;
            this.drawSplat(
                this.width * (left ? this.between(0.2, 0.4) : this.between(0.6, 0.8)),
                this.height * this.between(0.28, 0.7),
                this.between(110, 145) * scale,
            );
            this.drawSplat(
                this.width * this.between(0.3, 0.7),
                this.height * this.between(0.2, 0.78),
                this.between(40, 60) * scale,
            );
        }
        this.ctx.restore();
        this.rivulets = this.rivulets.slice(-24);
        this.leave();
        this.paint(now);
        this.inkAtImpact = this.measureInk();
        if (!this.active) {
            this.active = true;
            this.onActiveChange(true);
        }
        if (this.frame === undefined) {
            this.lastFrame = now;
            this.frame = requestAnimationFrame(this.animate);
        }
    }
    public wipe(x: number, y: number): void {
        if (!this.active) return;
        if (x < 0 || y < 0 || x > this.width || y > this.height) {
            this.leave();
            return;
        }
        const radius = Math.max(34, Math.min(80, Math.min(this.width, this.height) * 0.085));
        const from = this.previous ?? { x, y };
        const steps = Math.max(1, Math.ceil(Math.hypot(x - from.x, y - from.y) / (radius * 0.3)));
        this.ctx.save();
        this.ctx.globalCompositeOperation = "destination-out";
        for (let i = 0; i <= steps; i++) {
            const px = from.x + ((x - from.x) * i) / steps;
            const py = from.y + ((y - from.y) * i) / steps;
            this.ctx.drawImage(this.brush, px - radius, py - radius, radius * 2, radius * 2);
        }
        this.ctx.restore();
        // A wiped droplet stops feeding its trail. Animating it again would paint blood back onto clean glass.
        const dx = x - from.x;
        const dy = y - from.y;
        const lengthSquared = dx * dx + dy * dy;
        this.rivulets = this.rivulets.filter((drip) => {
            const t = lengthSquared
                ? Math.max(0, Math.min(1, ((drip.x - from.x) * dx + (drip.y - from.y) * dy) / lengthSquared))
                : 0;
            return Math.hypot(drip.x - from.x - t * dx, drip.y - from.y - t * dy) > radius * 0.85 + drip.radius;
        });
        this.previous = { x, y };
        this.paint(performance.now());
        // A tiny downsample checks for stray flecks without reading a full retina canvas on every move.
        if (this.probeTimer === undefined) {
            this.probeTimer = setTimeout(() => {
                this.probeTimer = undefined;
                if (this.measureInk() < Math.max(80, this.inkAtImpact * 0.025)) this.clear();
            }, 160);
        }
    }
    public leave(): void {
        this.previous = undefined;
    }
    public clear(): void {
        clearTimeout(this.probeTimer);
        this.probeTimer = undefined;
        this.ctx.clearRect(0, 0, this.width, this.height);
        this.display.clearRect(0, 0, this.width, this.height);
        if (this.frame !== undefined) cancelAnimationFrame(this.frame);
        this.frame = undefined;
        this.rivulets = [];
        this.leave();
        if (this.active) {
            this.active = false;
            this.onActiveChange(false);
        }
    }
    private opacity(now: number): number {
        const progress = Math.max(
            0,
            Math.min(1, (now - this.lastImpact - FADE_START_MS) / (LIFETIME_MS - FADE_START_MS)),
        );
        return Math.pow(1 - progress, 1.4);
    }
    private paint(now: number): void {
        this.display.clearRect(0, 0, this.width, this.height);
        this.display.globalAlpha = this.opacity(now);
        this.display.drawImage(this.ink, 0, 0, this.width, this.height);
        this.display.globalAlpha = 1;
    }
    private readonly animate = (now: number): void => {
        this.frame = undefined;
        if (!this.active) return;
        if (now - this.lastImpact >= LIFETIME_MS) {
            this.clear();
            return;
        }
        // Slow viscous runoff needs only 30 fps. No animation loop remains after wiping or natural fading.
        const elapsed = now - this.lastFrame;
        if (elapsed >= 1_000 / 30) {
            this.lastFrame = now;
            const seconds = Math.min(0.1, elapsed / 1_000);
            for (const drip of this.rivulets) this.flow(drip, seconds);
            this.rivulets = this.rivulets.filter((drip) => drip.remaining > 0 && drip.y < this.height + drip.radius);
            this.paint(now);
        }
        this.frame = requestAnimationFrame(this.animate);
    };
    private flow(drip: Rivulet, seconds: number): void {
        const ctx = this.ctx;
        const from = { x: drip.x, y: drip.y };
        drip.remaining -= seconds;
        // Surface tension makes the bead hesitate and snake slightly instead of falling like rain.
        drip.phase += seconds * 1.8;
        const speed = drip.speed * (0.65 + Math.sin(drip.phase) * 0.35);
        drip.y += speed * seconds;
        drip.x = drip.originX + Math.sin(drip.phase * 0.45) * drip.radius * 0.7;
        ctx.save();
        ctx.globalAlpha = drip.opacity;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(drip.x, drip.y);
        ctx.strokeStyle = "rgba(36, 0, 7, 0.72)";
        ctx.lineWidth = drip.radius * 1.55;
        ctx.stroke();
        ctx.strokeStyle = "rgba(111, 9, 21, 0.75)";
        ctx.lineWidth = drip.radius * 0.85;
        ctx.stroke();
        // A heavy rounded bead and a narrow reflected glint sell wet glass at screen scale.
        this.drop(drip.x, drip.y, drip.radius, 1.55);
        ctx.restore();
    }
    private measureInk(): number {
        const ctx = this.probe.getContext("2d", { willReadFrequently: true })!;
        ctx.clearRect(0, 0, 64, 40);
        ctx.drawImage(this.canvas, 0, 0, 64, 40);
        const pixels = ctx.getImageData(0, 0, 64, 40).data;
        let alpha = 0;
        for (let i = 3; i < pixels.length; i += 4) alpha += pixels[i];
        return alpha;
    }
    private between(min: number, max: number): number {
        return min + Math.random() * (max - min);
    }
    private drawSplat(x: number, y: number, radius: number): void {
        const ctx = this.ctx;
        const squash = this.between(0.65, 1);
        // Beads start at the lower edge of the impact and feed narrow trails down the glass.
        for (let i = 0; i < (radius > 100 ? 2 : 1); i++) {
            const dx = x + radius * this.between(-0.35, 0.35);
            this.rivulets.push({
                x: dx,
                originX: dx,
                y: y + radius * squash * 0.48,
                radius: radius * this.between(0.015, 0.027),
                speed: radius * this.between(0.14, 0.28),
                phase: this.between(0, Math.PI * 2),
                remaining: this.between(5, 9),
                opacity: 1,
            });
        }
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(1, squash);

        // Unequal lobes and fine jets give the contact patch a liquid edge, not a circular decal.
        const points: Point[] = [];
        const count = 28;
        const turn = this.between(0, Math.PI * 2);
        for (let i = 0; i < count; i++) {
            const angle = turn + (i / count) * Math.PI * 2;
            const r = radius * this.between(0.38, 0.83);
            points.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
        }
        ctx.fillStyle = "rgba(65, 2, 10, 0.82)";
        for (let i = 0; i < 7; i++) {
            const angle = this.between(0, Math.PI * 2);
            const length = radius * this.between(0.65, 1.45);
            const dx = Math.cos(angle);
            const dy = Math.sin(angle);
            const neck = radius * this.between(0.025, 0.065);
            const tip = neck * 0.28;
            ctx.beginPath();
            ctx.moveTo(-dy * neck + dx * radius * 0.3, dx * neck + dy * radius * 0.3);
            ctx.quadraticCurveTo(
                dx * length * 0.7 - dy * neck,
                dy * length * 0.7 + dx * neck,
                dx * length - dy * tip,
                dy * length + dx * tip,
            );
            ctx.quadraticCurveTo(
                dx * (length + tip * 2),
                dy * (length + tip * 2),
                dx * length + dy * tip,
                dy * length - dx * tip,
            );
            ctx.quadraticCurveTo(dx * length * 0.55 + dy * neck, dy * length * 0.55 - dx * neck, dy * neck, -dx * neck);
            ctx.fill();
        }
        const pool = ctx.createRadialGradient(-radius * 0.2, -radius * 0.25, 0, 0, 0, radius);
        pool.addColorStop(0, "rgba(126, 12, 22, 0.84)");
        pool.addColorStop(0.55, "rgba(74, 2, 10, 0.94)");
        pool.addColorStop(1, "rgba(30, 0, 5, 0.85)");
        ctx.fillStyle = pool;
        ctx.beginPath();
        const last = points[points.length - 1];
        ctx.moveTo((last.x + points[0].x) / 2, (last.y + points[0].y) / 2);
        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            const next = points[(i + 1) % points.length];
            ctx.quadraticCurveTo(p.x, p.y, (p.x + next.x) / 2, (p.y + next.y) / 2);
        }
        ctx.closePath();
        ctx.fill();
        ctx.save();
        ctx.clip();
        // Uneven thickness and small reflected glints keep the larger stain from reading as flat paint.
        for (let i = 0; i < 12; i++) {
            const px = radius * this.between(-0.65, 0.65);
            const py = radius * this.between(-0.65, 0.65);
            const r = radius * this.between(0.12, 0.4);
            const thickness = ctx.createRadialGradient(px, py, 0, px, py, r);
            thickness.addColorStop(0, i % 3 ? "rgba(28, 0, 5, 0.2)" : "rgba(219, 55, 49, 0.16)");
            thickness.addColorStop(1, "transparent");
            ctx.fillStyle = thickness;
            ctx.fillRect(px - r, py - r, r * 2, r * 2);
        }
        ctx.strokeStyle = "rgba(255, 151, 124, 0.19)";
        ctx.lineWidth = Math.max(0.7, radius * 0.009);
        ctx.lineCap = "round";
        for (let i = 0; i < count; i += 5) {
            const p = points[i];
            const next = points[(i + 1) % count];
            ctx.beginPath();
            ctx.moveTo(p.x * 0.83, p.y * 0.83);
            ctx.quadraticCurveTo(p.x * 0.96, p.y * 0.96, (p.x + next.x) * 0.45, (p.y + next.y) * 0.45);
            ctx.stroke();
        }
        ctx.restore();

        // Scattered droplets catch a little light; most of the blood stays deep crimson.
        for (let i = 0; i < 44; i++) {
            const angle = this.between(0, Math.PI * 2);
            const distance = radius * this.between(0.7, 1.9);
            const r = radius * this.between(0.008, 0.045);
            this.drop(Math.cos(angle) * distance, Math.sin(angle) * distance, r, this.between(0.8, 1.8), angle);
        }
        ctx.restore();
    }
    private drop(x: number, y: number, radius: number, stretch: number, rotation = 0): void {
        const ctx = this.ctx;
        const wet = ctx.createRadialGradient(x - radius * 0.3, y - radius * 0.4, 0, x, y, radius * stretch);
        wet.addColorStop(0, "rgba(161, 27, 35, 0.92)");
        wet.addColorStop(0.5, "rgba(87, 3, 16, 0.96)");
        wet.addColorStop(1, "rgba(28, 0, 6, 0.9)");
        ctx.fillStyle = wet;
        ctx.beginPath();
        ctx.ellipse(x, y, radius, radius * stretch, rotation, 0, Math.PI * 2);
        ctx.fill();
        if (radius < 1.5) return;
        ctx.strokeStyle = "rgba(255, 194, 170, 0.46)";
        ctx.lineWidth = Math.max(0.6, radius * 0.2);
        ctx.beginPath();
        ctx.ellipse(x - radius * 0.16, y - radius * 0.16, radius * 0.55, radius * stretch * 0.65, rotation, 3.5, 4.8);
        ctx.stroke();
    }
}
