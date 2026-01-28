import { motion } from 'motion/react';

type VoiceOrbProps = {
  state: 'idle' | 'listening' | 'speaking';
  onPress: () => void;
};

export function VoiceOrb({ state, onPress }: VoiceOrbProps) {
  const getStateText = () => {
    switch (state) {
      case 'listening':
        return 'Listening…';
      case 'speaking':
        return 'Speaking…';
      default:
        return 'Tap to Speak';
    }
  };

  const getStateColor = () => {
    switch (state) {
      case 'listening':
        return 'from-blue-400 via-purple-400 to-blue-500';
      case 'speaking':
        return 'from-purple-400 via-pink-400 to-purple-500';
      default:
        return 'from-blue-300 via-purple-300 to-emerald-300';
    }
  };

  return (
    <div className="flex flex-col items-center">
      {/* Orb container */}
      <button
        onClick={onPress}
        disabled={state === 'speaking'}
        className="relative flex items-center justify-center outline-none"
      >
        {/* Expanding rings - multiple layers for depth */}
        {state !== 'idle' && (
          <>
            <motion.div
              className={`absolute w-48 h-48 rounded-full bg-gradient-to-br ${getStateColor()} opacity-20`}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ 
                scale: [0.8, 1.3, 0.8],
                opacity: [0, 0.3, 0]
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            />
            <motion.div
              className={`absolute w-48 h-48 rounded-full bg-gradient-to-br ${getStateColor()} opacity-15`}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ 
                scale: [0.8, 1.5, 0.8],
                opacity: [0, 0.25, 0]
              }}
              transition={{
                duration: 2.5,
                repeat: Infinity,
                ease: "easeInOut",
                delay: 0.3
              }}
            />
            <motion.div
              className={`absolute w-48 h-48 rounded-full bg-gradient-to-br ${getStateColor()} opacity-10`}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ 
                scale: [0.8, 1.7, 0.8],
                opacity: [0, 0.2, 0]
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut",
                delay: 0.6
              }}
            />
          </>
        )}

        {/* Main orb - glassy with gradient */}
        <motion.div
          className={`relative w-40 h-40 rounded-full bg-gradient-to-br ${getStateColor()} shadow-2xl`}
          style={{
            boxShadow: '0 20px 60px rgba(139, 92, 246, 0.4), inset 0 2px 20px rgba(255, 255, 255, 0.5)',
          }}
          animate={{
            scale: state === 'idle' ? [1, 1.05, 1] : state === 'listening' ? [1, 1.08, 1] : [1, 1.03, 1],
          }}
          transition={{
            duration: state === 'listening' ? 1.5 : state === 'speaking' ? 0.6 : 3,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        >
          {/* Glass reflection overlay */}
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/40 via-transparent to-transparent" />
          
          {/* Shimmer effect */}
          <motion.div
            className="absolute inset-0 rounded-full bg-gradient-to-r from-transparent via-white/30 to-transparent"
            animate={{
              x: ['-100%', '100%'],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut",
              repeatDelay: 1
            }}
            style={{ mixBlendMode: 'overlay' }}
          />

          {/* Inner glow */}
          <motion.div
            className="absolute inset-4 rounded-full bg-gradient-to-br from-white/20 to-transparent"
            animate={{
              opacity: state === 'idle' ? [0.3, 0.6, 0.3] : [0.5, 0.8, 0.5],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />

          {/* Listening ripples */}
          {state === 'listening' && (
            <>
              <motion.div
                className="absolute inset-0 rounded-full border-2 border-white/60"
                animate={{
                  scale: [1, 1.2],
                  opacity: [0.6, 0]
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  ease: "easeOut"
                }}
              />
              <motion.div
                className="absolute inset-0 rounded-full border-2 border-white/60"
                animate={{
                  scale: [1, 1.2],
                  opacity: [0.6, 0]
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  ease: "easeOut",
                  delay: 0.75
                }}
              />
            </>
          )}

          {/* Speaking particles/waves */}
          {state === 'speaking' && (
            <div className="absolute inset-0 flex items-center justify-center">
              {[...Array(5)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute w-1 rounded-full bg-white/70"
                  style={{
                    height: '20%',
                    left: `${30 + i * 10}%`,
                  }}
                  animate={{
                    scaleY: [1, 2, 0.5, 2, 1],
                  }}
                  transition={{
                    duration: 0.8,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: i * 0.1
                  }}
                />
              ))}
            </div>
          )}
        </motion.div>
      </button>

      {/* State text below orb */}
      <motion.p
        className="mt-6 text-purple-600/80"
        animate={{
          opacity: state === 'listening' ? [0.6, 1, 0.6] : 1
        }}
        transition={{
          duration: 1.5,
          repeat: state === 'listening' ? Infinity : 0,
          ease: "easeInOut"
        }}
      >
        {getStateText()}
      </motion.p>
    </div>
  );
}
