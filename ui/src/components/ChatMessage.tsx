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
        <p className="leading-relaxed">{message.text}</p>
      </div>
    </motion.div>
  );
}
