import { Assets, Container, Graphics, Sprite, Text, TextStyle, Texture } from "pixi.js";
import { HOC_NUMERIC_ARIAL_FONT_FAMILY } from "../fontFamilies";
import { images } from "../generated/image_imports";

const FORGING_BACKGROUND_URL = images.loading_screen_forging_base;
const FORGING_LAVA_URL = images.loading_screen_forging_lava_strip;
const DRAGON_MEDALLION_URL = images.loading_screen_dragon_medallion;

const ART_WIDTH = 1672;
const ART_HEIGHT = 941;
const TRACK_X = 510;
const TRACK_Y = 744;
const TRACK_WIDTH = 652;
const TRACK_HEIGHT = 27;
const MEDALLION_ASSET_SIZE = 100;
const LABEL_Y = 821;

export class LoadingScreen extends Container {
    private readonly viewportBackground = new Graphics();
    private readonly artwork = new Container();
    private readonly backgroundSprite: Sprite;
    private readonly progressGlow = new Graphics();
    private readonly lavaSprite: Sprite;
    private readonly lavaMask = new Graphics();
    private readonly dragonMedallion: Sprite;
    private readonly loadingLabel: Text;
    private progress = 0;
    private constructor(
        screenWidth: number,
        screenHeight: number,
        background: Texture,
        lava: Texture,
        medallion: Texture,
    ) {
        super();

        this.backgroundSprite = new Sprite(background);
        this.backgroundSprite.width = ART_WIDTH;
        this.backgroundSprite.height = ART_HEIGHT;

        // This plate contains the selected realistic molten texture across the complete trough. A mask
        // reveals only the loaded portion, retaining the exact artwork while keeping the percentage real.
        this.lavaSprite = new Sprite(lava);
        this.lavaSprite.position.set(TRACK_X, TRACK_Y);
        this.lavaSprite.width = TRACK_WIDTH;
        this.lavaSprite.height = TRACK_HEIGHT;
        this.lavaSprite.mask = this.lavaMask;

        this.dragonMedallion = new Sprite(medallion);
        this.dragonMedallion.anchor.set(0.5);
        // The transparent asset deliberately has generous padding. At 150px the visible coin is the
        // same ~90px diameter as the marker in the selected loading-screen artwork.
        this.dragonMedallion.width = MEDALLION_ASSET_SIZE;
        this.dragonMedallion.height = MEDALLION_ASSET_SIZE;

        this.loadingLabel = new Text({
            text: "FORGING THE BATTLEFIELD   0%",
            style: new TextStyle({
                fontFamily: HOC_NUMERIC_ARIAL_FONT_FAMILY,
                fontSize: 27,
                fontWeight: "500",
                fill: 0xd77d28,
                letterSpacing: 1.2,
                stroke: { color: 0x321005, width: 1.5 },
            }),
        });
        this.loadingLabel.anchor.set(0.5);
        this.loadingLabel.position.set(ART_WIDTH / 2, LABEL_Y);

        // The ornate track and end caps are baked into the exact selected artwork. Only the molten
        // interior, the moving medallion and the real loading percentage are dynamic layers.
        this.artwork.addChild(
            this.backgroundSprite,
            this.progressGlow,
            this.lavaSprite,
            this.lavaMask,
            this.dragonMedallion,
            this.loadingLabel,
        );
        this.addChild(this.viewportBackground, this.artwork);

        this.resize(screenWidth, screenHeight);
        this.setProgress(0);
    }
    public static async create(screenWidth: number, screenHeight: number): Promise<LoadingScreen> {
        const [background, lava, medallion] = await Promise.all([
            Assets.load<Texture>(FORGING_BACKGROUND_URL),
            Assets.load<Texture>(FORGING_LAVA_URL),
            Assets.load<Texture>(DRAGON_MEDALLION_URL),
        ]);
        return new LoadingScreen(screenWidth, screenHeight, background, lava, medallion);
    }
    public setProgress(value: number): void {
        this.progress = Math.max(0, Math.min(1, value));
        const fillWidth = TRACK_WIDTH * this.progress;

        this.progressGlow.clear();
        this.lavaMask.clear();

        if (fillWidth > 0) {
            this.progressGlow
                .rect(TRACK_X - 2, TRACK_Y - 5, fillWidth + 4, TRACK_HEIGHT + 10)
                .fill({ color: 0xff4d00, alpha: 0.15 });
            this.lavaMask.rect(TRACK_X, TRACK_Y, fillWidth, TRACK_HEIGHT).fill(0xffffff);
        }

        this.dragonMedallion.position.set(TRACK_X + fillWidth, TRACK_Y + TRACK_HEIGHT / 2);
        this.dragonMedallion.rotation = this.progress * Math.PI * 4;
        this.loadingLabel.text = `FORGING THE BATTLEFIELD   ${Math.round(this.progress * 100)}%`;
    }
    public resize(screenWidth: number, screenHeight: number): void {
        this.viewportBackground.clear();
        this.viewportBackground.rect(0, 0, screenWidth, screenHeight).fill(0x050505);

        const coverScale = Math.max(screenWidth / ART_WIDTH, screenHeight / ART_HEIGHT);
        this.artwork.scale.set(coverScale);
        this.artwork.pivot.set(ART_WIDTH / 2, ART_HEIGHT / 2);
        this.artwork.position.set(screenWidth / 2, screenHeight / 2);
    }
}
