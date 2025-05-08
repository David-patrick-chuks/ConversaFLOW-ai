import { GoogleGenAI, createUserContent, createPartFromUri } from "@google/genai";
import fs from "fs";
import path from "path";
import mime from "mime-types";

export class VideoProcessor {
  constructor() {
    this.apiKeys = [
      process.env.GEMINI_API_KEY_1,
      process.env.GEMINI_API_KEY_2,
      process.env.GEMINI_API_KEY_3
      // Add more keys as needed
    ];
    this.currentApiKeyIndex = 0;
    this.ai = new GoogleGenAI({ apiKey: this.apiKeys[this.currentApiKeyIndex] });
  }

  switchApiKey() {
    this.currentApiKeyIndex = (this.currentApiKeyIndex + 1) % this.apiKeys.length;
    this.ai = new GoogleGenAI({ apiKey: this.apiKeys[this.currentApiKeyIndex] });
  }

  async processVideoFileRecursive(fileName, retryCount = 0, maxRetries = 3) {
    try {
      const filePath = path.resolve("uploads", fileName);
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const mimeType = mime.lookup(fileName);
      if (!mimeType || !mimeType.startsWith('video/')) {
        throw new Error('Unsupported file format.');
      }

      const myFile = await this.ai.files.upload({
        file: filePath,
        config: { mimeType },
      });

      const result = await this.ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: createUserContent([
          createPartFromUri(myFile.uri, myFile.mimeType),
          "Summarize this video."
        ]),
      });

      return result.text;

    } catch (error) {
      if (retryCount < maxRetries) {
        if (error.message.includes("429")) {
          this.switchApiKey();
          await new Promise(resolve => setTimeout(resolve, 5000));
          return this.processVideoFileRecursive(fileName, retryCount + 1);
        }
        if (error.message.includes("503")) {
          await new Promise(resolve => setTimeout(resolve, 5000));
          return this.processVideoFileRecursive(fileName, retryCount + 1);
        }
      }
      throw error;
    }
  }

  async processVideoFile(fileName) {
    return await this.processVideoFileRecursive(fileName);
  }
}
