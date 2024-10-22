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
const generatedDir = path.resolve(__dirname, "../src/generated");
const outputFile = path.join(generatedDir, "image_imports.ts");

const SEGMENT_NAME_TO_IMPORT_NAME = {
    0: "zero",
    1: "one",
    2: "two",
    3: "three",
    4: "four",
    5: "five",
    6: "six",
    7: "seven",
    8: "eight",
    9: "nine",
};

if (!fs.existsSync(generatedDir)) {
    fs.mkdirSync(generatedDir, { recursive: true });
}

fs.readdir(imageDir, (err, files) => {
    if (err) {
        console.error("Could not list the directory.", err);
        process.exit(1);
    }

    let imports = "";
    let exportEntries = [];

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (
            file.endsWith(".webp") &&
            !file.startsWith("synergy_") &&
            !file.startsWith("overlay_") &&
            !file.startsWith("icon_")
        ) {
            const fileNameSegments = file.split("_");
            if (fileNameSegments.length) {
                const firstSegment = fileNameSegments[0];
                const importNameBase = `${SEGMENT_NAME_TO_IMPORT_NAME[firstSegment] || firstSegment}_${fileNameSegments
                    .slice(1, fileNameSegments.length)
                    .join("_")}`;
                let cutBy = 5;
                if (importNameBase.endsWith("_")) {
                    cutBy = 6;
                }
                const importName = importNameBase.substring(0, importNameBase.length - cutBy);
                imports += `import ${importName} from "../../images/${file}";\n`;
                exportEntries.push(`"${importName}": ${importName}`);
            }
        }
    }

    const exportStatement = `export const images = {${exportEntries.join(", ")}};\n`;

    const content = `${imports}\n${exportStatement}`;

    fs.writeFile(outputFile, content, (err) => {
        if (err) {
            console.error("Error writing the file", err);
        } else {
            console.log("Image imports generated successfully.");
        }
    });
});
