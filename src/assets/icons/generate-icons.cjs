// Stand-Alone util file to Generate Exports for all the icons in order to facilitate the Icons Class

// eslint-disable-next-line @typescript-eslint/no-var-requires,@typescript-eslint/no-require-imports
const fs = require("fs");
// eslint-disable-next-line @typescript-eslint/no-var-requires,@typescript-eslint/no-require-imports
const path = require("path");

// Specify which directory you want to generate the exports for here
const directory = "outline";

// eslint-disable-next-line no-undef
const iconsDir = path.join(__dirname, directory);
// eslint-disable-next-line no-undef
const outputFilePath = path.join(__dirname, directory, "index.ts");

function toPascalCase(str) {
  return str
    .split("-") // Split by hyphen
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1)) // Capitalize each word
    .join(""); // Join back without hyphens
}

const files = fs.readdirSync(iconsDir).filter((file) => file.endsWith(".svg"));

const exportStatements = [];

files.forEach((file) => {
  const fileNameWithoutExt = path.basename(file, ".svg"); // Get the file name without extension
  const componentName = toPascalCase(fileNameWithoutExt); // Convert to PascalCase

  exportStatements.push(
    `export { default as ${componentName} } from './${fileNameWithoutExt}.svg';`
  );
});

fs.writeFileSync(outputFilePath, exportStatements.join("\n"), "utf-8");

console.log(`index.ts has been created with ${files.length} exports.`);
