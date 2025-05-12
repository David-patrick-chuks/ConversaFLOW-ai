import { YoutubeTranscript } from "youtube-transcript";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import dotenv from "dotenv";

/**
 * Initializes environment variables and configures API keys for Google Generative AI.
 */
dotenv.config();

const API_KEYS = [
  process.env.GEMINI_API_KEY_1,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
].filter(Boolean); // Remove undefined/null keys

if (API_KEYS.length === 0) {
  throw new Error("No valid GEMINI_API_KEY provided in environment variables.");
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
 * Cleans a transcript by removing unwanted annotations and special characters.
 * @param {string} text - The raw transcript text.
 * @returns {string} The cleaned transcript text.
 */
const cleanTranscript = (text) => {
  return text
    .replace(/\[.*?\]/g, "") // Remove annotations like [Music]
    .replace(/&#39;/g, "'") // Replace HTML entities
    .trim();
};

/**
 * Extracts the YouTube video ID from a URL.
 * @param {string} url - The YouTube video URL.
 * @returns {string} The extracted video ID.
 * @throws {Error} If the URL is invalid.
 */
const extractVideoId = (url) => {
  try {
    const parsedUrl = new URL(url);
    let videoId = null;

    if (parsedUrl.hostname.includes("youtube.com")) {
      videoId = parsedUrl.searchParams.get("v");
    } else if (parsedUrl.hostname === "youtu.be") {
      videoId = parsedUrl.pathname.split("/")[1];
      const index = videoId.indexOf("?");
      if (index !== -1) videoId = videoId.substring(0, index); // Handle query params
    }

    if (!videoId) throw new Error("Invalid YouTube URL: No video ID found.");
    return videoId;
  } catch (error) {
    throw new Error(`Failed to parse YouTube URL: ${error.message}`);
  }
};

/**
 * Fetches the transcript of a YouTube video.
 * @param {string} url - The YouTube video URL.
 * @returns {Promise<string>} The concatenated transcript text.
 * @throws {Error} If the transcript cannot be fetched.
 */
const fetchYouTubeTranscript = async (url) => {
  try {
    const videoId = extractVideoId(url);
    const transcript = await YoutubeTranscript.fetchTranscript(videoId, {
      lang: "en", // Optionally specify language
    });
    return transcript.map((item) => item.text).join(" ");
  } catch (error) {
    // Check for transcript disabled error by message content
    if (error.message && error.message.includes("Transcript is disabled")) {
      throw new Error(
        `Transcript is disabled for video ID ${extractVideoId(
          url
        )}. Consider alternative training sources.`
      );
    }
    throw new Error(`Failed to fetch transcript: ${error.message}`);
  }
};

/**
 * Defines the schema for structured transcript data.
 * @returns {Object} The JSON schema for the transcript data.
 */
const getTranscriptSchema = () => ({
  description: "Structured YouTube transcript data for AI training.",
  type: SchemaType.ARRAY,
  items: {
    type: SchemaType.OBJECT,
    properties: {
      fullTranscript: {
        type: SchemaType.STRING,
        description: "The complete cleaned transcript text.",
      },
      contentTokenCount: {
        type: SchemaType.NUMBER,
        description: "Token count of the transcript content.",
      },
    },
    required: ["fullTranscript", "contentTokenCount"],
  },
});

/**
 * Transforms a YouTube transcript into structured data for AI training.
 * @param {string} url - The YouTube video URL.
 * @returns {Promise<Object>} The structured transcript data.
 * @throws {Error} If the transformation fails.
 AscendingRetryError
 */
export const transformYouTubeTranscript = async (url) => {
  let apiKey = API_KEYS[currentApiKeyIndex];
  const maxRetries = API_KEYS.length * 2; // Allow retries for each key
  let retries = 0;

  try {
    // Fetch and clean transcript once before retry loop
    const rawTranscript = await fetchYouTubeTranscript(url);
    const cleanedTranscript = cleanTranscript(rawTranscript);
    console.log(`Successfully fetched and cleaned transcript for URL: ${url}`);

    while (retries < maxRetries) {
      try {
        // Initialize Google Generative AI model
        const googleAI = new GoogleGenerativeAI(apiKey);
        const model = googleAI.getGenerativeModel({
          model: "gemini-1.5-flash",
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: getTranscriptSchema(),
          },
        });

        // Define prompt for transformation
        const prompt = `Transform the provided YouTube video transcript into a structured format suitable for training another AI model. Estimate the token count of the transcript content. Here is the transcript:\n\n${cleanedTranscript}`;

        // Generate structured content
        const result = await model.generateContent(prompt);
        let response;
        try {
          response = JSON.parse(result.response.text());
        } catch (parseError) {
          throw new Error(
            `Failed to parse Gemini API response: ${parseError.message}`
          );
        }

        // Validate response
        if (!Array.isArray(response) || response.length === 0) {
          throw new Error(
            "ached Invalid response format: Expected non-empty array."
          );
        }
        for (const item of response) {
          if (
            !item.fullTranscript ||
            typeof item.contentTokenCount !== "number"
          ) {
            throw new Error(
              "Invalid response item: Missing fullTranscript or contentTokenCount."
            );
          }
        }

        console.log(`Successfully transformed transcript for URL: ${url}`);
        return response;
      } catch (error) {
        if (error.message.includes("429")) {
          console.log(
            `Rate limit exceeded for API key ${
              currentApiKeyIndex + 1
            }. Switching key and retrying...`
          );
          apiKey = getNextApiKey();
          retries++;
          // Exponential backoff: wait longer with each retry
          await new Promise((resolve) =>
            setTimeout(resolve, 1000 * Math.pow(2, retries))
          );
          continue;
        } else {
          console.error(
            `Error processing transcript for URL ${url}: ${error.message}`
          );
          return {
            error: `Failed to transform transcript: ${error.message}`,
            source: "youtube",
          };
        }
      }
    }

    return {
      error: `Failed to transform transcript after ${maxRetries} retries due to rate limiting.`,
      source: "youtube",
    };
  } catch (error) {
    console.error(
      `Error processing transcript for URL ${url}: ${error.message}`
    );
    return {
      error: `Failed to transform transcript: ${error.message}`,
      source: "youtube",
    };
  }
};

/**
 * Example usage of the transcript transformation function.
 */
const main = async () => {
  const youtubeUrl = "https://youtu.be/xww-80A-wns?si=NNJ6GzinXPZ5rZEc";
  try {
    const result = await transformYouTubeTranscript(youtubeUrl);
    console.log("Structured Transcript Data:", JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("Error:", error.message);
  }
};

// main();
