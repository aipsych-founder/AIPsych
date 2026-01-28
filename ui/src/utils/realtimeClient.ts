// Realtime WebSocket client for OpenAI's Realtime API

const API_PORT = import.meta.env.VITE_API_PORT || '3001';
const API_BASE_URL = `http://localhost:${API_PORT}`;
// Connect to root WebSocket endpoint to match server implementation
const REALTIME_URL = `ws://localhost:${API_PORT}`;

type RealtimeEventType =
  | 'session.created'
  | 'session.updated'
  | 'conversation.item.created'
  | 'response.started'
  | 'response.text.delta'
  | 'response.audio.delta'
  | 'response.done'
  | 'error';

interface RealtimeEvent {
  type: RealtimeEventType;
  [key: string]: any;
}

interface RealtimeClientOptions {
  onTextDelta?: (text: string) => void;
  onAudioDelta?: (audioData: Uint8Array) => void;
  onResponseDone?: () => void;
  onError?: (error: string) => void;
}

export class RealtimeClient {
  private ws: WebSocket | null = null;
  private token: string = '';
  private options: RealtimeClientOptions;
  private isConnected = false;
  private audioContext: AudioContext | null = null;
  private audioBuffer: Float32Array[] = [];

  constructor(options: RealtimeClientOptions = {}) {
    this.options = options;
  }

  /**
   * Connect to Realtime API and authenticate
   */
  async connect(): Promise<void> {
    try {
      // Connect to our proxy WebSocket endpoint which handles OpenAI auth
      console.log('Connecting to proxy WebSocket at:', REALTIME_URL);
      return new Promise((resolve, reject) => {
        this.ws = new WebSocket(REALTIME_URL);

        const timeout = setTimeout(() => {
          reject(new Error('WebSocket connection timeout'));
        }, 5000);

        this.ws.onopen = () => {
          clearTimeout(timeout);
          // Don't send session.update—let OpenAI use defaults
          // The proxy will handle the connection directly
          this.isConnected = true;
          console.log('✅ Realtime WebSocket connected');
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.ws.onerror = (error) => {
          clearTimeout(timeout);
          console.error('WebSocket error:', error);
          this.options.onError?.('WebSocket error occurred');
          reject(error);
        };

        this.ws.onclose = () => {
          clearTimeout(timeout);
          this.isConnected = false;
          console.log('❌ Realtime WebSocket disconnected');
        };
      });
    } catch (err) {
      console.error('Failed to connect to Realtime:', err);
      throw err;
    }
  }

  /**
   * Send audio chunk to Realtime API
   */
  sendAudio(audioData: Uint8Array): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('WebSocket not connected, state:', this.ws?.readyState);
      return;
    }

    // Convert audio to base64
    const base64Audio = this.uint8ArrayToBase64(audioData);
    console.log(`Sending ${audioData.byteLength} bytes of audio`);

    this.ws.send(
      JSON.stringify({
        type: 'input_audio_buffer.append',
        audio: base64Audio,
      })
    );
  }

  /**
   * Signal that audio input is complete
   */
  commitAudio(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    this.ws.send(
      JSON.stringify({
        type: 'input_audio_buffer.commit',
      })
    );
  }

  /**
   * Send text message to Realtime API
   */
  sendText(text: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('WebSocket not connected');
      return;
    }

    this.ws.send(
      JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: text,
            },
          ],
        },
      })
    );

    // Request response
    this.ws.send(
      JSON.stringify({
        type: 'response.create',
        response: {
          modalities: ['text', 'audio'],
        },
      })
    );
  }

  /**
   * Close connection
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }

  /**
   * Handle incoming messages from Realtime API
   */
  private handleMessage(data: string): void {
    try {
      const event: RealtimeEvent = JSON.parse(data);

      switch (event.type) {
        case 'session.created':
          console.log('Session created:', event.session);
          // Configure session for audio streaming
          this.ws?.send(
            JSON.stringify({
              type: 'session.update',
              session: {
                instructions: 'You are an AI psychological support companion modeled on the style of a calm, experienced clinical psychologist.',
                input_audio_format: 'pcm16',
                output_audio_format: 'pcm16',
                voice: 'alloy',
                modalities: ['text', 'audio'],
              },
            })
          );
          break;

        case 'response.text.delta':
          if (event.delta) {
            this.options.onTextDelta?.(event.delta);
          }
          break;

        case 'response.audio.delta':
          if (event.delta) {
            const audioData = this.base64ToUint8Array(event.delta);
            this.options.onAudioDelta?.(audioData);
          }
          break;

        case 'response.done':
          this.options.onResponseDone?.();
          break;

        case 'error':
          console.error('Realtime error:', event.error);
          this.options.onError?.(event.error?.message || 'Unknown error');
          break;

        default:
          // Ignore other event types
      }
    } catch (err) {
      console.error('Failed to parse message:', err);
    }
  }

  /**
   * Convert Uint8Array to base64
   */
  private uint8ArrayToBase64(data: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < data.byteLength; i++) {
      binary += String.fromCharCode(data[i]);
    }
    return btoa(binary);
  }

  /**
   * Convert base64 to Uint8Array
   */
  private base64ToUint8Array(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  /**
   * Check if connected
   */
  isConnectedStatus(): boolean {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
  }
}

/**
 * Audio processor for handling PCM audio streaming and playback
 */
export class RealtimeAudioProcessor {
  private audioContext: AudioContext;
  private audioQueue: Float32Array[] = [];
  private isPlaying: boolean = false;
  private sampleRate: number = 24000; // Realtime API uses 24kHz
  private nextStartTime: number = 0;

  constructor() {
    this.audioContext =
      new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: this.sampleRate,
      });
  }

  /**
   * Convert PCM16 bytes to Float32
   */
  pcm16ToFloat32(pcm16: Uint8Array): Float32Array {
    const float32 = new Float32Array(pcm16.length / 2);
    for (let i = 0; i < float32.length; i++) {
      const int16 =
        (pcm16[i * 2 + 1] << 8) | pcm16[i * 2];
      float32[i] = int16 / 32768;
    }
    return float32;
  }

  /**
   * Play audio chunk with smooth buffering to prevent popping
   */
  async playAudioChunk(audioData: Uint8Array): Promise<void> {
    const float32 = this.pcm16ToFloat32(audioData);
    
    // Ensure audio context is running
    if (this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
      } catch (e) {
        console.warn('Could not resume audioContext:', e);
        return;
      }
    }

    // Add to queue
    this.audioQueue.push(float32);
    
    // Start playing if not already playing
    if (!this.isPlaying) {
      this.isPlaying = true;
      this.nextStartTime = this.audioContext.currentTime;
      this.playNextChunk();
    }
  }

  /**
   * Play next chunk in queue with seamless timing
   */
  private playNextChunk(): void {
    if (this.audioQueue.length === 0) {
      this.isPlaying = false;
      return;
    }

    const chunk = this.audioQueue.shift()!;
    const audioBuffer = this.audioContext.createBuffer(1, chunk.length, this.sampleRate);
    audioBuffer.getChannelData(0).set(chunk);

    const sourceNode = this.audioContext.createBufferSource();
    sourceNode.buffer = audioBuffer;
    
    // Apply slight fade to prevent popping
    const gainNode = this.audioContext.createGain();
    gainNode.gain.setValueAtTime(0, this.nextStartTime);
    gainNode.gain.linearRampToValueAtTime(1, this.nextStartTime + 0.01); // 10ms fade in
    gainNode.gain.setValueAtTime(1, this.nextStartTime + audioBuffer.duration - 0.01);
    gainNode.gain.linearRampToValueAtTime(0, this.nextStartTime + audioBuffer.duration); // 10ms fade out
    
    sourceNode.connect(gainNode);
    gainNode.connect(this.audioContext.destination);
    
    sourceNode.start(this.nextStartTime);
    
    // Schedule next chunk
    this.nextStartTime += audioBuffer.duration;
    
    sourceNode.onended = () => {
      this.playNextChunk();
    };
  }

  /**
   * Get audio context
   */
  getAudioContext(): AudioContext {
    return this.audioContext;
  }

  /**
   * Close audio context
   */
  close(): void {
    this.audioContext.close();
  }
}
