import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { connectDB } from "./utils/mongoConnect.js";
import agentRoutes from "./routes/agent.js";
import userRoutes from "./routes/user.js";
import path from "path";
import fs from "fs";

dotenv.config();

const app = express();
app.use(
  cors({
    origin: [
      "http://localhost:8080", // Fixed: removed /*
      "http://localhost:3000", // Fixed: removed /*
      "https://nexa-ai-one.vercel.app", // Fixed: removed /*
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  })
);

app.use(express.json());

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

// ✅ Serve static files from /uploads
app.use("/uploads", express.static(uploadsDir));

// ✅ Root route for server status
app.get("/", (req, res) => {
  res.status(200).json({
    status: "success",
    message: "🚀 Server is live!",
  });
});

// API routes
app.use("/api/agent", agentRoutes);
app.use("/api/users", userRoutes);

// Connect to MongoDB
connectDB();

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
