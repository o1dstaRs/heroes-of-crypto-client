import { Container, Graphics, Text, TextStyle } from "pixi.js";

export class LoadingScreen extends Container {
    private bg: Graphics;
    private progressBarBg: Graphics;
    private progressBarFill: Graphics;
    private loadingLabel: Text;
    private logoText: Text;
    // Use explicit init width/height, don't override Container's width/height getters/setters via constructor params
    public constructor(screenWidth: number, screenHeight: number) {
        super();
        // 1. Black Background
        this.bg = new Graphics();
        this.bg.rect(0, 0, screenWidth, screenHeight).fill(0x000000);
        this.addChild(this.bg);
        // 2. Logo / Title
        this.logoText = new Text({
            text: "HEROES OF CRYPTO",
            style: new TextStyle({
                fontFamily: "Arial",
                fontSize: 48,
                fontWeight: "bold",
                fill: 0xffaa00, // Orange
                letterSpacing: 4,
            }),
        });
        this.logoText.anchor.set(0.5);
        this.logoText.x = screenWidth / 2;
        // Center Group: Logo slightly above center
        this.logoText.y = screenHeight / 2 - 30;
        this.addChild(this.logoText);
        // 3. Progress Bar Component
        const barWidth = 400;
        const barHeight = 6;
        const barX = screenWidth / 2 - barWidth / 2;
        // Center Group: Bar slightly below center
        const barY = screenHeight / 2 + 40;
        // Trace
        this.progressBarBg = new Graphics();
        this.progressBarBg.rect(barX, barY, barWidth, barHeight).fill({ color: 0x333333 });
        this.addChild(this.progressBarBg);
        // Fill
        this.progressBarFill = new Graphics();
        this.progressBarFill.rect(barX, barY, 0, barHeight).fill({ color: 0xffaa00 });
        this.addChild(this.progressBarFill);
        // 4. Loading Text
        this.loadingLabel = new Text({
            text: "Loading assets...",
            style: new TextStyle({
                fontFamily: "Arial",
                fontSize: 16,
                fill: 0x888888,
            }),
        });
        this.loadingLabel.anchor.set(0.5);
        this.loadingLabel.x = screenWidth / 2;
        this.loadingLabel.y = barY + 30;
        this.addChild(this.loadingLabel);
    }
    public setProgress(p: number): void {
        const barWidth = 400;
        const width = 400 * Math.max(0, Math.min(1, p));
        const barHeight = 6;
        // Re-calculate based on current screen size if stored, or just rely on fixed relative offsets?
        // Ideally we store screen dimensions or re-calc center.
        // For simplicity, let's just update the rect using the LAST known positions or center 0,0 relative?
        // Actually since we redraw cleanly, we can just use local coords if graphics were centered.
        // But here we drew absolute coords.
        // Let's assume resize() updates stored values, or we access this.bg.width?
        // Safer: use the graphics object we already placed?
        // No, we clear it. Let's rely on resize() being called or initial values being roughly correct.
        // Better: store screenW/H in private props if needed, but not naming them width/height.
        const screenWidth = this.bg.width;
        const screenHeight = this.bg.height;
        const barX = screenWidth / 2 - barWidth / 2;
        // Match constructor Y
        const barY = screenHeight / 2 + 40;
        this.progressBarFill.clear();
        this.progressBarFill.rect(barX, barY, width, barHeight).fill({ color: 0xffaa00 });
        this.loadingLabel.text = `Loading assets... ${Math.floor(p * 100)}%`;
    }
    public resize(w: number, h: number): void {
        this.bg.clear();
        this.bg.rect(0, 0, w, h).fill(0x000000);

        this.logoText.x = w / 2;
        this.logoText.y = h / 2 - 30;

        const barWidth = 400;
        const barHeight = 6;
        const barX = w / 2 - barWidth / 2;
        const barY = h / 2 + 40;

        this.progressBarBg.clear();
        this.progressBarBg.rect(barX, barY, barWidth, barHeight).fill({ color: 0x333333 });

        // Redraw fill? The next setProgress will fix it, or we should strictly redraw here.
        // Let's just update positions of what's there.
        // Since we clear fill in setProgress, we might leave it or empty it.
        // Optimization: trigger a progress update
        this.loadingLabel.x = w / 2;
        this.loadingLabel.y = barY + 30;
    }
}
