import express from "express";
import multer from "multer";
import {
  checkAgent,
  trainAgent,
  getAgentStatus,
  sendAgentMessage,
} from "../controllers/agentController.js";

const router = express.Router();
const upload = multer({ dest: "uploads/" });

router.post("/check", checkAgent);
router.post(
  "/train",
  upload.fields([
    { name: "audioFile", maxCount: 1 },
    { name: "videoFile", maxCount: 1 },
    { name: "documents", maxCount: 5 },
  ]),
  trainAgent
);
router.get("/:agentId/status", getAgentStatus);
router.post(
  "/:agentId/message",
  upload.single("image"), // Add support for a single image upload
  sendAgentMessage
);

export default router;
