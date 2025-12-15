// Audio utilities for recording and playback

const API_BASE_URL = 'http://localhost:3001';

/**
 * Start recording audio from the user's microphone as PCM16
 */
export async function startAudioRecording(): Promise<{
  mediaRecorder: MediaRecorder;
  audioContext: AudioContext;
  audioProcessor: ScriptProcessorNode;
}> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
    sampleRate: 24000, // Match Realtime API sample rate
  });
  const source = audioContext.createMediaStreamSource(stream);
  const audioProcessor = audioContext.createScriptProcessor(4096, 1, 1);

  source.connect(audioProcessor);
  audioProcessor.connect(audioContext.destination);

  const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
  return { mediaRecorder, audioContext, audioProcessor };
}

/**
 * Convert Float32Array to PCM16
 */
function floatTo16BitPCM(float32Array: Float32Array): Uint8Array {
  const pcm16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    pcm16[i] = Math.max(-1, Math.min(1, float32Array[i])) < 0 
      ? float32Array[i] * 0x8000 
      : float32Array[i] * 0x7fff;
  }
  return new Uint8Array(pcm16.buffer);
}

/**
 * Stop recording and return the audio blob
 */
export function stopAudioRecording(mediaRecorder: MediaRecorder): Promise<Blob> {
  return new Promise((resolve) => {
    const chunks: BlobPart[] = [];
    mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
    mediaRecorder.onstop = () => {
      const audioBlob = new Blob(chunks, { type: 'audio/webm' });
      resolve(audioBlob);
    };
    mediaRecorder.stop();
    // Stop all tracks
    mediaRecorder.stream.getTracks().forEach(track => track.stop());
  });
}

/**
 * Send audio to the API and get transcription + AI response
 */
export async function transcribeAndRespond(audioBlob: Blob): Promise<{
  userText: string;
  replyText: string;
  durationMs?: number;
}> {
  const formData = new FormData();
  formData.append('audio', audioBlob, 'audio.webm');

  const response = await fetch(`${API_BASE_URL}/api/transcribe`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Transcription failed');
  }

  const data = await response.json();

  // Start server TTS for the reply (non-blocking). The textToSpeech helper
  // will handle streaming playback and browser fallback as needed.
  try {
    const reply = data.replyText || data.reply || '';
    if (reply) {
      // Kick off server TTS but don't await it here
      textToSpeech(reply).catch((err) => console.warn('Background TTS failed:', err));
    }
  } catch (e) {
    console.warn('Failed to initiate background TTS:', e);
  }

  return data;
}

/**
 * Send text message to the API and get AI response with streamed text + audio
 */
export async function sendTextMessage(message: string): Promise<{
  reply: string;
}> {
  const response = await fetch(`${API_BASE_URL}/api/psych-stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Request failed');
  }

  let fullReply = '';
  const audioChunks: Uint8Array[] = [];

  try {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines[lines.length - 1]; // Keep incomplete line in buffer

      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        try {
          const msg = JSON.parse(line);
          if (msg.type === 'text' && msg.data) {
            fullReply = msg.data;
            console.log('📝 Received text:', fullReply.substring(0, 50) + '...');
          } else if (msg.type === 'audio' && msg.data) {
            // Decode base64 audio chunk
            const binary = atob(msg.data);
            const len = binary.length;
            const bytes = new Uint8Array(len);
            for (let j = 0; j < len; j++) bytes[j] = binary.charCodeAt(j);
            audioChunks.push(bytes);
          }
        } catch (e) {
          console.warn('Failed to parse NDJSON line:', e);
        }
      }
    }

    // Combine all audio chunks and play
    if (audioChunks.length > 0) {
      const totalLength = audioChunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const audioBuffer = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of audioChunks) {
        audioBuffer.set(chunk, offset);
        offset += chunk.length;
      }
      console.log(`🔊 Streaming audio received (${audioBuffer.length} bytes), playing...`);
      playAudio(audioBuffer).catch((err) => console.warn('Audio playback failed:', err));
    }
  } catch (err) {
    console.error('Error streaming response:', err);
    throw err;
  }

  return { reply: fullReply };
}

/**
 * Play audio from base64-encoded MP3
 */
export function playAudio(audioInput: string | ArrayBuffer): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      let arrayBufferPromise: Promise<ArrayBuffer>;

      if (typeof audioInput === 'string') {
        // base64 string
        const binary = atob(audioInput);
        const len = binary.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
        arrayBufferPromise = Promise.resolve(bytes.buffer);
      } else {
        arrayBufferPromise = Promise.resolve(audioInput);
      }

      arrayBufferPromise.then((arrayBuffer) => {
        const audioBlob = new Blob([arrayBuffer], { type: 'audio/mp3' });

        // If the browser is currently speaking via SpeechSynthesis, stop it
        try {
          if ((window as any).speechSynthesis && (window as any).speechSynthesis.speaking) {
            (window as any).speechSynthesis.cancel();
          }
        } catch (e) {
          /* ignore */
        }

      // Use AudioContext decodeAudioData for lower-latency playback when available
        // Use AudioContext decodeAudioData for lower-latency playback when available
        const AudioCtx = (window.AudioContext || (window as any).webkitAudioContext);
        if (AudioCtx) {
          const ctx = new AudioCtx();
          try {
            ctx.decodeAudioData(arrayBuffer.slice(0), (audioBufferDecoded) => {
              const source = ctx.createBufferSource();
              source.buffer = audioBufferDecoded;
              source.connect(ctx.destination);
              if (ctx.state === 'suspended') ctx.resume().catch(() => {});
              source.onended = () => {
                try { ctx.close(); } catch (e) {}
                try { (window as any).__serverTTSPlaying = false; } catch (e) {}
                resolve();
              };
              try { (window as any).__serverTTSPlaying = true; } catch (e) {}
              source.start();
            }, (err) => {
              console.warn('decodeAudioData failed, falling back to <audio> element', err);
              const audioUrl = URL.createObjectURL(audioBlob);
              const audio = new Audio(audioUrl);
              audio.onended = () => { try { (window as any).__serverTTSPlaying = false; } catch (e) {} ; URL.revokeObjectURL(audioUrl); resolve(); };
              audio.onerror = (err) => { URL.revokeObjectURL(audioUrl); reject(new Error('Failed to play audio')); };
              audio.play().catch(reject);
            });
          } catch (e) {
            // Fallback to audio element
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);
            audio.onended = () => { try { (window as any).__serverTTSPlaying = false; } catch (e) {} ; URL.revokeObjectURL(audioUrl); resolve(); };
            audio.onerror = (err) => { URL.revokeObjectURL(audioUrl); reject(new Error('Failed to play audio')); };
            try {
              try { (window as any).__serverTTSPlaying = true; } catch (e) {}
              if ((window as any).speechSynthesis && (window as any).speechSynthesis.speaking) {
                (window as any).speechSynthesis.cancel();
              }
            } catch (e) {}
            audio.play().catch(reject);
          }
        } else {
          // fallback to <audio>
          const audioUrl = URL.createObjectURL(audioBlob);
          const audio = new Audio(audioUrl);
          audio.onended = () => { try { (window as any).__serverTTSPlaying = false; } catch (e) {} ; URL.revokeObjectURL(audioUrl); resolve(); };
          audio.onerror = (err) => { URL.revokeObjectURL(audioUrl); reject(new Error('Failed to play audio')); };
          try {
            try { (window as any).__serverTTSPlaying = true; } catch (e) {}
            if ((window as any).speechSynthesis && (window as any).speechSynthesis.speaking) {
              (window as any).speechSynthesis.cancel();
            }
          } catch (e) {}
          audio.play().catch(reject);
        }
      }).catch(reject);
    } catch (err) {
      console.error('❌ Error in playAudio:', err);
      reject(err);
    }
  });
}

/**
 * Detect if text is Malayalam
 */
function isMalayalam(text: string): boolean {
  // Malayalam Unicode range: U+0D00 to U+0D7F
  const malayalamRegex = /[\u0D00-\u0D7F]/;
  return malayalamRegex.test(text);
}

/**
 * Convert text to speech and play it
 */
export async function textToSpeech(text: string): Promise<void> {
  try {
    // Check if text is Malayalam
    if (isMalayalam(text)) {
      console.log('🇮🇳 Malayalam text detected - attempting browser SpeechSynthesis fallback');
      // Try browser SpeechSynthesis for immediate low-latency playback
      try {
        await speakWithBrowser(text, 'ml-IN');
        return;
      } catch (e) {
        console.warn('Browser speech synthesis failed for Malayalam, falling back to server (may not support Malayalam):', e);
        // continue to server fallback (may not produce Malayalam audio)
      }
    }

    console.log('🔊 Requesting TTS for text:', text.substring(0, 50) + '...');
    const response = await fetch(`${API_BASE_URL}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('TTS API error response:', response.status, errorText);
      throw new Error(`TTS failed: ${response.status} - ${errorText}`);
    }

    // Stream-play audio via MediaSource for minimal startup latency
    if (response.body && 'MediaSource' in window) {
      console.log('✅ TTS streaming (MediaSource) started, playing audio as it arrives...');
      const reader = response.body.getReader();

      try {
        await streamToMediaSource(reader);
        console.log('✅ MediaSource playback completed');
      } catch (err) {
        console.warn('MediaSource streaming failed, falling back to buffer playback:', err);
        // fallback to complete buffer
        const arrayBuffer = await (await fetch(`${API_BASE_URL}/api/tts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })).arrayBuffer();
        playAudio(arrayBuffer).catch((e) => console.warn('Fallback playback failed:', e));
      } finally {
        try { reader.releaseLock(); } catch (e) {}
      }
    } else if (response.body) {
      // If MediaSource not supported, fall back to full buffer then play
      const arrayBuffer = await response.arrayBuffer();
      console.log('✅ Got TTS response (' + arrayBuffer.byteLength + ' bytes), playing audio...');
      playAudio(arrayBuffer).catch((err) => console.warn('Server TTS playback failed:', err));
      console.log('✅ Audio playback started');
    } else {
      const arrayBuffer = await response.arrayBuffer();
      console.log('✅ Got TTS response (' + arrayBuffer.byteLength + ' bytes), playing audio...');
      playAudio(arrayBuffer).catch((err) => console.warn('Server TTS playback failed:', err));
      console.log('✅ Audio playback started');
    }
  } catch (err) {
    console.error('❌ Failed to convert text to speech:', err);
    throw err;
  }
}

// Stream MP3 chunks from reader into a MediaSource-backed audio element
async function streamToMediaSource(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      const mediaSource = new (window as any).MediaSource();
      const audio = document.createElement('audio');
      audio.autoplay = true;
      audio.controls = false;
      const objectUrl = URL.createObjectURL(mediaSource);
      audio.src = objectUrl;
      document.body.appendChild(audio);

      mediaSource.addEventListener('sourceopen', async () => {
        try {
          // Use MP3 MIME
          const mime = 'audio/mpeg';
          if (!(window as any).MediaSource.isTypeSupported || !(window as any).MediaSource.isTypeSupported(mime)) {
            console.warn('MIME type not supported for MediaSource, falling back');
            reject(new Error('MIME not supported'));
            return;
          }

          const sourceBuffer = (mediaSource as any).addSourceBuffer(mime);

          let firstAppend = true;
          let pending: ArrayBuffer[] = [];

          sourceBuffer.addEventListener('updateend', () => {
            if (pending.length > 0 && !sourceBuffer.updating) {
              const next = pending.shift()!;
              sourceBuffer.appendBuffer(next);
            }
          });

          // Read incoming chunks and append
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const buf = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
            if (sourceBuffer.updating || pending.length > 0) {
              pending.push(buf);
            } else {
              try {
                sourceBuffer.appendBuffer(buf);
              } catch (e) {
                // If append fails, queue and continue
                pending.push(buf);
              }
            }

            // Start playback as soon as first data appended
            if (firstAppend) {
              firstAppend = false;
              try {
                // Indicate server-side TTS playback is starting so we avoid browser fallback
                try { (window as any).__serverTTSPlaying = true; } catch (e) {}

                // Stop any in-progress browser TTS to avoid double voices
                try {
                  if ((window as any).speechSynthesis && (window as any).speechSynthesis.speaking) {
                    (window as any).speechSynthesis.cancel();
                  }
                } catch (e) {}

                await audio.play();

                // When audio ends, clear the flag and remove the element
                audio.onended = () => {
                  try { (window as any).__serverTTSPlaying = false; } catch (e) {}
                  try { URL.revokeObjectURL(objectUrl); } catch (e) {}
                  try { audio.remove(); } catch (e) {}
                };
              } catch (e) {
                console.warn('Auto-play prevented, user interaction required', e);
              }
            }
          }

          // All chunks received; wait for pending appends
          const waitForFinish = () => new Promise((res) => {
            const check = () => {
              if (!sourceBuffer.updating && pending.length === 0) return res(null);
              setTimeout(check, 50);
            };
            check();
          });

          await waitForFinish();
          try { mediaSource.endOfStream(); } catch (e) {}
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Use browser SpeechSynthesis to speak text. Resolves when speech ends.
 */
function speakWithBrowser(text: string, lang = 'en-US'): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!('speechSynthesis' in window)) {
      return reject(new Error('SpeechSynthesis not supported'));
    }

    const synth = window.speechSynthesis;

    const attemptSpeak = () => {
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = lang;
      // Try to pick a matching voice
      const voices = synth.getVoices() || [];
      const match = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith(lang.split('-')[0]));
      if (match) utter.voice = match;

      utter.onend = () => resolve();
      utter.onerror = (e) => reject(e.error || new Error('SpeechSynthesis error'));
      synth.speak(utter);
    };

    // Some browsers populate voices asynchronously
    const voices = synth.getVoices();
    if (voices.length === 0) {
      const handler = () => {
        synth.removeEventListener('voiceschanged', handler);
        attemptSpeak();
      };
      synth.addEventListener('voiceschanged', handler);
      // Also set a timeout in case voiceschanged never fires
      setTimeout(() => {
        try {
          attemptSpeak();
        } catch (e) {
          reject(e);
        }
      }, 500);
    } else {
      attemptSpeak();
    }
  });
}

/**
 * Stop all audio playback
 */
export function stopAllAudio(): void {
  const audioElements = document.querySelectorAll('audio');
  audioElements.forEach((audio) => {
    audio.pause();
    audio.currentTime = 0;
  });
}
