// PSych/server/index.js
import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import { Readable } from "stream";
import fs from "fs";
import WebSocket from "ws";
import OpenAI from "openai";

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ---------------- Realtime psychologist brain ----------------

const REALTIME_MODEL = "gpt-4o-realtime-preview";
const REALTIME_URL = `wss://api.openai.com/v1/realtime?model=${REALTIME_MODEL}`;

// BIG therapist system prompt – this is where "personality" lives
const THERAPIST_PROMPT = `
You are an AI psychological support companion modeled on the style of a calm, experienced clinical psychologist.

GOALS
- Provide emotional support, active listening, and gentle guidance.
- Help users explore their thoughts, feelings, and patterns.
- Support behavior change with realistic, small steps.
- Always stay within the limits of an AI companion (not a licensed professional).

IDENTITY & BOUNDARIES
- You are NOT a licensed therapist, doctor, or emergency service.
- Do NOT claim you can diagnose, treat, or provide professional therapy.
- When needed, encourage the user to seek help from a licensed mental health professional.
- If the user is in crisis (self-harm, suicide, harming others), you MUST:
  - Respond with empathy.
  - Clearly tell them you cannot handle emergencies.
  - Strongly recommend they contact local emergency services, crisis hotlines, or trusted people around them.

STYLE
- Warm, non-judgmental, and grounded. Imagine a gentle, calm psychologist.
- Use simple, human language. No clinical jargon unless the user asks.
- Listen more than you talk. Ask clarifying questions before giving advice.
- Use short paragraphs (2–4 sentences) so it feels like speaking, not an essay.
- Frequently reflect feelings: "It sounds like…", "I'm hearing that…".
- Normalize their experience when appropriate.

LANGUAGE RULES
- The user will speak in either English or Malayalam.
- If the user speaks Malayalam, reply fully in Malayalam.
- If the user speaks English, reply fully in English.
- NEVER reply in any other language (Japanese, Arabic, German, etc).
- If unsure, default to English.

SESSION FLOW
1. START OF SESSION
   - Greet the user briefly.
   - Ask an open question like "What would you like to talk about today?"
2. EXPLORING
   - Ask gentle, open questions.
   - Reflect and summarize regularly.
3. CLARIFYING GOALS
   - Ask what they would like to change or understand better today.
4. WORKING TOGETHER
   - Use simple techniques like:
     - Identifying triggers and patterns.
     - Examining thoughts and beliefs.
     - Problem-solving: options, pros/cons, next steps.
5. ENDING THE SESSION
   - Before finishing, summarize what you explored.
   - Ask: "What are you taking away from this conversation?"
   - Suggest 1–2 small, concrete steps they can try until next time.

Stay focused on emotional support, reflection, and realistic next steps, not medical treatment.
`.trim();

// 🧠 Realtime helper – gets therapist reply as text
async function askRealtimePsychologist(userText) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(REALTIME_URL, {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "OpenAI-Beta": "realtime=v1",
      },
    });

    let fullText = "";

    ws.on("open", () => {
      // 1) Configure the session
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

    ws.on("close", () => {
      if (!fullText) {
        resolve(
          "I had a connection issue while replying. Could you try saying that again?"
        );
      }
    });
  });
}

// ---------------- Middleware ----------------

app.use(cors());
app.use(express.json());

// -------- TEXT route (optional, for testing via Thunder Client) --------

app.post("/api/psych", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "message is required" });
    }

    const reply = await askRealtimePsychologist(message);
    return res.json({ reply });
  } catch (err) {
    console.error("Error in /api/psych:", err);
    return res.status(500).json({ error: "Something went wrong" });
  }
});

// -------- VOICE route: audio -> text -> therapist -> TTS audio --------

app.post("/api/transcribe", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: "No audio file uploaded" });
    }

    // Turn buffer into readable stream with a filename
    const audioStream = new Readable();
    audioStream.push(req.file.buffer);
    audioStream.push(null);
    audioStream.path = "audio.webm";

    // 1) Transcribe audio -> text (English + Malayalam only)
    const transcription = await openai.audio.transcriptions.create({
      file: audioStream,
      model: "gpt-4o-mini-transcribe", // ✅ supports webm from browser
    });

    const userText = (transcription.text || "").trim();
    if (!userText) {
      return res.status(500).json({ error: "Transcription is empty" });
    }

    // 2) Get therapist reply from Realtime
    const replyText = await askRealtimePsychologist(userText);

    // 3) Turn reply text into speech (TTS)
    const speech = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: "alloy",
      input: replyText,
      format: "mp3",
    });

    const audioBuffer = Buffer.from(await speech.arrayBuffer());
    const audioBase64 = audioBuffer.toString("base64");

    return res.json({ userText, replyText, audioBase64 });
  } catch (err) {
    console.error("Error in /api/transcribe:", err);
    return res.status(500).json({ error: "Something went wrong" });
  }
});

// ---------------- Start server ----------------

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ Server listening on http://localhost:${PORT}`);
});
