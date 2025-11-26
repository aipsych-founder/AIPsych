import React, { useState } from "react";
import ChatMessages from "./ChatMessages"; // uses your existing component
// MicButton is not wired yet, but keeping import if you want a mic later
// import MicButton from "./MicButton";

export default function PsychChat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // helper to add a message with an id
  const addMessage = (role, text) => {
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now() + Math.random(),
        role, // "user" or "assistant"
        text,
      },
    ]);
  };

  async function handleSend() {
    const userText = input.trim();
    if (!userText) return;

    // show user message immediately
    addMessage("user", userText);
    setInput("");
    setLoading(true);

    try {
      // thanks to Vite proxy, /api -> http://localhost:3001
      const res = await fetch("/api/psych", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userText }),
      });

      const data = await res.json();
      const reply = data.reply || "Sorry, something went wrong.";
      addMessage("assistant", reply);
    } catch (err) {
      console.error(err);
      addMessage("assistant", "Error talking to the server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-slate-800/90 p-6 rounded-2xl shadow-2xl w-full max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4 text-center">
        AI Psychologist
      </h1>

      {/* messages */}
      <ChatMessages messages={messages} />

      {/* input row */}
      <div className="mt-4 flex gap-2">
        <input
          className="flex-1 px-3 py-2 rounded-lg bg-slate-700 text-white outline-none"
          placeholder="Type how you feel..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !loading) handleSend();
          }}
        />

        <button
          onClick={handleSend}
          disabled={loading}
          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg text-white disabled:opacity-60"
        >
          {loading ? "..." : "Send"}
        </button>
      </div>
    </div>
  );
}
