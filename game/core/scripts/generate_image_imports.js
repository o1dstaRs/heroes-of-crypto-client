/*
 * -----------------------------------------------------------------------------
 * This file is part of the browser implementation of the Heroes of Crypto game client.
 *
 * Heroes of Crypto and Heroes of Crypto AI are registered trademarks.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 * -----------------------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");

const imageDir = path.resolve(__dirname, "../images");
const outputFile = path.resolve(__dirname, "../src/generated/image_imports.ts");

fs.readdir(imageDir, (err, files) => {
    if (err) {
        console.error("Could not list the directory.", err);
        process.exit(1);
    }

    const imports = files
        .filter((file) => file.endsWith(".webp"))
        .map((file, index) => `import img${index} from '../../images/${file}';`)
        .join("\n");

    const exportStatement = `export const images = {${files
        .filter((file) => file.endsWith(".webp"))
        .map((file, index) => `'${file.substring(0, file.length - 5)}': img${index}`)
        .join(",")}};`;

    const content = `${imports}\n\n${exportStatement}`;

    fs.writeFile(outputFile, content, (err) => {
        if (err) {
            console.error("Error writing the file", err);
        } else {
            console.log("Image imports generated successfully.");
        }
    });
});
