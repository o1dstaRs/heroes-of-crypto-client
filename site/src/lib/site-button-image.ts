import { getImage } from "astro:assets";
import plate from "../../public/assets/images/ui/ui_start_button_plate_trimmed.webp";

let image: Promise<string> | undefined;

export function siteButtonImage() {
    return (image ??= getImage({ src: plate, width: 960, format: "webp", quality: 96 }).then((image) => image.src));
}
