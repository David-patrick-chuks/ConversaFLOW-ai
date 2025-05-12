import { GoogleGenAI, createUserContent, createPartFromUri } from "@google/genai";
import fs from "fs/promises"; // Use promises for async file operations
import path from "path";
import mime from "mime-types";
import dotenv from "dotenv";

/**
 * Initializes environment variables.
 */
dotenv.config();

const API_KEYS = [
  process.env.GEMINI_API_KEY_1,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
].filter(Boolean); // Remove undefined/null keys

if (API_KEYS.length === 0) {
  throw new Error("No valid GEMINI_API_KEY provided for video processing.");
}

/**
 * Processes video files using Google Generative AI.
 */
export class VideoProcessor {
  constructor() {
    this.apiKeys = API_KEYS;
    this.currentApiKeyIndex = 0;
    this.ai = new GoogleGenAI({ apiKey: this.apiKeys[this.currentApiKeyIndex] });
  }

  /**
   * Switches to the next API key for rate limit handling.
   */
  switchApiKey() {
    this.currentApiKeyIndex = (this.currentApiKeyIndex + 1) % this.apiKeys.length;
    this.ai = new GoogleGenAI({ apiKey: this.apiKeys[this.currentApiKeyIndex] });
  }

  /**
   * Validates input parameters for video processing.
   * @param {string} fileName - Name of the video file.
   * @throws {Error} If validation fails.
   */
  validateInputs(fileName) {
    if (!fileName || typeof fileName !== "string" || fileName.trim() === "") {
      throw new Error("fileName must be a non-empty string");
    }
  }

  /**
   * Processes a video file and generates a summary or transcription.
   * @param {string} fileName - Name of the video file in the uploads directory.
   * @returns {Promise<string|Object>} The generated content or an error object.
   */
  async processVideoFile(fileName) {
    const maxRetries = this.apiKeys.length * 2;
    let retries = 0;
    let uploadedFile = null;

    try {
      // Validate inputs
      this.validateInputs(fileName);

      // Resolve file path and check existence
      const filePath = path.resolve("uploads", fileName);
      try {
        await fs.access(filePath);
      } catch {
        throw new Error(`Video file not found: ${filePath}`);
      }

      // Validate MIME type
      const mimeType = mime.lookup(fileName);
      if (!mimeType || !mimeType.startsWith("video/")) {
        throw new Error("Unsupported file format: Must be a valid video MIME type (e.g., video/mp4)");
      }

      // Upload file
      try {
        const myFile = await this.ai.files.upload({
          file: filePath,
          config: { mimeType },
        });
        uploadedFile = myFile;
      } catch (error) {
        throw new Error(`Failed to upload video file: ${error.message}`);
      }

      // Generate content with retries
      while (retries < maxRetries) {
        try {
          const result = await this.ai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: createUserContent([
              createPartFromUri(uploadedFile.uri, uploadedFile.mimeType),
              "Transcribe or summarize the content of this video in detail.",
            ]),
          });

          const content = result.text;
          if (!content || content.trim() === "") {
            throw new Error("Generated content is empty or invalid");
          }

          console.log(`Successfully processed video file: ${fileName}`);
          return content;
        } catch (error) {
          if (error.message.includes("429") || error.message.includes("503")) {
            console.log(
              `API error (retry ${retries + 1}/${maxRetries}) for key ${this.currentApiKeyIndex + 1}: ${error.message}`
            );
            this.switchApiKey();
            retries++;
            // Exponential backoff
            await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, retries)));
            continue;
          } else {
            throw new Error(`Failed to generate content from video: ${error.message}`);
          }
        }
      }

      throw new Error(`Failed to process video after ${maxRetries} retries due to API errors`);
    } catch (error) {
      console.error(`Error processing video file ${fileName}: ${error.message}`);
      return { error: error.message, source: "video" };
    } finally {
      // Clean up uploaded file
      if (uploadedFile) {
        try {
          await this.ai.files.delete(uploadedFile.uri);
          console.log(`Deleted uploaded file: ${uploadedFile.uri}`);
        } catch (error) {
          console.error(`Failed to delete uploaded file: ${error.message}`);
        }
      }
      // Clean up local file
      const filePath = path.resolve("uploads", fileName);
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