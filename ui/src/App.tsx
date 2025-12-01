import { useState } from 'react';
import { VoiceOrb } from './components/VoiceOrb';
import { ChatMessage } from './components/ChatMessage';
import { Settings } from 'lucide-react';

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

  const handleVoicePress = () => {
    if (orbState === 'idle') {
      setOrbState('listening');
      // Simulate listening for 3 seconds
      setTimeout(() => {
        const userMessage: Message = {
          id: Date.now().toString(),
          text: "I've been feeling a bit anxious lately...",
          sender: 'user',
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, userMessage]);
        setOrbState('speaking');
        
        // Simulate AI response
        setTimeout(() => {
          const aiMessage: Message = {
            id: (Date.now() + 1).toString(),
            text: "I hear you. Anxiety can feel overwhelming. Would you like to talk about what's been triggering these feelings?",
            sender: 'ai',
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, aiMessage]);
          setOrbState('idle');
        }, 2500);
      }, 3000);
    }
  };

  const handleSendText = () => {
    if (!inputText.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputText,
      sender: 'user',
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInputText('');

    // Simulate AI response
    setOrbState('speaking');
    setTimeout(() => {
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: "Thank you for sharing that with me. Remember, it's okay to feel what you're feeling. Let's work through this together.",
        sender: 'ai',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMessage]);
      setOrbState('idle');
    }, 2000);
  };

  return (
    <div className="relative h-screen w-full overflow-hidden bg-gradient-to-br from-blue-100 via-purple-50 to-green-50">
      {/* Animated gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-200/30 via-lavender-100/20 to-emerald-100/30 animate-gradient-shift" />
      
      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 pt-12 pb-4">
        <button className="p-2 rounded-full bg-white/20 backdrop-blur-md hover:bg-white/30 transition-colors">
          <Settings className="w-5 h-5 text-purple-600/70" />
        </button>
        
        <div className="flex flex-col items-center">
          <h1 className="text-purple-700/90">AIPsych</h1>
          <p className="text-sm text-purple-600/60">Your mindful AI companion</p>
        </div>
        
        <div className="w-9" /> {/* Spacer for centering */}
      </header>

      {/* Chat area - scrollable but stops above input */}
      <div className="relative z-10 px-4 overflow-y-auto" style={{ height: 'calc(100vh - 400px)', maxHeight: 'calc(100vh - 400px)' }}>
        <div className="space-y-3 pb-4">
          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))}
        </div>
      </div>

      {/* Fixed bottom section - Input + Orb */}
      <div className="fixed bottom-0 left-0 right-0 z-20 pb-8">
        {/* Text input - above orb */}
        <div className="px-6 mb-4">
          <div className="relative flex items-center gap-2 px-4 py-3 rounded-full bg-white/25 backdrop-blur-md border border-white/30 shadow-lg">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendText()}
              placeholder="Type if you prefer…"
              className="flex-1 bg-transparent outline-none text-purple-900/70 placeholder:text-purple-400/40"
            />
            {inputText && (
              <button
                onClick={handleSendText}
                className="px-4 py-1.5 rounded-full bg-gradient-to-r from-purple-400/30 to-blue-400/30 backdrop-blur-sm text-purple-700 hover:from-purple-400/40 hover:to-blue-400/40 transition-all"
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
