// Audio utilities for recording and playback

const API_BASE_URL = 'http://localhost:3001';

/* =====================================================
   🎧 AUDIO RECORDING (UNCHANGED)
===================================================== */

export async function startAudioRecording(): Promise<{
  mediaRecorder: MediaRecorder;
  audioContext: AudioContext;
  audioProcessor: ScriptProcessorNode;
}> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
    sampleRate: 24000,
  });

  const source = audioContext.createMediaStreamSource(stream);
  const audioProcessor = audioContext.createScriptProcessor(4096, 1, 1);

  source.connect(audioProcessor);
  audioProcessor.connect(audioContext.destination);

  const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
  return { mediaRecorder, audioContext, audioProcessor };
}

export function stopAudioRecording(mediaRecorder: MediaRecorder): Promise<Blob> {
  return new Promise((resolve) => {
    const chunks: BlobPart[] = [];
    mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
    mediaRecorder.onstop = () => {
      const audioBlob = new Blob(chunks, { type: 'audio/webm' });
      resolve(audioBlob);
    };
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach((track) => track.stop());
  });
}

/* =====================================================
   🔌 WEBSOCKET TEXT CHAT (FIX)
===================================================== */

let ws: WebSocket | null = null;
let onAIMessage: ((text: string, isComplete?: boolean) => void) | null = null;
let isConnecting = false; // Prevent duplicate connections
let currentAIText = ''; // Track accumulated text for formatting

// Smart text merging with punctuation-aware spacing
function mergeTextChunk(chunk: string, previousText: string = ''): string {
  try {
    if (!chunk || typeof chunk !== 'string') return chunk || '';
    
    // Trim leading spaces from incoming chunk
    const trimmedChunk = chunk.trimStart();
    if (!trimmedChunk) return '';
    
    if (!previousText) return trimmedChunk;
    
    const lastChar = previousText.slice(-1);
    const firstChar = trimmedChunk.charAt(0);
    
    // Insert space if:
    // 1. Previous char is letter and next starts with letter
    // 2. Previous char is ?, !, . and next starts with letter
    if ((/[a-zA-Z\u0D00-\u0D7F]/.test(lastChar) && /[a-zA-Z\u0D00-\u0D7F]/.test(firstChar)) ||
        (/[.!?]/.test(lastChar) && /[a-zA-Z\u0D00-\u0D7F]/.test(firstChar))) {
      return ' ' + trimmedChunk;
    }
    
    return trimmedChunk;
  } catch (err) {
    return chunk || '';
  }
}

// Format text with line breaks after sentences
function formatWithLineBreaks(text: string): string {
  try {
    return text
      .replace(/([.!?])\s+/g, '$1\n')  // Add newline after sentence endings
      .replace(/\s+/g, ' ')  // Normalize spaces
      .replace(/\n\s+/g, '\n')  // Remove spaces after newlines
      .trim();
  } catch (err) {
    return text || '';
  }
}

// Check if chunk completes a sentence
function completesSentence(chunk: string): boolean {
  return /[.!?]\s*$/.test(chunk.trim());
}

export function initPsychWebSocket(handler: (text: string, isComplete?: boolean) => void) {
  // Prevent duplicate connections in StrictMode
  if ((ws && ws.readyState === WebSocket.OPEN) || isConnecting) return;
  
  isConnecting = true;
  onAIMessage = handler;
  currentAIText = ''; // Reset text accumulation
  ws = new WebSocket('ws://localhost:3001');

  ws.onopen = () => {
    console.log('🟢 Connected to AIPsych WebSocket');
    isConnecting = false;
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      // FALLBACK RESPONSE (guaranteed response)
      if (data.type === 'fallback_response') {
        if (typeof data.message === 'string') {
          const formattedMessage = formatWithLineBreaks(data.message);
          onAIMessage?.(formattedMessage, true);
        }
        return;
      }

      // INSTANT RESPONSE (immediate)
      if (data.type === 'instant_response') {
        if (typeof data.message === 'string') {
          const formattedMessage = formatWithLineBreaks(data.message);
          onAIMessage?.(formattedMessage, true);
        }
        return;
      }

      // CRISIS RESPONSE (complete message)
      if (data.type === 'crisis_response') {
        if (typeof data.message === 'string') {
          const formattedMessage = formatWithLineBreaks(data.message);
          onAIMessage?.(formattedMessage, true);
        }
        return;
      }

      // STREAMING TEXT from audio transcript
      if (data.type === 'response.audio_transcript.delta') {
        if (typeof data.delta === 'string') {
          let processedChunk = data.delta;
          try {
            // Apply smart merging with spacing rules
            if (typeof mergeTextChunk === 'function') {
              processedChunk = mergeTextChunk(data.delta, currentAIText) || data.delta;
              
              // Add newline if chunk completes a sentence
              if (completesSentence(processedChunk)) {
                processedChunk += '\n';
              }
              
              currentAIText += processedChunk;
            }
          } catch (err) {
            // Merging failed - use original
            processedChunk = data.delta;
          }
          
          if (processedChunk) {
            onAIMessage?.(processedChunk);
          }
        }
      }

      // FINAL TEXT from audio transcript - SKIP to prevent duplication
      // if (data.type === 'response.audio_transcript.done') {
      //   if (typeof data.transcript === 'string') {
      //     onAIMessage?.(data.transcript);
      //   }
      // }
    } catch (e) {
      console.warn('WS message parse skipped');
    }
  };

  ws.onerror = (err) => {
    console.error('❌ WebSocket error', err);
    isConnecting = false;
  };

  ws.onclose = () => {
    console.log('🔴 WebSocket closed - attempting reconnect in 2s');
    ws = null;
    isConnecting = false;
    
    // Auto-reconnect after 2 seconds
    setTimeout(() => {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.log('🔄 Reconnecting...');
        initPsychWebSocket(onAIMessage!);
      }
    }, 2000);
  };
}

export function sendTextMessage(text: string) {
  // Debounce rapid sends
  const now = Date.now();
  if (now - lastSendTime < 500) {
    console.log('🚫 Message send debounced');
    return;
  }
  lastSendTime = now;
  
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.log('🔄 WebSocket not ready, reconnecting...');
    initPsychWebSocket(onAIMessage!);
    
    // Retry after connection
    setTimeout(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ text }));
      }
    }, 1000);
    return;
  }

  ws.send(JSON.stringify({ text }));
}

let lastSendTime = 0; // Debounce variable

/* =====================================================
   🎙️ VOICE (LEFT AS-IS / PLACEHOLDER)
===================================================== */

export async function transcribeAndRespond(_: Blob): Promise<any> {
  throw new Error('Voice pipeline not wired to WebSocket yet');
}
