import React, { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function ChatMessages({ messages }) {
  const endRef = useRef(null);
  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), [messages]);

  return (
    <div className="max-h-72 overflow-y-auto space-y-3">
      <AnimatePresence initial={false}>
        {messages.map((m) => (
          <motion.div
            key={m.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`inline-block px-3 py-2 rounded-lg max-w-[75%] ${
                m.role === "user" ? "bg-slate-700 text-right" : "bg-slate-600 text-left"
              }`}
            >
              {m.text}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
      <div ref={endRef} />
    </div>
  );
}
