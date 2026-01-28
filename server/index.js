import "dotenv/config";
import express from "express";
import cors from "cors";
import compression from "compression";
import { WebSocketServer } from "ws";
import fs from "fs";
import path from "path";

// Ensure fetch is available for Node.js < 18
if (!globalThis.fetch) {
  const { default: fetch } = await import('node-fetch');
  globalThis.fetch = fetch;
}

const app = express();
const PORT = process.env.PORT || 3001;

/* ---------------- Logging ---------------- */

const logFile = path.join(process.cwd(), 'aipsych.log');

function log(message, type = 'INFO') {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${type}: ${message}\n`;
  
  console.log(logEntry.trim());
  fs.appendFile(logFile, logEntry, () => {});
}

/* ---------------- Config ---------------- */

if (!process.env.OPENAI_API_KEY) {
  log("OPENAI_API_KEY environment variable is required", "ERROR");
  process.exit(1);
}

if (!process.env.OPENAI_API_KEY.startsWith('sk-')) {
  log("Invalid OPENAI_API_KEY format. Should start with 'sk-'", "ERROR");
  process.exit(1);
}

log("API Key loaded successfully");

const THERAPIST_PROMPTS = {
  clinical: `
You are AIPsych. Respond immediately with 1-2 sentences.

Core style:
- Start responding instantly
- Keep replies short (1-3 sentences max)
- No greetings, no restating user input
- Simple language, direct answers
- Validate feelings briefly, then respond
- If user speaks Malayalam, reply in Malayalam

Goal: Fast, helpful, human responses.
`.trim()
};

// STEP 1 — NORMALIZE INPUT
function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z\u0D00-\u0D7F\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// STEP 2 — KEYWORD CRISIS FILTER (FAST BASELINE)
const KEYWORD_CRISIS = [
  // English
  "kill myself","suicide","want to die","end my life",
  "no reason to live","self harm","cut myself",

  // Malayalam
  "മരിക്കാൻ തോന്നുന്നു","മരിക്കണം","ആത്മഹത്യ",
  "ജീവിതം അവസാനിപ്പ","ജീവിക്കാൻ താല്പര്യമില്ല",

  // Manglish
  "marikkan thonnunnu","marikkanam","marikkan",
  "jeevitham maduthu","jeevikkan pattunnilla",
  "life maduthu","life mathi","ini mathi"
];

function keywordCrisis(text) {
  const t = normalize(text);
  return KEYWORD_CRISIS.some(k => t.includes(k));
}

// STEP 3 — AI INTENT CLASSIFIER (SAME API KEY)
async function aiCrisisClassifier(text) {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{
          role: "user",
          content: `You are a classifier.\nReply with ONLY one word: CRISIS or SAFE.\n\nCRISIS includes:\n- Desire to die\n- Self-harm intent\n- Feeling life should end\n- Explicit OR implicit suicidal ideation\n\nMessage:\n"${text}"`
        }],
        max_tokens: 5,
        temperature: 0
      })
    });
    
    const data = await response.json();
    return data.choices[0].message.content.trim() === "CRISIS";
  } catch (err) {
    console.error("AI classifier error:", err.message);
    return false; // Fail safe
  }
}

function isMalayalam(text) {
  return /[\u0D00-\u0D7F]/.test(text);
}

// STEP 4 — HARDCODED CRISIS RESPONSES (NO AI)
const CRISIS_REPLY_EN = `
I'm really sorry you're feeling this much pain. I'm glad you said it out loud.

I can't help with emergencies or self-harm, but you deserve immediate, real support.
Please reach out right now to a local crisis helpline, emergency services,
or someone you trust nearby and tell them exactly how you're feeling.

If you're in India:
• AASRA: 91-9820466726 (24/7)
• Tele MANAS: 14416 (free & confidential)
Or go to the nearest emergency room.

You don't have to go through this alone.
`.trim();

const CRISIS_REPLY_ML = `
ഇപ്പോൾ നിനക്ക് ഇത്രയും വേദന അനുഭവിക്കേണ്ടി വരുന്നത് കേട്ട് എനിക്ക് വളരെ ദുഃഖമുണ്ട്.
"മരിക്കാൻ തോന്നുന്നു" എന്ന് പറയുന്നത് നീ വലിയ ബുദ്ധിമുട്ടിലൂടെയാണ് പോകുന്നത് എന്നതാണ് സൂചിപ്പിക്കുന്നത്.

എനിക്ക് അടിയന്തര സാഹചര്യങ്ങളിലോ സ്വയം പരിക്കേൽപ്പിക്കുന്ന കാര്യങ്ങളിലോ സഹായിക്കാനാകില്ല.
എന്നാൽ നിന്റെ സുരക്ഷ വളരെ പ്രധാനമാണ്.
ദയവായി ഇപ്പോൾ തന്നെ ഒരു സഹായ ഹോട്ട്ലൈനെയോ,
അല്ലെങ്കിൽ നീ വിശ്വസിക്കുന്ന ആരെയെങ്കിലും സമീപിച്ച്
നിനക്ക് അനുഭവിക്കുന്നതെല്ലാം അവരോട് തുറന്ന് പറയുക.

ഇന്ത്യയിൽ ആണെങ്കിൽ:
• AASRA: 91-9820466726 (24/7)
• Tele MANAS: 14416 (സൗജന്യവും രഹസ്യവുമാണ്)
അല്ലെങ്കിൽ ഏറ്റവും അടുത്ത അടിയന്തര വിഭാഗത്തിലേക്ക് പോകുക.

നീ ഇതിൽ ഒറ്റക്കല്ല.
`.trim();

// Instant local responses for common inputs
const INSTANT_RESPONSES = {
  'hi': 'Hi there.',
  'hello': 'Hello.',
  'hey': 'Hey.',
  'how are you': 'I\'m here to listen.',
  'thanks': 'You\'re welcome.',
  'thank you': 'You\'re welcome.',
  'ok': 'Okay.',
  'okay': 'Alright.'
};

function getInstantResponse(text) {
  const normalized = text.toLowerCase().trim();
  const response = INSTANT_RESPONSES[normalized];
  if (response) {
    log(`Instant match found: "${normalized}" -> "${response}"`);
    return response;
  }
  return null;
}

// Default fallback response
const DEFAULT_FALLBACK = "I'm here to listen. What's on your mind?";

// Format text with line breaks after sentences
function formatWithLineBreaks(text) {
  try {
    return text
      .replace(/([.!?])\s+/g, '$1\n')
      .replace(/\s+/g, ' ')
      .replace(/\n\s+/g, '\n')
      .trim();
  } catch (err) {
    return text || '';
  }
}

/* ---------------- Middleware ---------------- */

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || [
    'http://localhost:3000',
    'http://localhost:5173', // Vite default port
    `http://localhost:${PORT}` // Dynamic server port
  ],
  credentials: true
}));
app.use(express.json());
app.use(compression());

/* ---------------- Health ---------------- */

app.get("/health", (_, res) => {
  res.json({ status: "ok", service: "AIPsych Realtime" });
});

/* ---------------- REST API Fallback ---------------- */

app.post("/api/psych", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) {
      return res.status(400).json({ error: "Text is required" });
    }

    const userText = text.trim();
    
    // Crisis detection
    const isCrisis = keywordCrisis(userText) || await aiCrisisClassifier(userText);
    
    if (isCrisis) {
      const crisisReply = isMalayalam(userText) ? CRISIS_REPLY_ML : CRISIS_REPLY_EN;
      return res.json({ type: 'crisis', message: formatWithLineBreaks(crisisReply) });
    }
    
    // Instant responses
    const instantReply = getInstantResponse(userText);
    if (instantReply) {
      return res.json({ type: 'response', message: instantReply });
    }
    
    // AI response
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: THERAPIST_PROMPTS.clinical },
            { role: 'user', content: userText }
          ],
          max_tokens: 150,
          temperature: 0.7
        })
      });
      
      const data = await response.json();
      const aiReply = data.choices[0].message.content.trim();
      
      res.json({ type: 'response', message: formatWithLineBreaks(aiReply) });
      
    } catch (err) {
      log(`AI API error: ${err.message}`, 'ERROR');
      res.json({ type: 'response', message: DEFAULT_FALLBACK });
    }
    
  } catch (err) {
    log(`REST API error: ${err.message}`, 'ERROR');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/* ---------------- Server ---------------- */

const server = app.listen(PORT, () => {
  log(`AIPsych server running on port ${PORT}`);
});

/* ---------------- WebSocket Server ---------------- */

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  // Per-connection state isolation
  let currentMode = 'clinical';
  let crisisResponseSent = false;
  let conversationHistory = [];
  
  function addToHistory(role, content) {
    conversationHistory.push({ role, content });
    if (conversationHistory.length > 4) {
      conversationHistory = conversationHistory.slice(-4);
    }
  }
  
  function getCurrentPrompt() {
    return THERAPIST_PROMPTS[currentMode];
  }
  
  function sendResponse(client, type, message) {
    const formattedMessage = formatWithLineBreaks(message);
    client.send(JSON.stringify({ type, message: formattedMessage }));
    log(`Sent ${type}: ${formattedMessage}`);
  }
  
  log('Client connected');
  
  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      
      // Handle different message types
      if (message.type === 'input_audio_buffer.append') {
        // Handle audio input - forward to OpenAI or process locally
        handleAudioInput(ws, message);
        return;
      }
      
      const userText = message.text?.trim();
      if (!userText) return;
      
      // Fast keyword crisis check
      const keywordCrisisDetected = keywordCrisis(userText);
      
      if (keywordCrisisDetected && !crisisResponseSent) {
        const crisisReply = isMalayalam(userText) ? CRISIS_REPLY_ML : CRISIS_REPLY_EN;
        sendResponse(ws, 'crisis', crisisReply);
        crisisResponseSent = true;
        return;
      }
      
      // Instant responses
      const instantReply = getInstantResponse(userText);
      if (instantReply) {
        sendResponse(ws, 'response', instantReply);
        return;
      }
      
      // AI response with parallel crisis detection
      addToHistory('user', userText);
      
      // Start both AI response and crisis detection in parallel
      const aiResponsePromise = fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: getCurrentPrompt() },
            ...conversationHistory
          ],
          max_tokens: 150,
          temperature: 0.7
        })
      });
      
      const crisisCheckPromise = !keywordCrisisDetected ? aiCrisisClassifier(userText) : Promise.resolve(false);
      
      try {
        const [aiResponse, isCrisisAI] = await Promise.all([aiResponsePromise, crisisCheckPromise]);
        
        // Check if AI detected crisis and we haven't sent crisis response yet
        if (isCrisisAI && !crisisResponseSent) {
          const crisisReply = isMalayalam(userText) ? CRISIS_REPLY_ML : CRISIS_REPLY_EN;
          sendResponse(ws, 'crisis', crisisReply);
          crisisResponseSent = true;
          return;
        }
        
        const data = await aiResponse.json();
        const aiReply = data.choices[0].message.content.trim();
        
        addToHistory('assistant', aiReply);
        
        // Send response with audio transcript delta format for compatibility
        sendResponseWithAudio(ws, aiReply);
        
      } catch (err) {
        log(`AI API error: ${err.message}`, 'ERROR');
        sendResponse(ws, 'response', DEFAULT_FALLBACK);
      }
      
    } catch (err) {
      log(`Message processing error: ${err.message}`, 'ERROR');
    }
  });
  
  // Handle audio input processing
  function handleAudioInput(client, message) {
    // For now, acknowledge audio input
    // In a full implementation, this would process audio or forward to OpenAI Realtime API
    log('Audio input received');
  }
  
  // Enhanced response function with audio transcript delta support
  function sendResponseWithAudio(client, text) {
    const formattedMessage = formatWithLineBreaks(text);
    
    // Send as audio transcript delta for compatibility with audioUtils.ts
    const words = formattedMessage.split(' ');
    
    // Send word by word to simulate streaming
    words.forEach((word, index) => {
      setTimeout(() => {
        client.send(JSON.stringify({
          type: 'response.audio_transcript.delta',
          delta: word + (index < words.length - 1 ? ' ' : '')
        }));
        
        // Send done event after last word
        if (index === words.length - 1) {
          setTimeout(() => {
            client.send(JSON.stringify({ type: 'response.done' }));
          }, 50);
        }
      }, index * 100); // 100ms delay between words
    });
    
    // Also send traditional response format
    client.send(JSON.stringify({ type: 'response', message: formattedMessage }));
    log(`Sent response with audio transcript: ${formattedMessage}`);
  }
  
  ws.on('close', () => {
    log('Client disconnected');
  });
});