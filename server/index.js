// PSych/server/index.js
import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import { Readable } from "stream";
import fs from "fs";
import compression from "compression";
import WebSocket, { WebSocketServer } from "ws";
import http from "http";
import OpenAI from "openai";

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Configurable chat model for lower latency (set via env: OPENAI_CHAT_MODEL)
// Use gpt-4o-mini for faster responses with acceptable quality
const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini';

// ---------------- Realtime psychologist brain ----------------

const REALTIME_MODEL = "gpt-4o-realtime-preview";
const REALTIME_URL = `wss://api.openai.com/v1/realtime?model=${REALTIME_MODEL}`;

// Concise therapist system prompt optimized for speed
const THERAPIST_PROMPT = `You are a supportive psychological companion. Be warm, non-judgmental, and genuine. Listen actively. Ask clarifying questions. Use short paragraphs (2-3 sentences). Reflect feelings: "It sounds like...", "I hear...". If user mentions crisis (self-harm, suicide), say you cannot handle emergencies and strongly recommend contacting local crisis hotlines. You are NOT a licensed therapist. If user speaks Malayalam, respond in Malayalam. Otherwise, respond in English.`.trim();

// 🧠 Realtime helper – gets therapist reply as text
async function askRealtimePsychologist(userText) {
  return new Promise((resolve, reject) => {
    console.log('Connecting to Realtime API...');
    
    const ws = new WebSocket(REALTIME_URL, {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "OpenAI-Beta": "realtime=v1",
      },
    });

    let fullText = "";

    ws.on("open", () => {
      console.log('✅ Realtime WebSocket opened');
      ws.send(
        JSON.stringify({
          type: "session.update",
          session: {
            instructions: THERAPIST_PROMPT,
            modalities: ["text"], // we get text and then TTS it
          },
        })
      );

      // 2) Add the user's message
      ws.send(
        JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [
              {
                type: "input_text",
                text: userText,
              },
            ],
          },
        })
      );

      // 3) Ask the model to respond
      ws.send(
        JSON.stringify({
          type: "response.create",
          response: {
            modalities: ["text"],
          },
        })
      );
    });

    ws.on("message", (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch (err) {
        console.error("Realtime parse error:", err);
        return;
      }

      switch (msg.type) {
        case "response.text.delta":
          if (msg.delta) fullText += msg.delta;
          break;

        case "response.done":
          ws.close();
          resolve(
            fullText.trim() ||
              "I’m here with you. I had trouble forming a full reply. Can you say a bit more?"
          );
          break;

        case "error":
          console.error("Realtime error event:", msg);
          ws.close();
          reject(
            new Error(msg.error?.message || "Realtime error from model")
          );
          break;

        default:
        // ignore other events
      }
    });

    ws.on("error", (err) => {
      console.error("Realtime WS error:", err);
      reject(err);
    });
  });
}

// 🧠 Chat API helper – streaming for ultra-low latency first-token
async function askPsychologist(userText) {
  try {
    const start = Date.now();
    let fullReply = '';
    
    // Stream for faster first-token time
    const stream = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        { role: 'system', content: THERAPIST_PROMPT },
        { role: 'user', content: userText },
      ],
      temperature: 0.5,
      max_tokens: 150,
      stream: true, // Enable streaming
    });

    // Consume stream and aggregate response
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content || '';
      if (delta) fullReply += delta;
    }

    const duration = Date.now() - start;
    console.log(`✅ Chat API reply (${duration}ms, ${fullReply.length} chars)`);
    return fullReply.trim() || "I'm here with you. Let me think about that...";
  } catch (err) {
    console.error("Chat API error:", err);
    throw err;
  }
}

// 🔊 Streaming TTS helper – returns async iterator for progressive playback
async function* streamTextToSpeech(text) {
  try {
    console.log(`🔊 Streaming TTS for (${text.length} chars)`);
    const start = Date.now();
    
    const speech = await openai.audio.speech.create({
      model: 'tts-1',
      voice: 'alloy',  // alloy is fastest
      input: text,
      format: 'mp3',
    });

    const buffer = Buffer.from(await speech.arrayBuffer());
    const duration = Date.now() - start;
    console.log(`✅ TTS audio generated (${duration}ms, ${buffer.length} bytes)`);
    
    // Yield chunks to stream progressively
    const chunkSize = 4096;
    for (let i = 0; i < buffer.length; i += chunkSize) {
      yield buffer.slice(i, Math.min(i + chunkSize, buffer.length));
    }
  } catch (err) {
    console.error("TTS error:", err);
    throw err;
  }
}

// ---------------- Middleware ----------------

app.use(cors());
app.use(express.json());
app.use(compression()); // Enable gzip compression for all responses

// Add response timing header middleware (set before response is sent)
app.use((req, res, next) => {
  const start = Date.now();
  // Override the send method to add timing header
  const originalSend = res.send;
  res.send = function(data) {
    const duration = Date.now() - start;
    res.set('X-Response-Time', `${duration}ms`);
    return originalSend.call(this, data);
  };
  next();
});

// -------- TEXT route (optional, for testing via Thunder Client) --------

app.post("/api/psych", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "message is required" });
    }

    const start = Date.now();
    console.log('▶ POST /api/psych - start');
    const reply = await askPsychologist(message);
    const duration = Date.now() - start;
    console.log(`✅ POST /api/psych - done (${duration}ms)`);
    return res.json({ reply, durationMs: duration });
  } catch (err) {
    console.error("Error in /api/psych:", err);
    return res.status(500).json({ error: "Something went wrong" });
  }
});

// -------- STREAMING TEXT + AUDIO route (returns NDJSON: text chunks then TTS audio) --------

app.post("/api/psych-stream", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "message is required" });
    }

    const start = Date.now();
    console.log('▶ POST /api/psych-stream - start');

    // Get the full reply text first
    const reply = await askPsychologist(message);
    const textTime = Date.now() - start;
    console.log(`  └─ Chat API: ${textTime}ms`);

    // Send response in NDJSON format: first the text, then the audio chunks
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');

    // 1) Send the full text immediately so UI can display it right away
    res.write(JSON.stringify({ type: 'text', data: reply }) + '\n');

    // 2) Stream TTS audio chunks in parallel
    try {
      let totalBytes = 0;
      for await (const chunk of streamTextToSpeech(reply)) {
        totalBytes += chunk.length;
        // Send audio chunk as base64 in NDJSON
        res.write(JSON.stringify({ type: 'audio', data: chunk.toString('base64') }) + '\n');
      }
      const duration = Date.now() - start;
      console.log(`✅ POST /api/psych-stream - done (${duration}ms, text at ${textTime}ms, audio ${totalBytes} bytes)`);
      res.end();
    } catch (streamErr) {
      console.error("Error during stream:", streamErr);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed during streaming" });
      } else {
        res.end();
      }
    }
  } catch (err) {
    console.error("Error in /api/psych-stream:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Something went wrong" });
    }
  }
});

// -------- REALTIME SESSION ENDPOINTS --------

// Create a realtime session for WebRTC-style bidirectional streaming
app.post("/api/realtime-session", async (req, res) => {
  try {
    const { instructions } = req.body;
    const systemPrompt = instructions || THERAPIST_PROMPT;

    console.log('🔄 Creating realtime session...');
    const session = await openai.beta.realtime.sessions.create({
      model: REALTIME_MODEL,
      instructions: systemPrompt,
      voice: "alloy",  // Fast voice for real-time
      modalities: ["text", "audio"],
      input_audio_format: "pcm16",
      output_audio_format: "pcm16",
      input_audio_transcription: {
        model: "whisper-1"  // Auto-transcribe user audio
      }
    });

    console.log(`✅ Realtime session created: ${session.id}`);
    return res.json({
      token: session.client_secret,
      sessionId: session.id,
      expiresAt: session.expires_at
    });
  } catch (err) {
    console.error("❌ Error creating realtime session:", err.message);
    return res.status(500).json({ error: "Failed to create session: " + err.message });
  }
});

// Legacy endpoint (kept for compatibility)
app.get("/api/realtime-token", async (req, res) => {
  try {
    // Create a realtime session with OpenAI
    // This returns a client secret token for WebSocket authentication
    const session = await openai.beta.realtime.sessions.create({
      model: REALTIME_MODEL,
      instructions: THERAPIST_PROMPT,
      voice: "alloy",
      modalities: ["text", "audio"],
    });

    console.log("✅ Realtime session created");
    return res.json({ token: session.client_secret });
  } catch (err) {
    console.error("❌ Error creating realtime token:", err);
    return res.status(500).json({ error: "Failed to create realtime token" });
  }
});

// -------- VOICE route: audio -> text -> therapist -> TTS audio --------

app.post("/api/transcribe", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: "No audio file uploaded" });
    }

    const tStart = Date.now();
    console.log('▶ POST /api/transcribe - start');

    // 1) Transcribe audio -> text
    const transcriptionStart = Date.now();
    const transcription = await openai.audio.transcriptions.create({
      file: req.file.buffer,
      filename: req.file.originalname || 'audio.webm',
      model: "whisper-1",
    });
    const transcriptionMs = Date.now() - transcriptionStart;
    console.log(`  └─ Whisper transcription: ${transcriptionMs}ms`);

    const userText = (transcription.text || "").trim();
    if (!userText) {
      return res.status(500).json({ error: "Transcription is empty" });
    }

    // 2) Get therapist reply via streaming Chat API
    const chatStart = Date.now();
    const replyText = await askPsychologist(userText);
    const chatMs = Date.now() - chatStart;
    console.log(`  └─ Chat API: ${chatMs}ms`);

    const tDuration = Date.now() - tStart;
    console.log(`✅ POST /api/transcribe - done (${tDuration}ms: transcribe ${transcriptionMs}ms + chat ${chatMs}ms)`);
    
    return res.json({ 
      userText, 
      replyText, 
      durationMs: tDuration,
      breakdown: { transcriptionMs, chatMs }
    });
  } catch (err) {
    console.error("Error in /api/transcribe:", err);
    return res.status(500).json({ error: "Something went wrong" });
  }
});

// -------- TEXT TO SPEECH route --------

app.post("/api/tts", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "text is required" });
    }

    console.log("🔊 TTS request received, text length:", text.length);
    const sStart = Date.now();

    // Stream TTS for immediate audio playback
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');

    try {
      let totalBytes = 0;
      for await (const chunk of streamTextToSpeech(text)) {
        totalBytes += chunk.length;
        res.write(chunk);
      }
      const sDuration = Date.now() - sStart;
      console.log(`✅ POST /api/tts - streaming done (${sDuration}ms, ${totalBytes} bytes)`);
      res.end();
    } catch (streamErr) {
      console.error("Error during TTS streaming:", streamErr);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed during streaming" });
      } else {
        res.end();
      }
    }
  } catch (err) {
    console.error("❌ Error in /api/tts:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to generate speech" });
    }
  }
});

// ---------------- Start server + WebSocket proxy ----------------

const PORT = process.env.PORT || 3001;

// Create HTTP server so we can attach a WebSocket server to the same port
const server = http.createServer(app);

// WebSocket server that proxies browser connections to OpenAI Realtime
const wss = new WebSocketServer({ server, path: "/realtime" });

wss.on("connection", (clientWs, req) => {
  console.log("Incoming browser WebSocket connection for /realtime", req.socket.remoteAddress);

  // Create a backend connection to OpenAI with Authorization header
  const backendWs = new WebSocket(REALTIME_URL, {
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "OpenAI-Beta": "realtime=v1",
    },
  });

  backendWs.on("open", () => {
    console.log("Proxy: connected to OpenAI realtime (backend open)");
  });

  backendWs.on("message", (data) => {
    try {
      // Try to parse JSON for nicer logging
      try {
        const parsed = JSON.parse(data.toString());
        console.log('Proxy <- OpenAI:', parsed.type || '[no-type]', parsed.event_id || '');
      } catch (e) {
        console.log('Proxy <- OpenAI: (non-json) len=', data?.length || data.toString().length);
      }
      clientWs.send(data);
    } catch (err) {
      console.error("Proxy forward to client failed:", err);
    }
  });

  backendWs.on("error", (err) => {
    console.error("Backend WS error (OpenAI):", err);
    try {
      clientWs.send(JSON.stringify({ type: "error", error: { message: "Backend connection error" } }));
    } catch (e) {
      // ignore
    }
  });

  backendWs.on("close", (code, reason) => {
    console.log("Backend WS closed", code, reason?.toString?.());
    try {
      clientWs.close();
    } catch (e) {}
  });

  clientWs.on("message", (msg) => {
    // Forward client messages to OpenAI
    try {
      const asStr = msg.toString();
      try {
        const parsed = JSON.parse(asStr);
        console.log('Proxy -> OpenAI:', parsed.type || '[no-type]');
      } catch (e) {
        console.log('Proxy -> OpenAI: (non-json) len=', asStr.length);
      }
    } catch (e) {}

    if (backendWs.readyState === WebSocket.OPEN) {
      backendWs.send(msg);
    } else {
      console.warn('Backend WS not open yet, dropping client message');
    }
  });

  clientWs.on("close", () => {
    try {
      backendWs.close();
    } catch (e) {}
  });

  clientWs.on("error", (err) => {
    console.error("Client WS error:", err);
    try {
      backendWs.close();
    } catch (e) {}
  });
});

server.listen(PORT, () => {
  console.log(`✅ Server listening on http://localhost:${PORT}`);
  console.log(`✅ WebSocket proxy available at ws://localhost:${PORT}/realtime`);
});

// Global error handlers
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});
