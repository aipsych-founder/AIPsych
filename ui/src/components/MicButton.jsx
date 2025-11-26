import React from "react";

export default function MicButton({ recording, onStart, onStop }) {
  return (
    <button
      onMouseDown={onStart}
      onMouseUp={onStop}
      onTouchStart={onStart}
      onTouchEnd={onStop}
      className={`px-4 py-2 rounded-md shadow-lg text-white transition ${
        recording ? "bg-red-500" : "bg-rose-500 hover:bg-rose-600"
      }`}
    >
      {recording ? "Recording..." : "Hold to talk 🎤"}
    </button>
  );
}
