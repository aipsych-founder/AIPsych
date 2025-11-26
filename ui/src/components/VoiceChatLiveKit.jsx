// src/components/VoiceChatLiveKit.jsx
import React, { useEffect, useRef, useState } from "react";
import { Room, createLocalTracks, Track } from "livekit-client";

/**
 * VoiceChatLiveKit
 *
 * - Requests a token from your token server (POST /token)
 * - Connects to LiveKit via Room.connect(wsUrl, token)
 * - Creates & publishes a local microphone audio track
 * - Subscribes to remote participants' audio and plays it
 *
 * Usage: <VoiceChatLiveKit />
 */

export default function VoiceChatLiveKit() {
  const [room, setRoom] = useState(null);
  const [identity, setIdentity] = useState("");
  const [roomName, setRoomName] = useState("default-room");
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [participants, setParticipants] = useState([]);

  const audioContainerRef = useRef(null);
  const localTracksRef = useRef([]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupRoom();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cleanupRoom = () => {
    try {
      if (room) {
        room.disconnect();
      }
    } catch (e) {
      console.warn("Error disconnecting room:", e);
    }

    // Stop local tracks
    if (localTracksRef.current) {
      localTracksRef.current.forEach((t) => {
        try {
          t.stop();
        } catch (e) {
          console.warn("Error stopping local track:", e);
        }
      });
    }
    localTracksRef.current = [];

    // Remove any audio elements we created
    if (audioContainerRef.current) {
      audioContainerRef.current.innerHTML = "";
    }

    setConnected(false);
    setParticipants([]);
  };

  const attachRemoteTrack = (track, participant) => {
    if (!audioContainerRef.current) return;

    if (track.kind !== Track.Kind.Audio) return;

    const audioElem = document.createElement("audio");
    audioElem.autoplay = true;
    audioElem.controls = true;
    audioElem.dataset.participantSid = participant.sid;
    audioElem.dataset.trackSid = track.sid;

    const mediaStream = new MediaStream();
    mediaStream.addTrack(track.mediaStreamTrack);
    audioElem.srcObject = mediaStream;

    audioContainerRef.current.appendChild(audioElem);
  };

  const detachRemoteTrack = (track) => {
    if (!audioContainerRef.current) return;

    const children = Array.from(audioContainerRef.current.children);
    children.forEach((el) => {
      if (el.dataset.trackSid === track.sid) {
        el.srcObject = null;
        el.remove();
      }
    });
  };

  const refreshParticipants = (livekitRoom) => {
    const list = [];

    livekitRoom.participants.forEach((p) => {
      list.push({
        sid: p.sid,
        identity: p.identity,
      });
    });

    if (livekitRoom.localParticipant) {
      list.unshift({
        sid: livekitRoom.localParticipant.sid,
        identity: `${livekitRoom.localParticipant.identity} (You)`,
      });
    }

    setParticipants(list);
  };

  const handleJoin = async () => {
    setError("");
    setConnecting(true);

    try {
      const finalIdentity =
        identity.trim() || `user-${Math.floor(Math.random() * 100000)}`;

      // Ask your token server (proxied via Vite: /token -> http://localhost:3002/token)
      const res = await fetch("/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          room: roomName || "default-room",
          identity: finalIdentity,
        }),
      });

      if (!res.ok) {
        throw new Error(`Token server error: ${res.status}`);
      }

      const { token, wsUrl } = await res.json();
      if (!token || !wsUrl) {
        throw new Error("Invalid token server response");
      }

      // Create Room instance
      const newRoom = new Room();

      // Register event handlers BEFORE connecting
      newRoom
        .on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
          attachRemoteTrack(track, participant);
          refreshParticipants(newRoom);
        })
        .on(RoomEvent.TrackUnsubscribed, (track) => {
          detachRemoteTrack(track);
          refreshParticipants(newRoom);
        })
        .on(RoomEvent.ParticipantConnected, () => {
          refreshParticipants(newRoom);
        })
        .on(RoomEvent.ParticipantDisconnected, () => {
          refreshParticipants(newRoom);
        })
        .on(RoomEvent.Disconnected, () => {
          setConnected(false);
          refreshParticipants(newRoom);
        });

      // Connect to the room
      await newRoom.connect(wsUrl, token);

      // Create and publish local audio track from mic
      const localTracks = await createLocalTracks({
        audio: true,
        video: false,
      });

      localTracksRef.current = localTracks;

      for (const track of localTracks) {
        await newRoom.localParticipant.publishTrack(track);
      }

      // Save room + state
      setRoom(newRoom);
      setIdentity(finalIdentity);
      refreshParticipants(newRoom);
      setConnected(true);
    } catch (err) {
      console.error("Error joining room:", err);
      setError(err.message || "Failed to join LiveKit room");
      cleanupRoom();
    } finally {
      setConnecting(false);
    }
  };

  const handleLeave = () => {
    cleanupRoom();
  };

  // Some LiveKit events are imported from livekit-client; we alias them here
  // to avoid having to import each one in the header.
  const RoomEvent = Room.EventTypes || {
    TrackSubscribed: "trackSubscribed",
    TrackUnsubscribed: "trackUnsubscribed",
    ParticipantConnected: "participantConnected",
    ParticipantDisconnected: "participantDisconnected",
    Disconnected: "disconnected",
  };

  return (
    <div className="bg-slate-800 p-6 rounded-xl shadow-xl">
      <h1 className="text-xl font-bold mb-2">LiveKit Voice Chat</h1>
      <p className="text-slate-300 mb-4 text-sm">
        Join a LiveKit room, publish your microphone, and listen to others in
        real-time.
      </p>

      {/* Room controls */}
      <div className="flex flex-col gap-2 mb-4">
        <label className="text-sm text-slate-300">
          Room name
          <input
            type="text"
            className="w-full mt-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            placeholder="default-room"
          />
        </label>

        <label className="text-sm text-slate-300">
          Your identity
          <input
            type="text"
            className="w-full mt-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm"
            value={identity}
            onChange={(e) => setIdentity(e.target.value)}
            placeholder="(optional, will auto-generate)"
          />
        </label>
      </div>

      {error && (
        <div className="mb-3 text-sm text-red-400 bg-red-950/40 px-3 py-2 rounded-lg">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={handleJoin}
          disabled={connecting || connected}
          className={`px-4 py-2 rounded-lg text-sm font-semibold ${
            connected
              ? "bg-green-600/60 cursor-not-allowed"
              : connecting
              ? "bg-blue-600/60 cursor-wait"
              : "bg-blue-600 hover:bg-blue-500"
          }`}
        >
          {connected
            ? "Connected"
            : connecting
            ? "Connecting..."
            : "Join Room"}
        </button>

        <button
          onClick={handleLeave}
          disabled={!connected}
          className={`px-4 py-2 rounded-lg text-sm font-semibold ${
            connected
              ? "bg-red-600 hover:bg-red-500"
              : "bg-slate-600/60 cursor-not-allowed"
          }`}
        >
          Leave
        </button>
      </div>

      <div className="text-xs text-slate-400 mb-4">
        Status:{" "}
        <span className="font-semibold text-white">
          {connected ? "Connected" : connecting ? "Connecting..." : "Idle"}
        </span>
      </div>

      {/* Participants list */}
      <div className="mb-4">
        <div className="text-sm font-semibold mb-1 text-slate-200">
          Participants
        </div>
        {participants.length === 0 ? (
          <div className="text-xs text-slate-500">
            No one in the room yet. Join to create the room.
          </div>
        ) : (
          <ul className="text-xs text-slate-300 space-y-1">
            {participants.map((p) => (
              <li key={p.sid}>• {p.identity}</li>
            ))}
          </ul>
        )}
      </div>

      {/* Remote audio elements */}
      <div className="mt-4">
        <div className="text-sm font-semibold mb-1 text-slate-200">
          Remote audio
        </div>
        <div
          ref={audioContainerRef}
          className="space-y-2 text-xs text-slate-400"
        >
          {/* Audio elements will be appended here dynamically */}
          {participants.length === 0 && (
            <div className="text-xs text-slate-500">
              When remote participants speak, their audio elements will appear
              here.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
