import { useState, useRef, useEffect } from 'react';
import { VoiceOrb } from './components/VoiceOrb';
import { ChatMessage } from './components/ChatMessage';
import { Settings, Volume2 } from 'lucide-react';
import {
  startAudioRecording,
  stopAudioRecording,
  sendTextMessage,
  initPsychWebSocket,
} from './utils/audioUtils';

type Message = {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: Date;
};

type OrbState = 'idle' | 'listening' | 'speaking';

const API_PORT = import.meta.env.VITE_API_PORT || '3001';

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: "Hello, I'm AIPsych. I'm here to listen and support you.",
      sender: 'ai',
      timestamp: new Date(),
    },
  ]);

  const [inputText, setInputText] = useState('');
  const [orbState, setOrbState] = useState<OrbState>('idle');
  const [isProcessing, setIsProcessing] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const currentAIMessageRef = useRef<string>('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);

  /* =====================================================
     🔌 INIT WEBSOCKET ONCE
  ===================================================== */

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    // Initialize WebSocket with callback
    initPsychWebSocket((aiChunk, isComplete = false) => {
      setMessages(prev => {
        // Create shallow copy of messages array
        const messagesCopy = [...prev];
        const lastMsg = messagesCopy[messagesCopy.length - 1];
        
        if (lastMsg?.sender === 'ai') {
          if (isComplete) {
            // Replace the last message's text entirely
            messagesCopy[messagesCopy.length - 1] = {
              ...lastMsg,
              text: aiChunk
            };
          } else {
            // Append the new chunk to existing text
            messagesCopy[messagesCopy.length - 1] = {
              ...lastMsg,
              text: lastMsg.text + aiChunk
            };
          }
        }
        
        return messagesCopy;
      });
    });

    // Cleanup function
    return () => {
      // WebSocket cleanup is handled in audioUtils
    };
  }, []); // Empty dependency array - only run once


  /* =====================================================
     📨 TEXT SEND
  ===================================================== */

  const handleSendText = () => {
    if (!inputText.trim() || isProcessing) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputText,
      sender: 'user',
      timestamp: new Date(),
    };

    const aiPlaceholder: Message = {
      id: (Date.now() + 1).toString(),
      text: '',
      sender: 'ai',
      timestamp: new Date(),
    };

    // Add both messages at once to prevent flickering
    setMessages(prev => [...prev, userMessage, aiPlaceholder]);
    setInputText('');
    setIsProcessing(true);
    currentAIMessageRef.current = '';

    // Send message via WebSocket
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ text: userMessage.text }));
    } else {
      // Use audioUtils sendTextMessage function
      sendTextMessage(userMessage.text);
    }
    
    setIsProcessing(false);
  };

  /* =====================================================
     🎧 VOICE (LEFT MINIMAL)
  ===================================================== */

  const handleVoicePress = async () => {
    if (orbState === 'idle') {
      setOrbState('listening');
      const recorder = await startAudioRecording();
      mediaRecorderRef.current = recorder.mediaRecorder;
      recorder.mediaRecorder.start();
    } else {
      if (mediaRecorderRef.current) {
        await stopAudioRecording(mediaRecorderRef.current);
        mediaRecorderRef.current = null;
        setOrbState('idle');
      }
    }
  };

  /* =====================================================
     🖥️ UI
  ===================================================== */

  return (
    <div className="relative h-screen w-full flex flex-col bg-gradient-to-br from-blue-100 via-purple-50 to-green-50">
      <header className="flex items-center justify-between px-6 pt-10 pb-4">
        <Settings className="w-5 h-5 text-purple-600/70" />
        <h1 className="text-purple-700/90">AIPsych</h1>
        <Volume2 className="w-5 h-5 text-purple-600/70" />
      </header>

      <div ref={chatContainerRef} className="flex-1 overflow-y-auto px-4">
        {messages.map((m) => (
          <ChatMessage key={m.id} message={m} />
        ))}
      </div>

      <div className="px-6 pb-6">
        <input
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
          placeholder="Type here…"
          className="w-full px-4 py-3 rounded-full"
        />

        <div className="mt-4">
          <VoiceOrb state={orbState} onPress={handleVoicePress} />
        </div>
      </div>
    </div>
  );
}
