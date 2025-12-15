import { useState, useRef, useEffect } from 'react';
import { VoiceOrb } from './components/VoiceOrb';
import { ChatMessage } from './components/ChatMessage';
import { Settings, Volume2 } from 'lucide-react';
import {
  startAudioRecording,
  stopAudioRecording,
  sendTextMessage,
  transcribeAndRespond,
} from './utils/audioUtils';

type Message = {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: Date;
};

type OrbState = 'idle' | 'listening' | 'speaking';

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: "Hello, I'm AIPsych. I'm here to listen and support you. How are you feeling today?",
      sender: 'ai',
      timestamp: new Date(),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [orbState, setOrbState] = useState<OrbState>('idle');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (chatContainerRef.current) {
      setTimeout(() => {
        chatContainerRef.current?.scrollTo({
          top: chatContainerRef.current.scrollHeight,
          behavior: 'smooth',
        });
      }, 0);
    }
  }, [messages]);

  const handleVoicePress = async () => {
    if (orbState === 'idle' && !isProcessing) {
      try {
        setOrbState('listening');
        setIsProcessing(true);
        const recorder = await startAudioRecording();
        mediaRecorderRef.current = recorder.mediaRecorder;
        audioContextRef.current = recorder.audioContext;
        audioProcessorRef.current = recorder.audioProcessor;
        recorder.mediaRecorder.start();
      } catch (err) {
        console.error('Failed to start recording:', err);
        setOrbState('idle');
        setIsProcessing(false);
      }
    } else if (orbState === 'listening') {
      // Stop recording and transcribe
      if (mediaRecorderRef.current) {
        const audioBlob = await stopAudioRecording(mediaRecorderRef.current);
        mediaRecorderRef.current = null;

        try {
          setOrbState('speaking');

          // Add AI message placeholder immediately
          const aiMessage: Message = {
            id: (Date.now() + 1).toString(),
            text: '',
            sender: 'ai',
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, aiMessage]);

          // Fetch transcription + AI reply from /api/transcribe
          const result = await transcribeAndRespond(audioBlob);

          // Update the AI message with the reply
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              id: (Date.now() + 1).toString(),
              text: result.replyText,
              sender: 'ai',
              timestamp: new Date(),
            };
            return updated;
          });

          // Audio playback is handled by `transcribeAndRespond` (server TTS)

          setOrbState('idle');
          setIsProcessing(false);
        } catch (err) {
          console.error('Failed to process voice:', err);
          setOrbState('idle');
          setIsProcessing(false);
        }
      }
    }
  };

  const handleEnableVoice = async () => {
    // Play a silent sound to unlock autoplay
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      gain.gain.setValueAtTime(0, audioContext.currentTime); // Silent
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.1);
      await audioContext.close();
    } catch (e) {
      // ignore
    }
    setVoiceEnabled(true);
  };

  const handleSendText = async () => {
    if (!inputText.trim() || isProcessing) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputText,
      sender: 'user',
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    const messageText = inputText;
    setInputText('');
    setIsProcessing(true);

    try {
      // Add AI message placeholder immediately
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: '',
        sender: 'ai',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMessage]);

      // Fetch AI reply from /api/psych
      const result = await sendTextMessage(messageText);

      // Update the AI message with the reply
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          id: (Date.now() + 1).toString(),
          text: result.reply,
          sender: 'ai',
          timestamp: new Date(),
        };
        return updated;
      });

      // Audio playback is handled by `sendTextMessage` (server TTS)

      setIsProcessing(false);
    } catch (err) {
      console.error('Failed to send text:', err);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: "I apologize, I had trouble processing your message. Could you try again?",
        sender: 'ai',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
      setIsProcessing(false);
    }
  };

  return (
    <div className="relative h-screen w-full overflow-hidden flex flex-col bg-gradient-to-br from-blue-100 via-purple-50 to-green-50">
      {/* Animated gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-200/30 via-lavender-100/20 to-emerald-100/30 animate-gradient-shift" />
      
      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 pt-12 pb-4 flex-shrink-0">
        <button className="p-2 rounded-full bg-white/20 backdrop-blur-md hover:bg-white/30 transition-colors">
          <Settings className="w-5 h-5 text-purple-600/70" />
        </button>
        
        <div className="flex flex-col items-center">
          <h1 className="text-purple-700/90">AIPsych</h1>
          <p className="text-sm text-purple-600/60">Your mindful AI companion</p>
        </div>
        
        {!voiceEnabled && (
          <button
            onClick={handleEnableVoice}
            className="p-2 rounded-full bg-gradient-to-r from-purple-300/40 to-blue-300/40 backdrop-blur-md hover:from-purple-300/60 hover:to-blue-300/60 transition-colors flex items-center gap-1 text-xs text-purple-700"
            title="Enable voice output"
          >
            <Volume2 className="w-4 h-4" />
            <span className="hidden sm:inline">Enable Voice</span>
          </button>
        )}
      </header>

      {/* Chat area - scrollable and flexible */}
      <div 
        ref={chatContainerRef}
        className="relative z-10 px-4 overflow-y-auto flex-1" 
      >
        <div className="space-y-3 pb-8">
          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))}
        </div>
      </div>

      {/* Bottom section - Input + Orb */}
      <div className="relative z-20 flex-shrink-0 px-6 pb-8">
        {/* Text input - above orb */}
        <div className="mb-4">
          <div className="relative flex items-center gap-2 px-4 py-3 rounded-full bg-white/25 backdrop-blur-md border border-white/30 shadow-lg">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendText()}
              placeholder="Type if you prefer…"
              disabled={isProcessing}
              className="flex-1 bg-transparent outline-none text-purple-900/70 placeholder:text-purple-400/40 disabled:opacity-50"
            />
            {inputText && (
              <button
                onClick={handleSendText}
                disabled={isProcessing}
                className="px-4 py-1.5 rounded-full bg-gradient-to-r from-purple-400/30 to-blue-400/30 backdrop-blur-sm text-purple-700 hover:from-purple-400/40 hover:to-blue-400/40 transition-all disabled:opacity-50"
              >
                Send
              </button>
            )}
          </div>
        </div>

        {/* Voice Orb - dominant element */}
        <VoiceOrb state={orbState} onPress={handleVoicePress} />
      </div>

      {/* Background gradient animation */}
      <style>{`
        @keyframes gradient-shift {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 0.8; }
        }
        .animate-gradient-shift {
          animation: gradient-shift 8s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
