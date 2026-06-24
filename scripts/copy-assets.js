import { mkdirSync, copyFileSync } from "node:fs";
mkdirSync("dist/data", { recursive: true });
copyFileSync("src/data/ecb-rates.json", "dist/data/ecb-rates.json");
