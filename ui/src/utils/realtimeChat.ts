/**
 * REALTIME CONVERSATION ARCHITECTURE
 * ===================================
 * 
 * 3 APPROACHES TO REAL-TIME CONVERSATIONS:
 * 
 * APPROACH 1: OpenAI Realtime API (Recommended)
 * ============================================
 * Pros:
 *  - Native voice-to-voice streaming
 *  - Lowest latency (built for real-time)
 *  - Server-side audio encoding
 *  - Automatic speech-to-text & text-to-speech
 * 
 * Cons:
 *  - Auth/session management complexity
 *  - Requires beta API access
 *  - WebSocket protocol learning curve
 * 
 * Implementation: Use WebSocket proxy to OpenAI
 * Model: gpt-4o-realtime-preview
 * Latency: 500ms-1.5s (vs 2-3s with REST)
 * Cost: Higher (dedicated connection)
 * 
 * 
 * APPROACH 2: WebSocket + Streaming Chat API
 * ===========================================
 * Pros:
 *  - Bidirectional communication
 *  - Streaming text responses
 *  - More control over behavior
 * 
 * Cons:
 *  - Still uses Chat API (slower than Realtime)
 *  - Manual audio handling
 *  - More complex frontend
 * 
 * Implementation: WebSocket for messaging + streaming TTS
 * Latency: 1.5-2.5s (same as current + streaming)
 * Cost: Same as REST
 * 
 * 
 * APPROACH 3: Server-Sent Events (SSE)
 * ====================================
 * Pros:
 *  - Simple, HTTP-based
 *  - No WebSocket complexity
 *  - Works through most proxies
 * 
 * Cons:
 *  - One-way only (client can send, server streams back)
 *  - Can't receive voice while streaming response
 *  - Older browser support issues
 * 
 * Implementation: POST with streaming response
 * Latency: Same as streaming (1.5-3s)
 * Cost: Same as REST
 * 
 * 
 * RECOMMENDATION:
 * ===============
 * Start with APPROACH 1 (Realtime API) because:
 * 1. You already have the proxy code
 * 2. Native voice support = best UX
 * 3. Fastest latency (500ms-1.5s)
 * 4. Built specifically for this use case
 * 
 * Then fallback to APPROACH 2 (WebSocket + Streaming) if Realtime issues occur
 */

// APPROACH 1: OPENAI REALTIME API CLIENT
// ========================================
import WebSocket from 'ws';

export class RealtimeClient {
  constructor(apiKey, onMessage, onError) {
    this.apiKey = apiKey;
    this.onMessage = onMessage;
    this.onError = onError;
    this.ws = null;
    this.sessionId = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
  }

  async connect(systemPrompt) {
    try {
      const token = await this.getRealtimeToken(systemPrompt);
      this.connectWithToken(token);
    } catch (err) {
      this.onError('Failed to get realtime token: ' + err.message);
    }
  }

  async getRealtimeToken(systemPrompt) {
    // Create session on server
    const response = await fetch('http://localhost:3001/api/realtime-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instructions: systemPrompt })
    });
    const data = await response.json();
    return data.token;
  }

  connectWithToken(token) {
    const wsUrl = `ws://localhost:3001/realtime`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('✅ Realtime connection established');
      this.reconnectAttempts = 0;
      // Send session token
      this.send({
        type: 'session.update',
        session: {
          modalities: ['audio', 'text'],
          instructions: 'You are a supportive therapist',
          input_audio_format: 'pcm16',
          output_audio_format: 'pcm16'
        }
      });
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        this.handleRealtimeMessage(message);
      } catch (err) {
        console.error('Failed to parse realtime message:', err);
      }
    };

    this.ws.onerror = (err) => {
      this.onError('WebSocket error: ' + err.message);
      this.attemptReconnect();
    };

    this.ws.onclose = () => {
      console.log('Realtime connection closed');
      this.attemptReconnect();
    };
  }

  handleRealtimeMessage(message) {
    switch (message.type) {
      case 'session.created':
        console.log('✅ Session created:', message.session.id);
        this.sessionId = message.session.id;
        break;

      case 'response.text.delta':
        // Stream text response
        this.onMessage({
          type: 'text',
          delta: message.delta,
          transcript: false
        });
        break;

      case 'response.audio.delta':
        // Stream audio response
        this.onMessage({
          type: 'audio',
          audio: message.delta
        });
        break;

      case 'conversation.item.input_audio_transcription.completed':
        // User speech transcribed
        this.onMessage({
          type: 'transcript',
          text: message.transcript,
          isUser: true
        });
        break;

      case 'error':
        this.onError('Realtime API error: ' + message.error.message);
        break;

      default:
        if (message.type.includes('error')) {
          this.onError('Error: ' + JSON.stringify(message));
        }
    }
  }

  send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      this.onError('WebSocket not connected');
    }
  }

  sendAudio(audioData) {
    this.send({
      type: 'input_audio_buffer.append',
      audio: audioData  // base64-encoded audio
    });
  }

  sendText(text) {
    this.send({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{
          type: 'text',
          text: text
        }]
      }
    });

    this.send({
      type: 'response.create'
    });
  }

  attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.pow(2, this.reconnectAttempts) * 1000;
      console.log(`Attempting reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${delay}ms`);
      setTimeout(() => this.connect(), delay);
    } else {
      this.onError('Max reconnection attempts reached');
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

// APPROACH 2: WEBSOCKET + STREAMING CHAT
// =======================================
export class StreamingChatClient {
  constructor(onMessage, onError) {
    this.onMessage = onMessage;
    this.onError = onError;
    this.ws = null;
  }

  async connect() {
    const wsUrl = `ws://localhost:3001/streaming-chat`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('✅ Streaming chat connected');
    };

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      
      if (message.type === 'text') {
        // Streaming text chunks
        this.onMessage({
          type: 'text',
          delta: message.content
        });
      } else if (message.type === 'audio') {
        // Audio stream chunks
        this.onMessage({
          type: 'audio',
          chunk: message.data
        });
      }
    };

    this.ws.onerror = (err) => {
      this.onError('WebSocket error: ' + err.message);
    };
  }

  async sendMessage(text) {
    this.ws.send(JSON.stringify({
      type: 'text',
      content: text,
      includeAudio: true  // Request TTS alongside
    }));
  }

  async sendAudio(audioBlob) {
    const base64 = await this.blobToBase64(audioBlob);
    this.ws.send(JSON.stringify({
      type: 'audio',
      audio: base64
    }));
  }

  async blobToBase64(blob) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(',')[1]);
      reader.readAsDataURL(blob);
    });
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
  }
}
