# AI Agent Training Backend

A full Express.js + MongoDB backend for training and testing AI agents using:
- YouTube videos
- Audio and video files
- Website content
- Documents (PDF, DOCX, etc.)

## 📦 Setup

### 1. Clone the Repo
```bash
git clone https://github.com/your-org/ai-agent-training-backend.git
cd ai-agent-training-backend
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment
Create a `.env` file:
```env
MONGODB_URI=mongodb://localhost:27017/ai-agent-db
PORT=5000
GEMINI_API_KEY_1=your_google_gemini_api_key_1
GEMINI_API_KEY_2=your_google_gemini_api_key_2
GEMINI_API_KEY_3=your_google_gemini_api_key_3
GEMINI_API_KEY_41=your_gemini_api_key_audio_processing
```

### 4. Start Server
```bash
npm start
```

## 📂 Directory Structure
```
ai-agent-training-backend/
├── controllers/
├── models/
├── routes/
├── services/
├── utils/
├── uploads/
```

## 🧠 Features
- Transcribe and parse all input types into text
- Store structured training data in MongoDB
- Easily extendable architecture

## ✅ API Endpoints
| Method | Endpoint                  | Description                 |
|--------|---------------------------|-----------------------------|
| POST   | `/api/agent/check`        | Check if agent exists       |
| POST   | `/api/agent/train`        | Train agent (multipart)     |
| GET    | `/api/agent/:agentId/status` | Get training status      |
| POST   | `/api/agent/:agentId/message` | Ask the trained agent   |

---

Built with ❤️ for scalable AI assistant workflows.
