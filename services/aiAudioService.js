import { GoogleGenAI, createUserContent, createPartFromUri } from "@google/genai";
import fs from "fs";
import path from "path";
import mime from "mime-types";  // Import mime-types package

export class AIAudioService {
  constructor() {
    // Initialize the list of API keys
    this.apiKeys = [
      "AIzaSyDV9XzIcYhYw9uqNrWZNfI25GT3iFlGy3A",
      "AIzaSyAIcaMSaIPnbsulIMi7WJSrx95tiwyyjIo",
      "AIzaSyDi4JRtfBP0NEXXWLT40rYTD5-_bIBIogQ",
      "AIzaSyB1YZPMxgYzLdhyWOoLQoi6Akv_AVZQihs",
      "AIzaSyADgAkDx5jvf8kmyk9NqcKSQtSNqeG62qA",
      "AIzaSyAv4K3hVofefPm1d5mt4Y39NQVXNQ49Dbg",
      "AIzaSyDAwMfnUqo7REPxSkLVOCo9OTeaEHAf43E",
      "AIzaSyDYeeex41Ssr409I1sx04Jxk3xlb-z1O5M",
    ];
    this.currentApiKeyIndex = 0;
    this.ai = new GoogleGenAI({ apiKey: this.apiKeys[this.currentApiKeyIndex] });
  }

  // Switch to the next API key if the current one fails
  switchApiKey() {
    this.currentApiKeyIndex = (this.currentApiKeyIndex + 1) % this.apiKeys.length;
    this.ai = new GoogleGenAI({ apiKey: this.apiKeys[this.currentApiKeyIndex] });
    console.log(`🔄 Switched to API key: ${this.currentApiKeyIndex + 1}`);
  }

  // Process a single audio file
  async processAudio(audioPath, retryCount = 0, maxRetries = 3) {
    try {
      // Check if the file exists
      if (!fs.existsSync(audioPath)) {
        throw new Error(`File not found: ${audioPath}`);
      }

      // Determine MIME type
      const mimeType = mime.lookup(audioPath);
      if (!mimeType || !mimeType.startsWith("audio/")) {
        throw new Error("Unsupported file format. Only audio files are allowed.");
      }

      // Upload the audio file to Gemini server
      const uploadedFile = await this.ai.files.upload({
        file: audioPath,
        config: { mimeType: mimeType },
      });

      // Check if the upload returned valid uri and mimeType
      if (!uploadedFile.uri || !uploadedFile.mimeType) {
        throw new Error("File upload failed, URI or MIME type is missing.");
      }

      // System prompt for audio transcription
      const systemPrompt = `
You are an AI audio transcription assistant. Your task is to generate an accurate transcription of the provided audio file.

AI Response (text):
The transcribed text from the audio.
`;

      // Generate content using Gemini
      const result = await this.ai.models.generateContent({
        model: "gemini-1.5-flash",
        config: {
          responseMimeType: "text/plain",
          systemInstruction: systemPrompt,
        },
        contents: createUserContent([
          createPartFromUri(uploadedFile.uri, uploadedFile.mimeType),
          "Generate a transcript of the audio.",
        ]),
      });

      // Validate the response
      if (!result.text) {
        throw new Error("Invalid response from the model.");
      }

      return result.text;
    } catch (error) {
      if (retryCount < maxRetries) {
        if (error.message.includes("429 Too Many Requests")) {
          console.error(`🚨 API key ${this.currentApiKeyIndex + 1} limit exhausted, switching...`);
          this.switchApiKey();
          await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds
          return this.processAudio(audioPath, retryCount + 1, maxRetries);
        } else if (error.message.includes("503 Service Unavailable")) {
          console.error("⏳ Service is unavailable. Retrying in 5 seconds...");
          await new Promise((resolve) => setTimeout(resolve, 5000));
          return this.processAudio(audioPath, retryCount + 1, maxRetries);
        } else {
          console.error("⚠ Error processing audio:", error.message);
          throw error;
        }
      } else {
        console.error("Maximum retry attempts reached. Could not process the audio.");
        throw new Error("Failed to process audio after maximum retries.");
      }
    }
  }

  // Public method to transcribe a single audio file
  async transcribeAudio(audioPath) {
    return await this.processAudio(audioPath);
  }
}
