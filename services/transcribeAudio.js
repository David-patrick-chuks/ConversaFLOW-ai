import { GoogleGenerativeAI } from "@google/generative-ai";
import { FileState, GoogleAIFileManager } from "@google/generative-ai/server";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY_41;

export class AIAudioFileService {
  constructor() {
    this.fileManager = new GoogleAIFileManager(apiKey);
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async processFile(filePath, displayName, mimeType) {
    try {
      const uploadResult = await this.fileManager.uploadFile(filePath, {
        mimeType,
        displayName,
      });

      let file = await this.fileManager.getFile(uploadResult.file.name);

      while (file.state === FileState.PROCESSING) {
        await new Promise((resolve) => setTimeout(resolve, 10000));
        file = await this.fileManager.getFile(uploadResult.file.name);
      }

      if (file.state === FileState.FAILED) {
        throw new Error("File processing failed.");
      }

      const model = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const result = await model.generateContent([
        "Tell me about this audio clip.",
        {
          fileData: {
            fileUri: uploadResult.file.uri,
            mimeType: uploadResult.file.mimeType,
          },
        },
      ]);

      await this.fileManager.deleteFile(uploadResult.file.name);
      return result.response.text();

    } catch (error) {
      throw new Error(error.message);
    } finally {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  }
}
