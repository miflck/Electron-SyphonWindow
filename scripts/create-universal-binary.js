const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const x64Path = path.resolve(__dirname, "../build/Release/syphon_addon.node");
const arm64Path = path.resolve(__dirname, "../build/Release/syphon_addon.arm64.node");
const universalPath = path.resolve(__dirname, "../build/Release/syphon_addon.universal.node");

function getArchitecture(filePath) {
  try {
    const output = execSync(`file "${filePath}"`).toString();
    if (output.includes("x86_64")) return "x86_64";
    if (output.includes("arm64")) return "arm64";
    return "unknown";
  } catch (error) {
    console.error(`Error checking architecture of ${filePath}:`, error.message);
    return "unknown";
  }
}

const x64Exists = fs.existsSync(x64Path);
const arm64Exists = fs.existsSync(arm64Path);

if (x64Exists && arm64Exists) {
  console.log("Both x64 and arm64 builds found. Creating universal binary...");
  execSync(`lipo -create "${x64Path}" "${arm64Path}" -output "${universalPath}"`);
  fs.renameSync(universalPath, x64Path);
  console.log("Universal binary created successfully");
} else if (x64Exists) {
  console.log("Only x64 build found. Checking architecture...");
  const arch = getArchitecture(x64Path);
  console.log(`Existing build is for ${arch} architecture`);
} else if (arm64Exists) {
  console.log("Only arm64 build found. Renaming to standard name...");
  fs.renameSync(arm64Path, x64Path);
} else {
  console.error("No builds found. Please build the addon first.");
  process.exit(1);
}

console.log("Process completed.");
