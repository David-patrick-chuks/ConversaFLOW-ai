import mongoose from "mongoose";

const trainingEntrySchema = new mongoose.Schema(
  {
    data: {
      type: String,
      required: true,
    },
    source: {
      type: String,
      enum: ["audio", "video", "document", "website", "youtube"],
      required: true,
    },
  },
  { _id: false }
);

const agentSchema = new mongoose.Schema(
  {
    agentId: {
      type: String,
      required: true,
      unique: true,
    },
    agentName: {
      type: String,
      required: true,
    },
    isTrained: {
      type: Boolean,
      default: false,
    },
    trainingData: {
      type: [trainingEntrySchema],
      default: [],
    },
  },
  { timestamps: true }
);

export default mongoose.model("Agent", agentSchema);
