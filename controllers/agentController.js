import fs from 'fs';
import path from 'path';
import Agent from '../models/Agent.js';
import { parseFile } from '../services/parseFile.js';
import { AIAudioFileService } from '../services/transcribeAudio.js';
import { VideoProcessor } from '../services/transcribeVideo.js';
import { scrapeAllRoutes } from '../services/scrapeWebsite.js';
import { Train_Agent_with_Youtube_URL } from '../services/trainYoutube.js';

export const checkAgent = async (req, res) => {
  const { agentId } = req.body;
  const agent = await Agent.findOne({ agentId });
  if (agent) {
    return res.json({ exists: true, isTrained: agent.isTrained, agentName: agent.agentName });
  }
  return res.json({ exists: false });
};

export const trainAgent = async (req, res) => {
  const { agentId, websiteUrl, youtubeUrl } = req.body;
  const agentName = `AI Agent ${agentId}`;
  const trainingData = [];

  try {
    if (req.files?.documents) {
      for (const doc of req.files.documents) {
        const ext = path.extname(doc.originalname).slice(1).toLowerCase();
        const buffer = fs.readFileSync(doc.path);
        const content = await parseFile(buffer, ext);
        trainingData.push({ data: content, source: 'document' });
        fs.unlinkSync(doc.path);
      }
    }

    if (req.files?.audioFile?.[0]) {
      const service = new AIAudioFileService();
      const content = await service.processFile(
        req.files.audioFile[0].path,
        req.files.audioFile[0].originalname,
        req.files.audioFile[0].mimetype
      );
      trainingData.push({ data: content, source: 'audio' });
    }

    if (req.files?.videoFile?.[0]) {
      const videoProcessor = new VideoProcessor();
      const fileName = req.files.videoFile[0].filename;
      const content = await videoProcessor.processVideoFile(fileName);
      trainingData.push({ data: content, source: 'video' });
    }

    if (websiteUrl) {
      const content = await scrapeAllRoutes(websiteUrl);
      trainingData.push({ data: content, source: 'website' });
    }

    if (youtubeUrl) {
      const youtubeResult = await Train_Agent_with_Youtube_URL(youtubeUrl);
      if (Array.isArray(youtubeResult)) {
        for (const item of youtubeResult) {
          if (item?.fullTranscript) {
            trainingData.push({ data: item.fullTranscript, source: 'youtube' });
          }
        }
      } else if (youtubeResult?.error) {
        return res.status(400).json({ success: false, message: youtubeResult.error });
      }
    }

    const updatedAgent = await Agent.findOneAndUpdate(
      { agentId },
      { agentId, agentName, isTrained: true, trainingData },
      { upsert: true, new: true }
    );

    res.json({ success: true, message: 'Training completed', agentId });

  } catch (error) {
    console.error('Error in trainAgent:', error);
    res.status(500).json({ success: false, message: 'Training failed', error: error.message });
  }
};

export const getAgentStatus = async (req, res) => {
  const agent = await Agent.findOne({ agentId: req.params.agentId });
  if (!agent) return res.status(404).json({ agentId: req.params.agentId, isTrained: false });
  res.json({ agentId: agent.agentId, isTrained: agent.isTrained, agentName: agent.agentName });
};

export const sendAgentMessage = async (req, res) => {
  const agent = await Agent.findOne({ agentId: req.params.agentId });
  if (!agent || !agent.isTrained) {
    return res.status(400).json({ answer: "Agent not trained yet." });
  }

  const { question } = req.body;
  res.json({
    answer: `Sample response to: "${question}"`,
    source: "trainingData"
  });
};
