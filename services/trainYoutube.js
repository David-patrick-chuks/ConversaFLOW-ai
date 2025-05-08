import { YoutubeTranscript } from 'youtube-transcript';
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

const apiKeys = [
  process.env.GEMINI_API_KEY_1,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
];

let currentApiKeyIndex = 0;
const getNextApiKey = () => {
  currentApiKeyIndex = (currentApiKeyIndex + 1) % apiKeys.length;
  return apiKeys[currentApiKeyIndex];
};

function cleanTranscript(text) {
  return text.replace(/\[.*?\]/g, '').replace(/&amp;#39;/g, "'");
}

export async function getYouTubeTranscript(url) {
  let videoId = null;
  const parsedUrl = new URL(url);

  if (parsedUrl.hostname.includes('youtube.com')) {
    videoId = parsedUrl.searchParams.get("v");
  } else if (parsedUrl.hostname === 'youtu.be') {
    videoId = parsedUrl.pathname.split("/")[1];
  }

  if (!videoId) throw new Error("Invalid YouTube URL");

  const transcript = await YoutubeTranscript.fetchTranscript(videoId);
  return transcript.map(item => item.text).join(' ');
}

const MainPrompt = "Transform the YouTube video transcript into a structured format, suitable for training another AI model.";

const getSchema = () => ({
  description: "Transform YouTube transcript into structured training data.",
  type: SchemaType.ARRAY,
  items: {
    type: SchemaType.OBJECT,
    properties: {
      transcriptTitle: { type: SchemaType.STRING },
      fullTranscript: { type: SchemaType.STRING },
      contentTokenCount: { type: SchemaType.STRING },
    },
    required: ["transcriptTitle", "fullTranscript", "contentTokenCount"],
  },
});

export async function Train_Agent_with_Youtube_URL(url) {
  try {
    let apiKey = apiKeys[currentApiKeyIndex];
    const rawTranscript = await getYouTubeTranscript(url);
    const cleaned = cleanTranscript(rawTranscript);

    const googleAI = new GoogleGenerativeAI(apiKey);
    const model = googleAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: getSchema(),
      },
    });

    const result = await model.generateContent(`${MainPrompt}\n\n${cleaned}`);
    return JSON.parse(result.response.text());

  } catch (err) {
    if (err.message.includes("429")) {
      getNextApiKey();
      return Train_Agent_with_Youtube_URL(url);
    }
    throw err;
  }
}
