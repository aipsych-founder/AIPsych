import React from "react";
import ReactDOM from "react-dom/client";
import VoiceChat from "./VoiceChat";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <VoiceChat tokenServerUrl="http://localhost:8000/token" room="test-room" />
  </React.StrictMode>
);
