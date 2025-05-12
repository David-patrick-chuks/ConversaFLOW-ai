import { GoogleGenerativeAI } from "@google/generative-ai";
import { FileState, GoogleAIFileManager } from "@google/generative-ai/server";
import fs from "fs/promises"; // Use promises for async file operations
import dotenv from "dotenv";

/**
 * Initializes environment variables.
 */
dotenv.config();

const API_KEYS = [
  process.env.GEMINI_API_KEY_41,
  process.env.GEMINI_API_KEY_42,
  process.env.GEMINI_API_KEY_43,
].filter(Boolean); // Remove undefined/null keys

if (API_KEYS.length === 0) {
  throw new Error("No valid GEMINI_API_KEY provided for audio processing.");
}

let currentApiKeyIndex = 0;

/**
 * Rotates to the next available API key for rate limit handling.
 * @returns {string} The next API key.
 */
const getNextApiKey = () => {
  currentApiKeyIndex = (currentApiKeyIndex + 1) % API_KEYS.length;
  return API_KEYS[currentApiKeyIndex];
};

/**
 * Service for processing audio files using Google Generative AI.
 */
export class AIAudioFileService {
  constructor() {
    this.apiKey = API_KEYS[currentApiKeyIndex];
    this.fileManager = new GoogleAIFileManager(this.apiKey);
    this.genAI = new GoogleGenerativeAI(this.apiKey);
  }

  /**
   * Validates input parameters for audio processing.
   * @param {string} filePath - Path to the audio file.
   * @param {string} displayName - Display name for the file.
   * @param {string} mimeType - MIME type of the audio file.
   * @throws {Error} If validation fails.
   */
  validateInputs(filePath, displayName, mimeType) {
    if (!filePath || typeof filePath !== "string") {
      throw new Error("filePath must be a non-empty string");
    }
    if (!displayName || typeof displayName !== "string") {
      throw new Error("displayName must be a non-empty string");
    }
    if (!mimeType || !mimeType.startsWith("audio/")) {
      throw new Error("mimeType must be a valid audio MIME type (e.g., audio/mp3)");
    }
  }

  /**
   * Processes an audio file and generates a transcript or description.
   * @param {string} filePath - Path to the audio file.
   * @param {string} displayName - Display name for the file.
   * @param {string} mimeType - MIME type of the audio file.
   * @returns {Promise<string>} The generated content from the audio.
   * @throws {Object} Error object with message and source.
   */
  async processFile(filePath, displayName, mimeType) {
    const maxRetries = API_KEYS.length * 2;
    let retries = 0;
    let uploadedFile = null;

    try {
      // Validate inputs
      this.validateInputs(filePath, displayName, mimeType);

      // Check if file exists
      try {
        await fs.access(filePath);
      } catch {
        throw new Error(`Audio file not found at path: ${filePath}`);
      }

      // Upload file
      try {
        const uploadResult = await this.fileManager.uploadFile(filePath, {
          mimeType,
          displayName,
        });
        uploadedFile = uploadResult.file;
      } catch (error) {
        throw new Error(`Failed to upload audio file: ${error.message}`);
      }

      // Wait for file processing
      let file = await this.fileManager.getFile(uploadedFile.name);
      while (file.state === FileState.PROCESSING) {
        await new Promise((resolve) => setTimeout(resolve, 10000));
        file = await this.fileManager.getFile(uploadedFile.name);
      }

      if (file.state === FileState.FAILED) {
        throw new Error("Audio file processing failed on server.");
      }

      // Generate content with retries for rate limits
      while (retries < maxRetries) {
        try {
          const model = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
          const result = await model.generateContent([
            "Transcribe or describe the content of this audio clip in detail.",
            {
              fileData: {
                fileUri: uploadedFile.uri,
                mimeType: uploadedFile.mimeType,
              },
            },
          ]);

          const content = result.response.text();
          if (!content || content.trim() === "") {
            throw new Error("Generated content is empty or invalid.");
          }

          console.log(`Successfully processed audio file: ${displayName}`);
          return content;
        } catch (error) {
          if (error.message.includes("429")) {
            console.log(
              `Rate limit exceeded for API key ${currentApiKeyIndex + 1}. Switching key and retrying...`
            );
            this.apiKey = getNextApiKey();
            this.fileManager = new GoogleAIFileManager(this.apiKey);
            this.genAI = new GoogleGenerativeAI(this.apiKey);
            retries++;
            // Exponential backoff
            await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, retries)));
            continue;
          } else {
            throw new Error(`Failed to generate content from audio: ${error.message}`);
          }
        }
      }

      throw new Error(`Failed to process audio after ${maxRetries} retries due to rate limiting.`);
    } catch (error) {
      console.error(`Error processing audio file ${displayName}: ${error.message}`);
      return { error: error.message, source: "audio" };
    } finally {
      // Clean up uploaded file and local file
      if (uploadedFile) {
        try {
          await this.fileManager.deleteFile(uploadedFile.name);
          console.log(`Deleted uploaded file: ${uploadedFile.name}`);
        } catch (error) {
          console.error(`Failed to delete uploaded file: ${error.message}`);
        }
      }
      try {
        await fs.unlink(filePath);
        console.log(`Deleted local file: ${filePath}`);
      } catch (error) {
        if (error.code !== "ENOENT") {
          console.error(`Failed to delete local file ${filePath}: ${error.message}`);
        }
      }
    }
  }
}