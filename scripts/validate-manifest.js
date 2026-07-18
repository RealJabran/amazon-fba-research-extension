const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "manifest.json"), "utf8"),
);
if (manifest.manifest_version !== 3) throw new Error("Manifest V3 is required");
const referenced = [
  manifest.background.service_worker,
  manifest.action.default_popup,
  manifest.options_page,
  ...Object.values(manifest.icons || {}),
  ...Object.values(manifest.action.default_icon || {}),
  ...manifest.content_scripts.flatMap((entry) => entry.js || []),
];
for (const file of referenced)
  if (!fs.existsSync(path.join(root, file)))
    throw new Error(`Missing manifest file: ${file}`);
console.log(`Manifest OK: ${manifest.name} ${manifest.version}`);
