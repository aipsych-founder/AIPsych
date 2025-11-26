// PSych/ui/src/components/VoiceChat.jsx
import React, { useRef, useState } from "react";

export default function VoiceChat() {
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  const [messages, setMessages] = useState([]);
  const [recording, setRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // --- Helpers for playing base64 audio ---

  const base64ToBlob = (base64, mime) => {
    const byteChars = atob(base64);
    const byteNumbers = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
      byteNumbers[i] = byteChars.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mime });
  };

  const playAudioBase64 = async (base64) => {
    try {
      setError("");
      const blob = base64ToBlob(base64, "audio/mpeg");
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);

      await audio.play();
    } catch (err) {
      console.error("Audio play error:", err);
      setError(
        "Audio reply was generated but the browser blocked playback. Click on the page once and try again."
      );
    }
  };

  // --- Recording ---

  const startRecording = async () => {
    try {
      setError("");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const mr = new MediaRecorder(stream, {
        mimeType: "audio/webm",
      });

      mediaRecorderRef.current = mr;
      chunksRef.current = [];

      mr.ondataavailable = (e) => {
        chunksRef.current.push(e.data);
      };

      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        sendAudio();
      };

      mr.start();
      setRecording(true);
    } catch (err) {
      console.error(err);
      setError("Could not access microphone. Please check permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  // --- Send audio to backend ---

  const sendAudio = async () => {
    try {
      setLoading(true);
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      const formData = new FormData();
      formData.append("audio", blob, "audio.webm");

      const res = await fetch("http://localhost:3001/api/transcribe", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Request failed");
      }

      const data = await res.json();

      const userText = data.userText || "";
      const replyText = data.replyText || "";
      const audioBase64 = data.audioBase64;

      if (!userText && !replyText) {
        setError("No text received from server.");
      }

      setMessages((prev) => [
        ...prev,
        ...(userText ? [{ sender: "You", text: userText }] : []),
        ...(replyText ? [{ sender: "AI", text: replyText }] : []),
      ]);

      if (audioBase64) {
        await playAudioBase64(audioBase64);
      } else {
        console.warn("No audioBase64 in response – text only.");
      }
    } catch (err) {
      console.error(err);
      setError("Something went wrong talking to the server.");
    } finally {
      setLoading(false);
    }
  };

  // --- UI ---

  return (
    <div className="bg-slate-800/90 p-6 rounded-2xl shadow-2xl w-full max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4 text-center">Voice Chat</h1>

      <div className="h-[60vh] min-h-[320px] bg-slate-900/70 rounded-xl p-4 overflow-y-auto space-y-3 border border-slate-700">
        {messages.length === 0 && (
          <p className="text-slate-400 text-center mt-10">
            Hold the button below, speak in English or Malayalam, and release to
            see the transcription and AI response here.
          </p>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${
              m.sender === "You" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                m.sender === "You"
                  ? "bg-blue-500 text-white rounded-br-sm"
                  : "bg-slate-700 text-slate-50 rounded-bl-sm"
              }`}
            >
              <div className="text-[11px] uppercase tracking-wide opacity-70 mb-1">
                {m.sender}
              </div>
              <div>{m.text}</div>
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div className="mt-3 text-sm text-red-400 text-center">{error}</div>
      )}

      <button
        className={`mt-5 w-full py-3 rounded-2xl font-semibold text-lg transition 
        ${recording ? "bg-red-500" : "bg-blue-500 hover:bg-blue-600"}
        ${loading ? "opacity-70 cursor-wait" : ""}`}
        onMouseDown={startRecording}
        onMouseUp={stopRecording}
        onMouseLeave={recording ? stopRecording : undefined}
        onTouchStart={startRecording}
        onTouchEnd={stopRecording}
        disabled={loading}
      >
        {loading
          ? "Thinking..."
          : recording
          ? "Release to Send"
          : "Hold to Talk"}
      </button>
    </div>
  );
}
