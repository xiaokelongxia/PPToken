import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const releaseDir = process.env.RELEASE_DIR ?? "release-assets";
const version = stripVersionPrefix(process.env.RELEASE_VERSION ?? process.env.GITHUB_REF_NAME);

if (!version) {
  throw new Error("RELEASE_VERSION or GITHUB_REF_NAME is required");
}

mkdirSync(releaseDir, { recursive: true });

const repo = process.env.GITHUB_REPOSITORY ?? "xiaokelongxia/PPToken";
const tag = process.env.GITHUB_REF_NAME ?? `v${version}`;
const releaseBaseUrl = `https://github.com/${repo}/releases/download/${tag}`;
const notes = [
  "启用 PPToken 在线更新通道。",
  "后续版本可在应用内检查更新并在线安装。",
].join("\n");

const platforms = {};

if (process.platform === "darwin") {
  addDarwinPlatforms(platforms, releaseDir, releaseBaseUrl);
} else if (process.platform === "win32") {
  addWindowsPlatform(platforms, releaseDir, releaseBaseUrl);
} else {
  throw new Error(`unsupported updater artifact platform: ${process.platform}`);
}

const manifest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms,
};

writeFileSync(join(releaseDir, manifestName()), `${JSON.stringify(manifest, null, 2)}\n`);

function addDarwinPlatforms(platforms, releaseDir, releaseBaseUrl) {
  const source = firstExisting([
    "src-tauri/target/universal-apple-darwin/release/bundle/macos/PPToken.app.tar.gz",
    "src-tauri/target/release/bundle/macos/PPToken.app.tar.gz",
  ]);
  const assetName = `PPToken_${version}_universal.app.tar.gz`;
  const asset = copyAsset(source, releaseDir, assetName);
  const signature = readSignature(`${source}.sig`);

  platforms["darwin-x86_64-app"] = {
    signature,
    url: `${releaseBaseUrl}/${asset}`,
  };
  platforms["darwin-aarch64-app"] = {
    signature,
    url: `${releaseBaseUrl}/${asset}`,
  };
}

function addWindowsPlatform(platforms, releaseDir, releaseBaseUrl) {
  const source = firstFile("src-tauri/target/release/bundle/nsis", [".exe"], [".sig"]);
  const assetName = `PPToken_${version}_x64-setup.exe`;
  const asset = copyAsset(source, releaseDir, assetName);
  platforms["windows-x86_64-nsis"] = {
    signature: readSignature(`${source}.sig`),
    url: `${releaseBaseUrl}/${asset}`,
  };
}

function firstExisting(paths) {
  const found = paths.find((path) => existsSync(path));
  if (!found) {
    throw new Error(`none of these files exist: ${paths.join(", ")}`);
  }
  return found;
}

function firstFile(dir, extensions, excludedExtensions = []) {
  const files = readdirSync(dir)
    .filter((file) => extensions.some((extension) => file.endsWith(extension)))
    .filter((file) => excludedExtensions.every((extension) => !file.endsWith(extension)))
    .sort();
  if (files.length === 0) {
    throw new Error(`no ${extensions.join("/")} files found in ${dir}`);
  }
  return join(dir, files[0]);
}

function copyAsset(source, releaseDir, assetName) {
  copyFileSync(source, join(releaseDir, assetName));
  return basename(assetName);
}

function readSignature(path) {
  if (!existsSync(path)) {
    throw new Error(`missing updater signature: ${path}`);
  }
  return readFileSync(path, "utf8").trim();
}

function stripVersionPrefix(value) {
  if (!value) return null;
  return value.replace(/^v/, "");
}

function manifestName() {
  if (process.platform === "darwin") return "latest-macos.json";
  if (process.platform === "win32") return "latest-windows.json";
  return "latest.json";
}
