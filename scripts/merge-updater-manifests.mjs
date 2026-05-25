import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const releaseDir = process.env.RELEASE_DIR ?? "release-assets";
const version = stripVersionPrefix(process.env.RELEASE_VERSION ?? process.env.GITHUB_REF_NAME);

if (!version) {
  throw new Error("RELEASE_VERSION or GITHUB_REF_NAME is required");
}

mkdirSync(releaseDir, { recursive: true });

const manifests = ["latest-macos.json", "latest-windows.json"].map((name) =>
  JSON.parse(readFileSync(join(releaseDir, name), "utf8")),
);
const platforms = Object.assign({}, ...manifests.map((manifest) => manifest.platforms));
const dates = manifests
  .map((manifest) => manifest.pub_date)
  .filter(Boolean)
  .sort();
const notes = [
  "启用 PPToken 在线更新通道。",
  "后续版本可在应用内检查更新并在线安装。",
].join("\n");

writeFileSync(
  join(releaseDir, "latest.json"),
  `${JSON.stringify(
    {
      version,
      notes,
      pub_date: dates[dates.length - 1] ?? new Date().toISOString(),
      platforms,
    },
    null,
    2,
  )}\n`,
);

function stripVersionPrefix(value) {
  if (!value) return null;
  return value.replace(/^v/, "");
}
