import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const distDir = path.resolve(rootDir, "dist");
const zipName = "echoes-of-the-bloodline-itch.zip";
const zipPath = path.resolve(rootDir, zipName);

if (!fs.existsSync(distDir)) {
  console.error("Dossier dist introuvable. Lancez 'npm run build' d'abord.");
  process.exit(1);
}

// Remove old zip if present
if (fs.existsSync(zipPath)) {
  fs.unlinkSync(zipPath);
}

let created = false;

// Try system zip
try {
  execSync(`cd "${distDir}" && zip -r "${zipPath}" ./*`, { stdio: "inherit" });
  created = true;
} catch {
  // Try python3 zipfile
  try {
    execSync(`cd "${distDir}" && python3 -m zipfile -c "${zipPath}" *`, { stdio: "inherit" });
    created = true;
  } catch (err) {
    console.warn("Impossible de créer automatiquement le .zip via zip/python3:", err.message);
  }
}

if (created && fs.existsSync(zipPath)) {
  const sizeMb = (fs.statSync(zipPath).size / (1024 * 1024)).toFixed(2);
  console.log(`\n========================================`);
  console.log(`✅ Archive itch.io prête : ${zipName} (${sizeMb} Mo)`);
  console.log(`Pour publier sur itch.io :`);
  console.log(`1. Créez un projet sur itch.io (Kind of project: HTML)`);
  console.log(`2. Cochez "This file will be played in the browser"`);
  console.log(`3. Uploadez ${zipName}`);
  console.log(`========================================\n`);
} else {
  console.log(`\nLe dossier 'dist' est prêt pour itch.io ! Compressez son contenu en .zip pour l'uploader.`);
}
