import WebSocket from "ws";
import dotenv from "dotenv";

dotenv.config();

const API_KEY = process.env.OPENAI_API_KEY;
const MODEL = "gpt-realtime"; // or "gpt-realtime-mini"

// This function talks to Realtime and returns the reply as text
export async function askRealtimePsychologist(userText) {
  return new Promise((resolve, reject) => {
    let fullResponse = "";

    // 1) Open a WebSocket connection to Realtime API
    const ws = new WebSocket(
      `wss://api.openai.com/v1/realtime?model=${MODEL}`,
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "OpenAI-Beta": "realtime=v1",
        },
      }
    );

    // When the connection is opened
    ws.on("open", () => {
      // 2) Configure the session: how the AI should behave
      ws.send(
        JSON.stringify({
          type: "session.update",
          session: {
            modalities: ["text"], // we start with text only
            instructions:
              "You are an empathetic AI psychologist. Listen carefully and reply in a calm, warm, human way. Ask gentle questions and avoid sounding robotic.",
          },
        })
      );

      // 3) Send the user's message
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

      // 4) Ask the model to respond
      ws.send(
        JSON.stringify({
          type: "response.create",
          response: {
            modalities: ["text"],
          },
        })
      );
    });

    // When messages come back from Realtime
    ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString());

      // "response.text.delta" = partial pieces of the reply
      if (msg.type === "response.text.delta") {
        fullResponse += msg.delta;
      }

      // "response.text.done" = reply is finished
      if (msg.type === "response.text.done") {
        ws.close(); // close the connection
        resolve(fullResponse.trim()); // send the full reply back
      }
    });

    ws.on("error", (err) => {
      console.error("Realtime WebSocket error:", err);
      reject(err);
    });

    ws.on("close", () => {
      // console.log("Realtime connection closed");
    });
  });
}
