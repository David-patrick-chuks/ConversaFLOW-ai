import fs from "fs";
import path from "path";
import Agent from "../models/Agent.js";
import { parseFile } from "../services/parseFile.js";
import { AIAudioFileService } from "../services/transcribeAudio.js";
import { VideoProcessor } from "../services/transcribeVideo.js";
import { scrapeAllRoutes } from "../services/scrapeWebsite.js";
import { transformYouTubeTranscript } from "../services/trainYoutube.js";

// Helper function to validate agentId
export const checkAgent = async (req, res) => {
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

/**
 * Validates the agentId.
 * @param {string} agentId - The agent identifier.
 * @returns {boolean} True if valid.
 * @throws {Error} If agentId is invalid.
 */
const validateAgentId = (agentId) => {
  if (!agentId) {
    throw new Error("agentId is required");
  }
  if (typeof agentId !== "string" || agentId.trim() === "") {
    throw new Error("agentId must be a non-empty string");
  }
  return true;
};

/**
 * Trains an AI agent with data from various sources.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */
export const trainAgent = async (req, res) => {
  try {
    const { agentId, websiteUrl, youtubeUrl } = req.body;
    validateAgentId(agentId);

    const agentName = `AI Agent ${agentId}`;
    const trainingData = [];

    // Process documents

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
          fs.unlinkSync(doc.path); // Clean up file before returning error
          return res.status(400).json({
            success: false,
            message: `Training failed for source: ${documentResult.source}`,
            error: documentResult.error,
            source: documentResult.source,
          });
        }
        fs.unlinkSync(doc.path); // Clean up file after success
      }
    }
    // Process audio file
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
    // Process video file
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
    // Process website
    if (websiteUrl) {
      const websiteResult = await scrapeAllRoutes(websiteUrl);
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

    // Process YouTube
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

    // Save training data to the agent
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

export const getAgentStatus = async (req, res) => {
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

export const sendAgentMessage = async (req, res) => {
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

    const { question } = req.body;
    if (!question || typeof question !== "string" || question.trim() === "") {
      return res.status(400).json({
        message: "Valid question is required",
      });
    }

    res.json({
      answer: `Sample response to: "${question}"`,
      source: "trainingData",
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};
