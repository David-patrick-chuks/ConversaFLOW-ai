import { GoogleGenerativeAI } from "@google/generative-ai";
import { getApiKeys } from "./aiKeysGen.js";

// this keeps track of the current Gemini AI key in use
let currentApiKeyIndex = 0;

let geminiApiKeys = getApiKeys();
console.log(geminiApiKeys, "loadingKeys");
// function to get the next API key in the list
const getNextApiKey = () => {
  // circular rotation of Gemini API keys
  currentApiKeyIndex = (currentApiKeyIndex + 1) % geminiApiKeys.length;
  return geminiApiKeys[currentApiKeyIndex];
};

export async function runAgent(
  schema,
  agentDataSource,
  previousMessages,
  currentUserMessage
) {
  let geminiApiKey = geminiApiKeys[currentApiKeyIndex];
  let currentApiKeyName = `GEMINI_API_KEY_${currentApiKeyIndex + 1}`;

  console.log(
    `\n\n 🔑🔑🔑  Key: ${currentApiKeyName} selected. Proceeding with analysis.`
  );

  if (!geminiApiKey) {
    console.error("No  API key available.");
    return "No Gemini API key available 😢";
  }

  const generationConfig = {
    responseMimeType: "application/json",
    responseSchema: schema,
  };

  const googleAI = new GoogleGenerativeAI(geminiApiKey);
  const model = googleAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    generationConfig,
  });

  const prompt = `You are an AI sales assistant designed to provide exceptional customer service by responding to inquiries about products and services. Your responses must be based EXCLUSIVELY on the provided training data.

**Core Guidelines:**
1. EXCLUSIVELY reference information contained in the training data provided below
2. If a customer asks about something not covered in the training data, politely acknowledge the limitation with: "I don't have specific information about that in my knowledge base, but I'd be happy to help with [relevant alternative]"
3. Deliver concise, professional responses with a friendly tone
4. Clearly attribute each piece of information to its source document
5. Use the generateResponse function to structure all responses with proper citation

**Training Data:**
${JSON.stringify(agentDataSource, null, 2)}

**Response Structure:**
- Begin with a warm greeting
- Address the customer's specific question
- Provide information with clear source attribution (e.g., "According to our product catalog...")
- Close with an offer for additional assistance

**Conversation Context:**
Previous messages from this conversation: ${JSON.stringify(previousMessages)}

**Current User Message:**
${currentUserMessage}

Remember: You represent our brand. Maintain a helpful, knowledgeable tone while staying strictly within the boundaries of your training data.`;

  try {
    const result = await model.generateContent(prompt);

    if (!result || !result.response) {
      console.info("No response received from the Gemini AI model.");
      return "Service not available!";
    }

    const responseText = result.response.text();
    console.log(responseText, "...");
    const data = JSON.parse(responseText);

    return data;
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("429 Too Many Requests")) {
        console.error(
          `...${currentApiKeyName} limit exhauusested, switching to the next Gemini API key...`
        );
        // Switching to next key
        geminiApiKey = getNextApiKey();
        currentApiKeyName = `GEMINI_API_KEY_${currentApiKeyIndex + 1}`;
        return runAgent(
          schema,
          agentDataSource,
          previousMessages,
          currentUserMessage
        );
      } else if (error.message.includes("503 Service Unavailable")) {
        console.error("Service is temporarily unavailable. Retrying...");
        // implementing  retry logic, Waiting or 5 seconds before retrying ||
        await new Promise((resolve) => setTimeout(resolve, 5000));
        return runAgent(
          schema,
          agentDataSource,
          previousMessages,
          currentUserMessage
        );
      } else {
        console.error("An Error runing AI Agent:", error.message);
        return "An error occurred while is being generated...";
      }
    } else {
      console.error("An unknown error occurred:", error);
      return "An unknown error occurred.";
    }
  }
}
