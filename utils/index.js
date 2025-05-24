// import { promises as fs } from "fs";
// import path from "path";
// import ffmpeg from "node-ffmpeg";
import sharp from "sharp";
import { spawn } from "node:child_process";
import { promisify } from "node:util";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";
import path from "path";
import fs from "fs";

/// Function to save scraped data to scrapedData.json
export const saveScrapedData = async function (link, content) {
  const scrapedDataPath = path.join("../data/scrapedData.json");
  const scrapedDataDir = path.dirname(scrapedDataPath);
  const scrapedData = {
    link,
    content,
  };
  try {
    // Ensure the directory exists
    await fs.mkdir(scrapedDataDir, { recursive: true });

    // Check if the file exists
    await fs.access(scrapedDataPath);
    // Read the existing data
    const data = await fs.readFile(scrapedDataPath, "utf-8");
    const json = JSON.parse(data);
    // Append the new scraped data
    json.push(scrapedData);
    // Write the updated data back to the file
    await fs.writeFile(scrapedDataPath, JSON.stringify(json, null, 2));
  } catch (error) {
    if (error.code === "ENOENT") {
      // File does not exist, create it with the new scraped data
      await fs.writeFile(
        scrapedDataPath,
        JSON.stringify([scrapedData], null, 2)
      );
    } else {
      logger.error("Error saving scraped data:", error);
      throw error;
    }
  }
};

// Default conversion targets
const DEFAULT_IMAGE_FORMAT = "jpeg";
const DEFAULT_AUDIO_FORMAT = "mp3";

export const getFileExtensionFromMulter = (file) => {
  // Use originalname to get the actual file extension
  return getFileExtension(file.originalname);
};

export const getFileExtension = (filename) => {
  return path.extname(filename).toLowerCase().substring(1);
};

// Convert image to supported format
export const convertImage = async (
  inputPath,
  outputPath,
  targetFormat = DEFAULT_IMAGE_FORMAT
) => {
  try {
    await sharp(inputPath).jpeg({ quality: 90 }).toFile(outputPath);

    console.log(`Image converted to ${targetFormat}`);
    return outputPath;
  } catch (error) {
    console.error("Image conversion failed:", error);
    throw new Error("Image conversion failed");
  }
};

// Convert audio to supported format
export const convertAudio = (
  inputPath,
  outputPath,
  targetFormat = DEFAULT_AUDIO_FORMAT
) => {
  return new Promise((resolve, reject) => {
    const args = [
      "-i",
      inputPath,
      "-acodec",
      "libmp3lame",
      "-b:a",
      "128k",
      "-ar",
      "44100",
      "-ac",
      "2",
      "-y", // overwrite output file
      outputPath,
    ];

    // Adjust codec based on target format
    if (targetFormat === "wav") {
      args[3] = "pcm_s16le";
      args.splice(4, 2); // remove bitrate for wav
    } else if (targetFormat === "aac") {
      args[3] = "aac";
    } else if (targetFormat === "ogg") {
      args[3] = "libvorbis";
    }

    console.log("Converting audio with args:", args);

    const ffmpeg = spawn(ffmpegPath.path, args);

    let stderr = "";

    ffmpeg.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        console.log(`Audio converted to ${targetFormat} successfully`);
        resolve(outputPath);
      } else {
        console.error("FFmpeg stderr:", stderr);
        reject(new Error(`Audio conversion failed with code ${code}`));
      }
    });

    ffmpeg.on("error", (error) => {
      console.error("FFmpeg spawn error:", error);
      reject(new Error(`Failed to start audio conversion: ${error.message}`));
    });
  });
};
