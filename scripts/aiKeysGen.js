import fs from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);

export function getApiKeys() {
  const apiKeys = [];
  const __dirname = dirname(__filename);
  const envFilePath = join(__dirname, "../.env");
  const envContent = fs.readFileSync(envFilePath, "utf-8");
  // console.log(envContent);
  const lines = envContent.trim().split(/\s+/);
  // console.log(lines);
  lines.forEach((line) => {
    const match = line.match(/^GEMINI_API_KEY_\d+=(.*)$/);
    if (match) {
      apiKeys.push(match[1].trim());
    }
  });

  return apiKeys;
}
