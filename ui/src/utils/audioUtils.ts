// Audio utilities for recording and playback

const API_PORT = import.meta.env.VITE_API_PORT || '3001';
const API_BASE_URL = `http://localhost:${API_PORT}`;

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

// Smart text merging with Malayalam character support
function mergeTextChunk(chunk: string, previousText: string = ''): string {
  try {
    if (!chunk || typeof chunk !== 'string') return chunk || '';
    
    // Don't modify the chunk - preserve all spacing as sent by AI
    if (!previousText) return chunk;
    
    const lastChar = previousText.slice(-1);
    const firstChar = chunk.charAt(0);
    
    // Don't add space if chunk already starts with whitespace
    if (/\s/.test(firstChar)) return chunk;
    
    // Add space between Malayalam characters to prevent sticking
    const isMalayalamLast = /[\u0D00-\u0D7F]/.test(lastChar);
    const isMalayalamFirst = /[\u0D00-\u0D7F]/.test(firstChar);
    const isLetterLast = /[a-zA-Z]/.test(lastChar);
    const isLetterFirst = /[a-zA-Z]/.test(firstChar);
    
    // Add space between:
    // 1. Malayalam characters
    // 2. English letters
    // 3. Mixed Malayalam and English
    if ((isMalayalamLast && isMalayalamFirst) ||
        (isLetterLast && isLetterFirst) ||
        (isMalayalamLast && isLetterFirst) ||
        (isLetterLast && isMalayalamFirst)) {
      return ' ' + chunk;
    }
    
    return chunk;
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



export function initPsychWebSocket(handler: (text: string, isComplete?: boolean) => void) {
  // Prevent duplicate connections in StrictMode
  if ((ws && ws.readyState === WebSocket.OPEN) || isConnecting) return;
  
  isConnecting = true;
  onAIMessage = handler;
  currentAIText = ''; // Reset text accumulation
  ws = new WebSocket(`ws://localhost:${API_PORT}`);

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
          // Don't trim - preserve all spacing sent by AI
          const processedChunk = data.delta;
          
          if (processedChunk) {
            currentAIText += processedChunk;
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

  // Only send if WebSocket is open
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ text }));
  }
}

let lastSendTime = 0; // Debounce variable

/* =====================================================
   🎙️ VOICE (LEFT AS-IS / PLACEHOLDER)
===================================================== */

export async function transcribeAndRespond(audioBlob: Blob): Promise<void> {
  try {
    // Convert audio blob to base64
    const arrayBuffer = await audioBlob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    const base64Audio = btoa(String.fromCharCode(...uint8Array));
    
    // Send audio over WebSocket if connected
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'input_audio_buffer.append',
        audio: base64Audio
      }));
      
      // Commit the audio buffer
      ws.send(JSON.stringify({
        type: 'input_audio_buffer.commit'
      }));
    } else {
      console.warn('WebSocket not connected, cannot send audio');
      // Could implement REST API fallback here if needed
    }
  } catch (error) {
    console.error('Error processing audio:', error);
    throw error;
  }
}
