import { motion } from 'motion/react';

type Message = {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: Date;
};

type ChatMessageProps = {
  message: Message;
};

// Simple markdown-like text renderer
function renderText(text: string) {
  // Split by double newlines for paragraphs
  const paragraphs = text.split('\n\n').filter(p => p.trim());
  
  if (paragraphs.length <= 1) {
    // Single paragraph - preserve line breaks
    return (
      <div className="whitespace-pre-line leading-relaxed">
        {text}
      </div>
    );
  }
  
  // Multiple paragraphs
  return (
    <div className="space-y-3">
      {paragraphs.map((paragraph, index) => (
        <p key={index} className="leading-relaxed whitespace-pre-line">
          {paragraph.trim()}
        </p>
      ))}
    </div>
  );
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isAI = message.sender === 'ai';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`flex ${isAI ? 'justify-start' : 'justify-end'}`}
    >
      <div
        className={`max-w-[80%] px-5 py-3 rounded-3xl backdrop-blur-md border ${
          isAI
            ? 'bg-white/30 border-white/40 text-purple-900/80 rounded-tl-sm'
            : 'bg-purple-400/20 border-purple-300/30 text-purple-900/90 rounded-tr-sm'
        }`}
        style={{
          boxShadow: isAI 
            ? '0 4px 20px rgba(139, 92, 246, 0.1)' 
            : '0 4px 20px rgba(147, 51, 234, 0.15)',
        }}
      >
        {renderText(message.text)}
      </div>
    </motion.div>
  );
}
