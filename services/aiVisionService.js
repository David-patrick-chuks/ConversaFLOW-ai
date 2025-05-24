import {
  GoogleGenAI,
  createUserContent,
  createPartFromUri,
} from "@google/genai";
import fs from "fs";
import path from "path";
import mime from "mime-types";

export class AIVisionService {
  constructor() {
    // Initialize the list of API keys
    this.apiKeys = [
      "AIzaSyAIcaMSaIPnbsulIMi7WJSrx95tiwyyjIo",
      "AIzaSyDi4JRtfBP0NEXXWLT40rYTD5-_bIBIogQ",
      "AIzaSyB1YZPMxgYzLdhyWOoLQoi6Akv_AVZQihs",
      "AIzaSyADgAkDx5jvf8kmyk9NqcKSQtSNqeG62qA",
      "AIzaSyAv4K3hVofefPm1d5mt4Y39NQVXNQ49Dbg",
      "AIzaSyDV9XzIcYhYw9uqNrWZNfI25GT3iFlGy3A",
      "AIzaSyDYeeex41Ssr409I1sx04Jxk3xlb-z1O5M",
      "AIzaSyDAwMfnUqo7REPxSkLVOCo9OTeaEHAf43E",
    ];
    this.currentApiKeyIndex = 0;
    this.ai = new GoogleGenAI({
      apiKey: this.apiKeys[this.currentApiKeyIndex],
    });
  }

  // Switch to the next API key if the current one fails
  switchApiKey() {
    this.currentApiKeyIndex =
      (this.currentApiKeyIndex + 1) % this.apiKeys.length;
    this.ai = new GoogleGenAI({
      apiKey: this.apiKeys[this.currentApiKeyIndex],
    });
    console.log(`🔄 Switched to API key: ${this.currentApiKeyIndex + 1}`);
  }

  // Process a single image file
  async processImage(imagePath, retryCount = 0, maxRetries = 3) {
    try {
      // Check if the file exists
      if (!fs.existsSync(imagePath)) {
        throw new Error(`File not found: ${imagePath}`);
      }
      console.log(imagePath, "imagePath");
      // Determine MIME type
      const mimeType = mime.lookup(imagePath);
      if (!mimeType || !mimeType.startsWith("image/")) {
        throw new Error("Unsupported file format. Only images are allowed.");
      }

      // Upload the image file to Gemini server
      const uploadedFile = await this.ai.files.upload({
        file: imagePath,
        config: { mimeType: mimeType },
      });

      // Create part for the uploaded image
      const imagePart = createPartFromUri(
        uploadedFile.uri,
        uploadedFile.mimeType
      );

      // System prompt for image description
      const systemPrompt = `
You are an AI vision assistant. Your task is to provide a detailed description of the provided image.

AI Response (json):
{
  "description": "A detailed description of the image content."
}
`;

      // Generate content using Gemini
      const result = await this.ai.models.generateContent({
        model: "gemini-2.0-flash",
        config: {
          responseMimeType: "application/json",
          systemInstruction: systemPrompt,
        },
        contents: createUserContent([
          imagePart,
          "Describe this image in detail.",
        ]),
      });

      // Validate and parse the response
      if (!result.text) {
        throw new Error("Invalid response from the model.");
      }

      const parsedResult = JSON.parse(result.text);
      if (!parsedResult.description) {
        throw new Error("No description found in the response.");
      }

      return parsedResult.description;
    } catch (error) {
      if (retryCount < maxRetries) {
        if (error.message.includes("429 Too Many Requests")) {
          console.error(
            `🚨 API key ${
              this.currentApiKeyIndex + 1
            } limit exhausted, switching...`
          );
          this.switchApiKey();
          await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds
          return this.processImage(imagePath, retryCount + 1, maxRetries);
        } else if (error.message.includes("503 Service Unavailable")) {
          console.error("⏳ Service is unavailable. Retrying in 5 seconds...");
          await new Promise((resolve) => setTimeout(resolve, 5000));
          return this.processImage(imagePath, retryCount + 1, maxRetries);
        } else {
          console.error("⚠ Error processing image:", error.message);
          throw error;
        }
      } else {
        console.error(
          "Maximum retry attempts reached. Could not process the image."
        );
        throw new Error("Failed to process image after maximum retries.");
      }
    }
  }

  // Public method to describe a single image
  async describeImage(imagePath) {
    return await this.processImage(imagePath);
  }
}
