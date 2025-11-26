import WebSocket from "ws";
import dotenv from "dotenv";

dotenv.config();

const API_KEY = process.env.OPENAI_API_KEY;
const MODEL = "gpt-realtime"; // or gpt-realtime-mini

// 1. Open a WebSocket to Realtime API
const ws = new WebSocket(
  `wss://api.openai.com/v1/realtime?model=${MODEL}`,
  {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "OpenAI-Beta": "realtime=v1", // required for some Realtime setups; if you get errors, try removing this
    },
  }
);

ws.on("open", () => {
  console.log("✅ Connected to Realtime API");

  // 2. Update session: text only for now
  ws.send(JSON.stringify({
    type: "session.update",
    session: {
      modalities: ["text"],         // we'll switch to ["audio", "text"] later
      instructions:
        "You are an empathetic AI psychologist. Listen carefully and reply in a calm, warm, human way.",
    },
  }));

  // 3. Send a test user message (like your real users will)
  ws.send(JSON.stringify({
    type: "conversation.item.create",
    item: {
      type: "message",
      role: "user",
      content: [
        {
          type: "input_text",
          text: "Help me design a 30-day plan to reduce my phone addiction.",
        },
      ],
    },
  }));

  // 4. Ask model to respond
  ws.send(JSON.stringify({
    type: "response.create",
    response: {
      modalities: ["text"],
    },
  }));
});

// 5. Handle incoming events (streaming text)
ws.on("message", (raw) => {
  const msg = JSON.parse(raw.toString());

  if (msg.type === "response.text.delta") {
    // partial text chunks
    process.stdout.write(msg.delta);
  }

  if (msg.type === "response.text.done") {
    process.stdout.write("\n\n--- response finished ---\n");
  }

  // You’ll also see other events like session.created, etc.
});

ws.on("error", (err) => {
  console.error("❌ WebSocket error:", err);
});

ws.on("close", () => {
  console.log("🔌 Connection closed");
});
