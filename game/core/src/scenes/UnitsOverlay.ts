// game/core/src/overlays/UnitsOverlay.ts
import { Application, Container, Sprite, Texture, Text, TextStyle, Graphics, Ticker, Rectangle } from "pixi.js";
import { FactionType } from "@heroesofcrypto/common";
import { unitToTextureName } from "../pixi/PixiUnitsFactory";
import { TextureType } from "../pixi/PixiUnitsFactory";
import { UnitChip } from "./UnitChip";

type GetTexture = (key: string) => Texture | undefined;

export class UnitsOverlay {
    private app: Application;
    private getTex: GetTexture;

    /** Root overlay container (we position this inside the square board) */
    public readonly container = new Container();

    /** Holds backdrop + headers + rows (we animate this in/out) */
    private content = new Container();

    /** Semi-transparent black backdrop */
    private backdrop = new Graphics();

    private headerContainer = new Container();
    private rowsContainer = new Container();

    /** Toggle button that stays visible to reopen/close the content */
    private toggleBtn = new Container();
    private toggleBtnBg = new Graphics();
    private toggleArrow = new Graphics();

    /** Layout state used by animation */
    private overlayW = 0;
    private overlayH = 0;
    private leftColW = 0;
    private rowH = 0;
    private isOpen = true;

    /** Simple tween bookkeeping */
    private tweenCancel?: () => void;

    /** UnitChip registry for selection updates */
    private allChips: UnitChip[] = [];
    private selectedName: string | null = null;

    private readonly factions: { type: FactionType; iconName: string }[] = [
        { type: FactionType.LIFE, iconName: "life_128" },
        { type: FactionType.NATURE, iconName: "nature_128" },
        { type: FactionType.CHAOS, iconName: "chaos_128" },
        { type: FactionType.MIGHT, iconName: "might_128" },
    ];

    private headerTextStyle = new TextStyle({
        fontFamily: "Montserrat, Arial, sans-serif",
        fontSize: 24,
        fill: 0xf6d87c,
        align: "center",
        stroke: { color: 0x000000, width: 4 },
        dropShadow: { color: 0x000000, distance: 2, angle: Math.PI / 4, blur: 1, alpha: 1 },
    });

    private btnW = 0;
    private btnH = 0;

    private readonly creaturesByFaction = {
        [FactionType.LIFE]: [
            "Squire",
            "Peasant",
            "Arbalester",
            "Pikeman",
            "Valkyrie",
            "Healer",
            "Crusader",
            "Griffin",
            "Angel",
            "Tsar Cannon",
        ],
        [FactionType.NATURE]: [
            "Fairy",
            "Wolf",
            "Leprechaun",
            "White Tiger",
            "Elf",
            "Satyr",
            "Unicorn",
            "Mantis",
            "Pegasus",
            "Gargantuan",
        ],
        [FactionType.CHAOS]: [
            "Scavenger",
            "Orc",
            "Troglodyte",
            "Medusa",
            "Troll",
            "Beholder",
            "Efreet",
            "Goblin Knight",
            "Black Dragon",
            "Hydra",
        ],
        [FactionType.MIGHT]: [
            "Berserker",
            "Centaur",
            "Wolf Rider",
            "Nomad",
            "Harpy",
            "Hyena",
            "Ogre Mage",
            "Cyclops",
            "Thunderbird",
            "Behemoth",
        ],
    } as const satisfies Partial<Record<FactionType, readonly string[]>>;

    private readonly levelBuckets = [
        { label: "Level 1", count: 3, unitSize: 1 }, // 128
        { label: "Level 2", count: 3, unitSize: 1 }, // 128
        { label: "Level 3", count: 2, unitSize: 1 }, // 128
        { label: "Level 4", count: 2, unitSize: 2 }, // 256
    ];

    public constructor(app: Application, getTexture: GetTexture) {
        this.app = app;
        this.getTex = getTexture;

        // render above bg and let zIndex work
        this.app.stage.sortableChildren = true;
        this.container.zIndex = 10;

        // content & toggle
        this.content.addChild(this.backdrop, this.headerContainer, this.rowsContainer);
        this.container.addChild(this.content);
        this.container.addChild(this.toggleBtn);

        this.container.sortableChildren = true;
        this.app.stage.sortableChildren = true;
        this.app.stage.eventMode = "static";

        this.backdrop.eventMode = "none";

        // toggle visuals + events
        this.toggleBtn.addChild(this.toggleBtnBg, this.toggleArrow);
        this.toggleBtn.zIndex = 9999;
        this.toggleBtn.eventMode = "static";
        this.toggleBtn.cursor = "pointer";
        this.toggleBtn.on("pointertap", () => this.toggle());

        this.app.stage.addChild(this.container);
    }

    /** Call once after textures are ready */
    public build(): void {
        this.headerContainer.removeChildren();
        this.rowsContainer.removeChildren();
        this.allChips = [];
        this.selectedName = null;

        // headers
        for (let i = 0; i < this.levelBuckets.length; i++) {
            const t = new Text({ text: this.levelBuckets[i].label, style: this.headerTextStyle });
            t.anchor.set(0.5);
            this.headerContainer.addChild(t);
        }

        // rows per faction
        for (let r = 0; r < this.factions.length; r++) {
            const row = new Container();
            row.label = `row-${r}`;
            this.rowsContainer.addChild(row);

            // faction icon
            const iconTex = this.getTex(this.factions[r].iconName);
            const icon = new Sprite(iconTex ?? Texture.EMPTY);
            row.addChild(icon);

            // creatures → bucketize [3,3,2,2]
            const map = this.creaturesByFaction as Partial<Record<FactionType, readonly string[]>>;
            const names = map[this.factions[r].type] ?? [];
            const buckets = this.bucketize(
                [...names],
                this.levelBuckets.map((b) => b.count),
            );

            for (let b = 0; b < buckets.length; b++) {
                const bucket = buckets[b];
                const bucketCont = new Container();
                bucketCont.label = `bucket-${b}`;
                row.addChild(bucketCont);

                const sizeFlag = this.levelBuckets[b].unitSize; // 1=>128, 2=>256
                for (let i = 0; i < bucket.length; i++) {
                    const unitName = bucket[i];
                    const texName = unitToTextureName(unitName, TextureType.SMALL, sizeFlag);
                    const tex = this.getTex(texName);
                    const chip = new UnitChip({
                        unitName,
                        texture: tex ?? Texture.EMPTY,
                        // show "9" when active (hover/selected)
                        getAmount: () => 9,
                    });
                    chip.setTicker(this.app.ticker); // Add this line to enable smooth tweening
                    // selection behavior (single-select)
                    chip.on("pointertap", () => {
                        const next = this.selectedName === unitName ? null : unitName;
                        this.selectedName = next;
                        // update all chips selected state
                        for (const c of this.allChips) c.setSelected(c["nameKey"] === next);
                    });
                    bucketCont.addChild(chip);
                    this.allChips.push(chip);
                }
            }
        }

        // initial layout & button icon
        this.onResize(this.app.renderer.width, this.app.renderer.height);
        this.refreshButtonIcon();
    }

    /** Layout/resize: perfect centered square; overlay is middle 16×4 band */
    public onResize(stageW: number, stageH: number): void {
        if (stageW <= 0 || stageH <= 0) return;

        const boardSide = Math.min(stageW, stageH);
        const cell = boardSide / 16;

        this.overlayW = 16 * cell;
        this.overlayH = 4 * cell;

        const boardX = (stageW - boardSide) / 2;
        const boardY = (stageH - boardSide) / 2;
        const overlayX = boardX;
        const overlayY = boardY + (boardSide - this.overlayH) / 2;

        this.container.position.set(overlayX, overlayY);

        // backdrop
        this.backdrop.clear();
        this.backdrop.rect(0, 0, this.overlayW, this.overlayH).fill({ color: 0x000000, alpha: 0.8 });

        this.leftColW = 1.5 * cell;
        const levelCols = this.levelBuckets.length;
        const levelAreaW = this.overlayW - this.leftColW;
        const colW = levelAreaW / levelCols;

        const rows = this.factions.length;
        this.rowH = this.overlayH / rows;

        // headers
        for (let i = 0; i < this.headerContainer.children.length; i++) {
            const t = this.headerContainer.children[i] as Text;
            const cx = this.leftColW + (i + 0.5) * colW;
            const cy = -0.45 * this.rowH;
            t.position.set(cx, cy);
            const maxW = colW * 0.7;
            const scale = t.width > 0 ? Math.min(1, maxW / t.width) : 1;
            t.scale.set(scale);
        }

        // rows + buckets
        for (let r = 0; r < rows; r++) {
            const rowCont = this.rowsContainer.children[r] as Container;
            rowCont.position.set(0, r * this.rowH);

            // faction icon
            const icon = rowCont.children[0] as Sprite;
            icon.width = icon.height = cell;
            icon.position.set(this.leftColW * 0.5 - cell * 0.5, this.rowH * 0.5 - cell * 0.5);

            let childIndex = 1;
            for (let b = 0; b < levelCols; b++) {
                const bucketCont = rowCont.children[childIndex++] as Container;
                const bx = this.leftColW + b * colW;
                bucketCont.position.set(bx, 0);

                // lay out UnitChips inside the bucket
                const chips = bucketCont.children as UnitChip[];
                const n = chips.length;

                const iconSide = cell * (this.levelBuckets[b].unitSize === 2 ? 1.05 : 0.9);
                const spacing = Math.min(iconSide * 1.1, (colW * 0.85) / Math.max(1, n));
                const startX = colW * 0.5 - ((n - 1) * spacing) / 2;

                for (let i = 0; i < n; i++) {
                    const chip = chips[i];
                    chip.layout(iconSide); // size sprite, ring, badge
                    chip.position.set(startX + i * spacing, this.rowH * 0.5);
                }
            }
        }

        // toggle button under the left column
        const btnW = this.leftColW * 0.9;
        const btnH = cell * 0.9;
        const btnX = (this.leftColW - btnW) / 2;
        const btnY = this.overlayH + cell * 0.2;

        this.toggleBtn.position.set(btnX, btnY);
        this.drawButton(btnW, btnH);

        // cache for hit-test
        this.btnW = btnW;
        this.btnH = btnH;

        // hit area
        this.toggleBtn.hitArea = new Rectangle(0, 0, btnW, btnH);

        // keep state after resize (content slides right to hide)
        this.content.x = this.isOpen ? 0 : this.overlayW;
        this.content.alpha = this.isOpen ? 1 : 0;
        this.toggleBtn.zIndex = 9999;
    }

    /** Show/hide overlay content with slide+fade animation */
    public toggle(): void {
        this.animateTo(!this.isOpen, 350);
    }

    /** External hit-test helper for canvas-forwarded events */
    public hitToggle(globalX: number, globalY: number): boolean {
        const local = this.toggleBtn.toLocal({ x: globalX, y: globalY });
        return local.x >= 0 && local.y >= 0 && local.x <= this.btnW && local.y <= this.btnH;
    }

    private animateTo(open: boolean, durationMs: number): void {
        if (this.tweenCancel) {
            this.tweenCancel();
            this.tweenCancel = undefined;
        }

        const startX = this.content.x;
        const startA = this.content.alpha;

        // Close → slide LEFT off the board; Open → slide back RIGHT to 0
        const endX = open ? 0 : -this.overlayW;
        const endA = open ? 1 : 0;

        const start = performance.now();
        const ticker = this.app.ticker as Ticker;

        const easeInOutQuad = (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);

        const step = () => {
            const now = performance.now();
            const p = Math.min(1, (now - start) / durationMs);
            const e = easeInOutQuad(p);

            this.content.x = startX + (endX - startX) * e;
            this.content.alpha = startA + (endA - startA) * e;

            if (p >= 1) {
                ticker.remove(step);
                this.tweenCancel = undefined;
                this.isOpen = open;
                this.refreshButtonIcon();
            }
        };

        ticker.add(step);
        this.tweenCancel = () => ticker.remove(step);
    }

    /** Draw/refresh the toggle button visuals (rounded rect + arrow) */
    private drawButton(w: number, h: number): void {
        this.toggleBtnBg.clear();
        this.toggleBtnBg
            .roundRect(0, 0, w, h, Math.min(12, h * 0.25))
            .fill({ color: 0x000000, alpha: 0.7 })
            .stroke({ color: 0xffffff, width: 2, alpha: 0.7 });

        const pad = Math.min(w, h) * 0.25;
        const aw = w - pad * 2;
        const ah = h - pad * 2;

        this.toggleArrow.clear();
        this.toggleArrow.position.set(pad, pad);

        if (this.isOpen) {
            // pointing left while open (click → hides to the RIGHT)
            this.toggleArrow
                .moveTo(aw, 0)
                .lineTo(0, ah * 0.5)
                .lineTo(aw, ah)
                .closePath()
                .fill({ color: 0xf6d87c })
                .stroke({ color: 0x000000, width: 2, alpha: 0.9 });
        } else {
            // pointing right when closed (click → shows from the RIGHT to LEFT)
            this.toggleArrow
                .moveTo(0, 0)
                .lineTo(aw, ah * 0.5)
                .lineTo(0, ah)
                .closePath()
                .fill({ color: 0xf6d87c })
                .stroke({ color: 0x000000, width: 2, alpha: 0.9 });
        }
    }

    private refreshButtonIcon(): void {
        const b = this.toggleBtnBg.getBounds();
        this.drawButton(b.width, b.height);
    }

    public setVisible(v: boolean): void {
        this.container.visible = v;
    }

    public destroy(): void {
        if (this.tweenCancel) this.tweenCancel();
        this.container.destroy({ children: true });
        this.allChips.length = 0;
    }

    private bucketize(names: string[], counts: number[]): string[][] {
        const out: string[][] = [];
        let idx = 0;
        for (const c of counts) {
            out.push(names.slice(idx, idx + c));
            idx += c;
        }
        return out;
    }
}
