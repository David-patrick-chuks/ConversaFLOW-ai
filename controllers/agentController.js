import fs from "fs";
import path from "path";
import Agent from "../models/Agent.js";
import { parseFile } from "../services/parseFile.js";
import { AIAudioFileService } from "../services/transcribeAudio.js";
import { VideoProcessor } from "../services/transcribeVideo.js";
import { scrapeAllRoutes } from "../services/scrapeWebsite.js";
import { transformYouTubeTranscript } from "../services/trainYoutube.js";
import { runAgent } from "../scripts/generateResponseData.js";
import { AIAgentResponseSchema } from "../schema/index.js";
import { AIVisionService } from "../services/aiVisionService.js"; // New AI vision service
import { AIAudioService } from "../services/aiAudioService.js";

// Existing functions (checkAgent, validateAgentId, trainAgent, getAgentStatus) remain unchanged
const checkAgent = async (req, res) => {
  try {
    const { agentId } = req.body;
    validateAgentId(agentId);

    const agent = await Agent.findOne({ agentId });
    if (agent) {
      return res.json({
        exists: true,
        isTrained: agent.isTrained,
        agentName: agent.agentName,
      });
    }
    return res.json({ exists: false });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

const validateAgentId = (agentId) => {
  if (!agentId) {
    throw new Error("agentId is required");
  }
  if (typeof agentId !== "string" || agentId.trim() === "") {
    throw new Error("agentId must be a non-empty string");
  }
  return true;
};

const trainAgent = async (req, res) => {
  try {
    const { agentId, websiteUrl, youtubeUrl } = req.body;

    validateAgentId(agentId);

    const agentName = `AI Agent ${agentId}`;
    const trainingData = [];

    if (req.files?.documents) {
      for (const doc of Array.isArray(req.files.documents)
        ? req.files.documents
        : [req.files.documents]) {
        const ext = path.extname(doc.originalname).slice(1).toLowerCase();
        const buffer = fs.readFileSync(doc.path);
        const documentResult = await parseFile(buffer, ext);
        if (typeof documentResult === "string") {
          trainingData.push({ data: documentResult, source: "document" });
        } else if (documentResult?.error) {
          fs.unlinkSync(doc.path);
          return res.status(400).json({
            success: false,
            message: `Training failed for source: ${documentResult.source}`,
            error: documentResult.error,
            source: documentResult.source,
          });
        }
        fs.unlinkSync(doc.path);
      }
    }

    if (req.files?.audioFile?.[0]) {
      const service = new AIAudioFileService();
      const audioResult = await service.processFile(
        req.files.audioFile[0].path,
        req.files.audioFile[0].originalname,
        req.files.audioFile[0].mimetype
      );
      if (typeof audioResult === "string") {
        trainingData.push({ data: audioResult, source: "audio" });
      } else if (audioResult?.error) {
        return res.status(400).json({
          success: false,
          message: `Training failed for source: ${audioResult.source}`,
          error: audioResult.error,
          source: audioResult.source,
        });
      }
    }

    if (req.files?.videoFile?.[0]) {
      const videoProcessor = new VideoProcessor();
      const fileName = req.files.videoFile[0].filename;
      const videoResult = await videoProcessor.processVideoFile(fileName);
      if (typeof videoResult === "string") {
        trainingData.push({ data: videoResult, source: "video" });
      } else if (videoResult?.error) {
        return res.status(400).json({
          success: false,
          message: `Training failed for source: ${videoResult.source}`,
          error: videoResult.error,
          source: videoResult.source,
        });
      }
    }

    if (websiteUrl) {
      const websiteResult = await scrapeAllRoutes(websiteUrl);
      console.log(websiteResult, "website-result...");
      if (typeof websiteResult === "string") {
        trainingData.push({ data: websiteResult, source: "website" });
      } else if (websiteResult?.error) {
        return res.status(400).json({
          success: false,
          message: `Training failed for source: ${websiteResult.source}`,
          error: websiteResult.error,
          source: websiteResult.source,
        });
      }
    }

    if (youtubeUrl) {
      const youtubeResult = await transformYouTubeTranscript(youtubeUrl);
      if (Array.isArray(youtubeResult)) {
        for (const item of youtubeResult) {
          if (item?.fullTranscript) {
            trainingData.push({ data: item.fullTranscript, source: "youtube" });
          }
        }
      } else if (youtubeResult?.error) {
        return res.status(400).json({
          success: false,
          message: `Training failed for source: ${youtubeResult.source}`,
          error: youtubeResult.error,
          source: youtubeResult.source,
        });
      }
    }

    const updatedAgent = await Agent.findOneAndUpdate(
      { agentId },
      { agentId, agentName, isTrained: true, trainingData },
      { upsert: true, new: true }
    );
    res.json({ success: true, message: "Training completed", agentId });
  } catch (error) {
    console.error(
      `Error in trainAgent (source: ${error.source || "unknown"}): ${
        error.message
      }`
    );
    res.status(500).json({
      success: false,
      message: `Training failed for source: ${error.source || "unknown"}`,
      error: error.message,
      source: error.source || "unknown",
    });
  }
};

const getAgentStatus = async (req, res) => {
  try {
    const { agentId } = req.params;
    validateAgentId(agentId);

    const agent = await Agent.findOne({ agentId });
    if (!agent) {
      return res.status(404).json({
        agentId,
        isTrained: false,
        message: "Agent not found",
      });
    }
    res.json({
      agentId: agent.agentId,
      isTrained: agent.isTrained,
      agentName: agent.agentName,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Sends a message to a trained AI agent, handling text, image, audio, or any combination, and retrieves its response.
 * If an image is provided, it is processed by an AI vision service to generate a description.
 * If an audio file is provided, it is transcribed by an AI audio service.
 * @param {Object} req - Express request object containing agentId in params, question and previousMessages in body, and optional image/audio files.
 * @param {Object} res - Express response object.
 * @returns {Promise<void>} Responds with JSON containing the agent's response or error.
 * @throws {Error} If agentId is invalid, agent is not found, or input is invalid.
 */
const sendAgentMessage = async (req, res) => {
  try {
    const { agentId } = req.params;
    validateAgentId(agentId);

    const agent = await Agent.findOne({ agentId });
    if (!agent) {
      return res.status(404).json({
        message: "Agent not found",
      });
    }
    if (!agent.isTrained) {
      return res.status(400).json({
        message: "Agent not trained yet",
      });
    }

    const { question, previousMessages } = req.body;
    const image = req.files?.image?.[0]; // Image file from multer
    const audio = req.files?.audio?.[0]; // Audio file from multer

    // Check input: text, image, audio, or any combination
    const hasText =
      question && typeof question === "string" && question.trim() !== "";
    const hasImage = !!image;
    const hasAudio = !!audio;

    if (!hasText && !hasImage && !hasAudio) {
      return res.status(400).json({
        message: "At least a question, an image, or an audio file is required",
      });
    }

    let currentMessage = "";
    let imageDescription = "";
    let audioTranscription = "";

    // Process image if provided
    if (hasImage) {
      const visionService = new AIVisionService();
      const imagePath = image.path;
      try {
        imageDescription = await visionService.describeImage(imagePath);
        if (!imageDescription) {
          throw new Error("Failed to generate image description");
        }
      } finally {
        fs.unlinkSync(imagePath); // Clean up image file
      }
    }

    // Process audio if provided
    if (hasAudio) {
      const audioService = new AIAudioService();
      const audioPath = audio.path;
      try {
        audioTranscription = await audioService.transcribeAudio(audioPath);
        if (!audioTranscription) {
          throw new Error("Failed to generate audio transcription");
        }
      } finally {
        fs.unlinkSync(audioPath); // Clean up audio file
      }
    }

    // Combine text, image description, and audio transcription
    const messageParts = [];
    if (hasText) {
      messageParts.push(question);
    }
    if (hasImage) {
      messageParts.push(`Image Description: ${imageDescription}`);
    }
    if (hasAudio) {
      messageParts.push(`Audio Transcription: ${audioTranscription}`);
    }
    currentMessage = messageParts.join("\n\n");

    // Previous messages is an array of previous messages (user and AI agent)
    const prevMessages = previousMessages || [];
    const trainingSourceData = agent?.trainingData;

    const response = await runAgent(
      AIAgentResponseSchema,
      trainingSourceData,
      prevMessages,
      currentMessage
    );

    if (!response) {
      return res.status(500).json({
        success: false,
        message: "Something went wrong, please try again!",
      });
    }

    res.json({
      success: true,
      data: {
        message: response.message,
        source: response.sources,
        imageDescription: hasImage ? imageDescription : null,
        audioTranscription: hasAudio ? audioTranscription : null,
      },
    });
  } catch (error) {
    // Clean up files in case of error
    if (req.files?.image?.[0]) {
      fs.unlinkSync(req.files.image[0].path);
    }
    if (req.files?.audio?.[0]) {
      fs.unlinkSync(req.files.audio[0].path);
    }
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  checkAgent,
  trainAgent,
  getAgentStatus,
  sendAgentMessage,
};
