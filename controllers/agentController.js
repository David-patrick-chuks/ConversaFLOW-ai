import fs from "fs";
import path from "path";
import Ffmpeg from "fluent-ffmpeg";
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
import {
  convertAudio,
  convertImage,
  getFileExtension,
  getFileExtensionFromMulter,
} from "../utils/index.js";

// Define supported formats
const SUPPORTED_IMAGE_FORMATS = ["jpeg", "jpg", "png", "webp"];
const SUPPORTED_AUDIO_FORMATS = ["mp3", "wav", "ogg", "aac"];

const DEFAULT_IMAGE_FORMAT = "jpeg";
const DEFAULT_AUDIO_FORMAT = "mp3";

// Check if image format is supported
const isImageFormatSupported = (filename) => {
  const ext = getFileExtension(filename);
  return SUPPORTED_IMAGE_FORMATS.includes(ext);
};

// Check if audio format is supported
const isAudioFormatSupported = (filename) => {
  const ext = getFileExtension(filename);
  return SUPPORTED_AUDIO_FORMATS.includes(ext);
};

// Existing functions (checkAgent, validateAgentId, trainAgent, getAgentStatus) remain unchanged
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

const validateAgentId = (agentId) => {
  if (!agentId) {
    throw new Error("agentId is required");
  }
  if (typeof agentId !== "string" || agentId.trim() === "") {
    throw new Error("agentId must be a non-empty string");
  }
  return true;
};

export const trainAgent = async (req, res) => {
  try {
    const { agentId, websiteUrl, youtubeUrl } = req.body;

    validateAgentId(agentId);

    const agentName = `AI Agent ${agentId}`;
    const trainingData = [];
    const trainedSources = []; // Array to track trained sources

    if (req.files?.documents) {
      for (const doc of Array.isArray(req.files.documents)
        ? req.files.documents
        : [req.files.documents]) {
        const ext = path.extname(doc.originalname).slice(1).toLowerCase();
        const buffer = fs.readFileSync(doc.path);
        const documentResult = await parseFile(buffer, ext);
        if (typeof documentResult === "string") {
          trainingData.push({ data: documentResult, source: "document" });
          trainedSources.push("document"); // Add source to trainedSources
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
      let processedAudioPath = null;
      let originalAudioPath = null;

      try {
        const audioFile = req.files.audioFile[0];
        originalAudioPath = audioFile.path;

        console.log(`Processing audio file: ${audioFile.originalname}`);
        console.log(
          `Original audio format: ${getFileExtensionFromMulter(audioFile)}`
        );

        if (isAudioFormatSupported(audioFile.originalname)) {
          console.log("Audio format is supported, no conversion needed");
          // Create a proper path with extension for supported formats
          const extension = getFileExtensionFromMulter(audioFile);
          processedAudioPath = `${audioFile.path}.${extension}`;
          // Rename the file to include the extension
          fs.renameSync(originalAudioPath, processedAudioPath);
        } else {
          console.log("Audio format not supported, converting...");
          const convertedAudioPath = `${audioFile.path}_converted.${DEFAULT_AUDIO_FORMAT}`;
          processedAudioPath = await convertAudio(
            audioFile.path,
            convertedAudioPath
          );
        }
        const service = new AIAudioFileService();
        const audioResult = await service.processFile(
          processedAudioPath,
          audioFile.originalname,
          audioFile.mimetype
        );

        if (typeof audioResult === "string") {
          trainingData.push({ data: audioResult, source: "audio" });
          trainedSources.push("audio"); // Add source to trainedSources
        } else if (audioResult?.error) {
          return res.status(400).json({
            success: false,
            message: `Training failed for source: ${audioResult.source}`,
            error: audioResult.error,
            source: audioResult.source,
          });
        }

        // Clean up processed audio file after successful processing
        if (processedAudioPath && fs.existsSync(processedAudioPath)) {
          fs.unlinkSync(processedAudioPath);
        }

        // Clean up original file only if it's different from processed file
        if (
          originalAudioPath &&
          processedAudioPath !== originalAudioPath &&
          fs.existsSync(originalAudioPath)
        ) {
          fs.unlinkSync(originalAudioPath);
        }
      } catch (audioError) {
        // Clean up files in case of error
        const filesToCleanup = [
          processedAudioPath,
          originalAudioPath,
          req.files.audioFile[0].path,
        ];

        filesToCleanup.forEach((filePath) => {
          if (filePath && fs.existsSync(filePath)) {
            try {
              fs.unlinkSync(filePath);
            } catch (cleanupError) {
              console.error(
                `Failed to cleanup audio file ${filePath}:`,
                cleanupError
              );
            }
          }
        });

        return res.status(400).json({
          success: false,
          message: `Audio processing failed: ${audioError.message}`,
          source: "audio",
        });
      }
    }

    if (req.files?.videoFile?.[0]) {
      const videoProcessor = new VideoProcessor();
      const fileName = req.files.videoFile[0].filename;
      const videoResult = await videoProcessor.processVideoFile(fileName);
      if (typeof videoResult === "string") {
        trainingData.push({ data: videoResult, source: "video" });
        trainedSources.push("video"); // Add source to trainedSources
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
        trainedSources.push("website"); // Add source to trainedSources
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
            if (!trainedSources.includes("youtube")) {
              trainedSources.push("youtube"); // Add source to trainedSources (only once)
            }
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

    // Include trainedSources in the response
    res.json({
      success: true,
      message: "Training completed",
      agentId,
      trainedSources, // Array of sources that were trained
    });
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

/**
 * Sends a message to a trained AI agent, handling text, image, audio, or any combination, and retrieves its response.
 * If an image is provided, it is processed by an AI vision service to generate a description.
 * If an audio file is provided, it is transcribed by an AI audio service.
 * @param {Object} req - Express request object containing agentId in params, question and previousMessages in body, and optional image/audio files.
 * @param {Object} res - Express response object.
 * @returns {Promise<void>} Responds with JSON containing the agent's response or error.
 * @throws {Error} If agentId is invalid, agent is not found, or input is invalid.
 */
// export const sendAgentMessage = async (req, res) => {
//   try {
//     const { agentId } = req.params;
//     validateAgentId(agentId);

//     const agent = await Agent.findOne({ agentId });
//     if (!agent) {
//       return res.status(404).json({
//         message: "Agent not found",
//       });
//     }
//     if (!agent.isTrained) {
//       return res.status(400).json({
//         message: "Agent not trained yet",
//       });
//     }

//     const { question, previousMessages } = req.body;
//     const image = req.files?.image?.[0]; // Image file from multer
//     const audio = req.files?.audio?.[0]; // Audio file from multer

//     // Check input: text, image, audio, or any combination
//     const hasText =
//       question && typeof question === "string" && question.trim() !== "";
//     const hasImage = !!image;
//     const hasAudio = !!audio;

//     console.log(audio, "audio recieved");

//     if (!hasText && !hasImage && !hasAudio) {
//       return res.status(400).json({
//         message: "At least a question, an image, or an audio file is required",
//       });
//     }

//     let currentMessage = "";
//     let imageDescription = "";
//     let audioTranscription = "";

//     // Process image if provided
//     if (hasImage) {
//       const visionService = new AIVisionService();
//       const imagePath = image.path;
//       try {
//         imageDescription = await visionService.describeImage(imagePath);
//         if (!imageDescription) {
//           throw new Error("Failed to generate image description");
//         }
//       } finally {
//         fs.unlinkSync(imagePath); // Clean up image file
//       }
//     }

//     // Process audio if provided
//     if (hasAudio) {
//       const audioService = new AIAudioService();
//       const audioPath = audio.path;
//       try {
//         audioTranscription = await audioService.transcribeAudio(audioPath);
//         if (!audioTranscription) {
//           throw new Error("Failed to generate audio transcription");
//         }
//       } finally {
//         fs.unlinkSync(audioPath); // Clean up audio file
//       }
//     }

//     // Combine text, image description, and audio transcription
//     const messageParts = [];
//     if (hasText) {
//       messageParts.push(question);
//     }
//     if (hasImage) {
//       messageParts.push(`Image Description: ${imageDescription}`);
//     }
//     if (hasAudio) {
//       messageParts.push(`Audio Transcription: ${audioTranscription}`);
//     }
//     currentMessage = messageParts.join("\n\n");

//     // Previous messages is an array of previous messages (user and AI agent)
//     const prevMessages = previousMessages || [];
//     const trainingSourceData = agent?.trainingData;

//     const response = await runAgent(
//       AIAgentResponseSchema,
//       trainingSourceData,
//       prevMessages,
//       currentMessage
//     );

//     if (!response) {
//       return res.status(500).json({
//         success: false,
//         message: "Something went wrong, please try again!",
//       });
//     }

//     res.json({
//       success: true,
//       data: {
//         message: response.message,
//         source: response.sources,
//         imageDescription: hasImage ? imageDescription : null,
//         audioTranscription: hasAudio ? audioTranscription : null,
//       },
//     });
//   } catch (error) {
//     // Clean up files in case of error
//     if (req.files?.image?.[0]) {
//       fs.unlinkSync(req.files.image[0].path);
//     }
//     if (req.files?.audio?.[0]) {
//       fs.unlinkSync(req.files.audio[0].path);
//     }
//     res.status(400).json({
//       success: false,
//       message: error.message,
//     });
//   }
// };

export const sendAgentMessage = async (req, res) => {
  let processedImagePath = null;
  let processedAudioPath = null;
  let originalImagePath = null;
  let originalAudioPath = null;

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

    console.log(audio, "audio received");

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
      originalImagePath = image.path;
      console.log(
        `Original image format: ${getFileExtensionFromMulter(image)}`
      );

      if (isImageFormatSupported(image.originalname)) {
        console.log("Image format is supported, no conversion needed");
        // Create a proper path with extension for supported formats
        const extension = getFileExtensionFromMulter(image);
        processedImagePath = `${image.path}.${extension}`;
        // Rename the file to include the extension
        fs.renameSync(originalImagePath, processedImagePath);
      } else {
        console.log("Image format not supported, converting...");
        const convertedImagePath = `${image.path}_converted.${DEFAULT_IMAGE_FORMAT}`;
        processedImagePath = await convertImage(image.path, convertedImagePath);
      }

      const visionService = new AIVisionService();
      try {
        imageDescription = await visionService.describeImage(
          processedImagePath
        );
        if (!imageDescription) {
          throw new Error("Failed to generate image description");
        }
      } catch (error) {
        throw error;
      }
    }

    // Process audio if provided
    if (hasAudio) {
      originalAudioPath = audio.path;
      console.log(
        `Original audio format: ${getFileExtensionFromMulter(audio)}`
      );

      if (isAudioFormatSupported(audio.originalname)) {
        console.log("Audio format is supported, no conversion needed");
        // Create a proper path with extension for supported formats
        const extension = getFileExtensionFromMulter(audio);
        processedAudioPath = `${audio.path}.${extension}`;
        // Rename the file to include the extension
        fs.renameSync(originalAudioPath, processedAudioPath);
      } else {
        console.log("Audio format not supported, converting...");
        const convertedAudioPath = `${audio.path}_converted.${DEFAULT_AUDIO_FORMAT}`;
        processedAudioPath = await convertAudio(audio.path, convertedAudioPath);
      }

      const audioService = new AIAudioService();
      try {
        audioTranscription = await audioService.transcribeAudio(
          processedAudioPath
        );
        if (!audioTranscription) {
          throw new Error("Failed to generate audio transcription");
        }
      } catch (error) {
        throw error;
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

    // Clean up files after successful processing
    // Clean up processed files (these now have extensions)
    if (processedImagePath && fs.existsSync(processedImagePath)) {
      fs.unlinkSync(processedImagePath);
    }
    if (processedAudioPath && fs.existsSync(processedAudioPath)) {
      fs.unlinkSync(processedAudioPath);
    }

    // Clean up original files only if they're different from processed files
    // (this handles the case where conversion failed and we still have the original)
    if (
      originalImagePath &&
      processedImagePath !== originalImagePath &&
      fs.existsSync(originalImagePath)
    ) {
      fs.unlinkSync(originalImagePath);
    }
    if (
      originalAudioPath &&
      processedAudioPath !== originalAudioPath &&
      fs.existsSync(originalAudioPath)
    ) {
      fs.unlinkSync(originalAudioPath);
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
    const filesToCleanup = [
      processedImagePath,
      processedAudioPath,
      originalImagePath,
      originalAudioPath,
      req.files?.image?.[0]?.path,
      req.files?.audio?.[0]?.path,
    ];

    filesToCleanup.forEach((filePath) => {
      if (filePath && fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (cleanupError) {
          console.error(`Failed to cleanup file ${filePath}:`, cleanupError);
        }
      }
    });

    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};
