import React, { useState } from "react";
import ChatMessages from "./ChatMessages"; // you already have this
import MicButton from "./MicButton"; // optional, not wired yet

export default function PsychChat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // function to add messages with id
  const addMessage = (role, text) => {
    setMessages(prev => [
      ...prev,
      {
        id: Date.now() + Math.random(),
        role,
        text
      }
    ]);
  };

  async function handleSend() {
    if (!input.trim()) return;

    const userText = input.trim();
    addMessage("user", userText);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/psych", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userText }),
      });

      const data = await res.json();
      addMessage("assistant", data.reply || "Something went wrong");
    } catch (err) {
      addMessage("assistant", "Error talking to server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-slate-800 p-6 rounded-2xl shadow-xl max-w-2xl mx-auto mt-10">
      <h1 className="text-2xl font-semibold text-white mb-4 text-center">AI Psychologist</h1>

      {/* Message display */}
      <ChatMessages messages={messages} />

      {/* Input */}
      <div className="mt-4 flex gap-2">
        <input
          className="flex-1 px-3 py-2 rounded-lg bg-slate-700 text-white"
          placeholder="Type your feelings..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
        />

        <button
          onClick={handleSend}
          disabled={loading}
          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg text-white"
        >
          {loading ? "..." : "Send"}
        </button>
      </div>
    </div>
  );
}
