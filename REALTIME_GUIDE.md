# Real-Time Conversations: Complete Guide

## 🎯 Three Approaches Compared

### **Approach 1: OpenAI Realtime API** ⭐ RECOMMENDED

**What it is:** Native bidirectional WebSocket connection to OpenAI's Realtime API

**Latency:** 500ms - 1.5 seconds (best-in-class)

**How it works:**
```
Browser ←→ WebSocket ←→ Server Proxy ←→ OpenAI Realtime API (gpt-4o-realtime-preview)
             Real-time                     Native voice-to-voice
             bidirectional                 streaming engine
```

**Pros:**
- ✅ Lowest latency (native streaming)
- ✅ Natural voice conversations
- ✅ Auto speech-to-text (Whisper)
- ✅ Auto text-to-speech (TTS)
- ✅ Interruption support (stop talking to listen)
- ✅ Built for real-time interaction

**Cons:**
- ❌ Complex session management
- ❌ Requires beta API access
- ❌ Higher cost (~$0.30/min)
- ❌ WebSocket auth handling
- ❌ Had stability issues in tests

**Cost:** ~$0.30 per minute of conversation

**Implementation:**
```javascript
// Client
const client = new RealtimeClient(apiKey, onMessage, onError);
await client.connect(systemPrompt);
client.sendAudio(audioBlob);  // User speaks
client.sendText(text);        // Or user types

// Server: Already has proxy at /realtime
// Just need to fix auth and session management
```

**When to use:**
- Natural voice conversations needed
- Users want low latency (<2s)
- App can handle $0.30/min costs
- Production app with error handling

---

### **Approach 2: WebSocket + Streaming Chat API** ⭐ GOOD BALANCE

**What it is:** Bidirectional WebSocket for messaging + streaming Chat API for responses

**Latency:** 1.5 - 2.5 seconds (same as current, but streaming)

**How it works:**
```
Browser ←→ WebSocket Server ←→ OpenAI Chat API
            (persistent)       (streaming)
            Text messages      ↓
            Audio uploads      Text chunks
                               ↓
                               TTS streamed
```

**Pros:**
- ✅ Persistent connection (feels real-time)
- ✅ Simpler implementation than Realtime API
- ✅ Good balance of complexity vs UX
- ✅ Stable and reliable
- ✅ Uses cheaper Chat API
- ✅ Can add caching layer

**Cons:**
- ❌ Still slower than Realtime API
- ❌ No auto-transcription (need Whisper)
- ❌ No interruption support
- ❌ User can't interrupt assistant

**Cost:** Same as REST (~$0.02 per message)

**Implementation:**
```javascript
// Client
const client = new StreamingChatClient(onMessage, onError);
await client.connect();
await client.sendMessage(text);     // Streaming response
await client.sendAudio(audioBlob);  // Auto-transcribe + respond

// Server: Add /streaming-chat WebSocket endpoint
wss.on('connection', (ws) => {
  ws.on('message', async (msg) => {
    const { type, content } = JSON.parse(msg);
    if (type === 'text') {
      // Stream chat response
      const stream = await openai.chat.completions.create({ stream: true });
      for await (const chunk of stream) {
        ws.send(JSON.stringify({ type: 'text', content: chunk }));
      }
    }
  });
});
```

**When to use:**
- Want persistent connection experience
- Need to stay within budget
- Text conversations more common than voice
- OK with 1.5-2.5s latency
- Want stability > cutting-edge speed

---

### **Approach 3: Server-Sent Events (SSE)** ⭐ SIMPLEST

**What it is:** HTTP-based one-way streaming from server to client

**Latency:** 1.5 - 3 seconds (same as streaming, but one-way)

**How it works:**
```
Browser ─→ REST POST ─→ Server ─→ OpenAI API
                         ↓
                    Streaming response
                    ↓
           EventSource ←─ Browser
           (one-way stream)
```

**Pros:**
- ✅ Simplest to implement
- ✅ No WebSocket complexity
- ✅ HTTP-based (works through most proxies)
- ✅ Browser-native EventSource API
- ✅ Fallback to polling

**Cons:**
- ❌ One-way only (can't receive while streaming)
- ❌ Can't send voice while getting response
- ❌ No interruption
- ❌ Not truly "real-time" feel
- ❌ Multiple requests needed

**Cost:** Same as REST (~$0.02 per message)

**Implementation:**
```javascript
// Client
const eventSource = new EventSource('/api/chat-stream?message=hello');
eventSource.onmessage = (e) => {
  const { type, content } = JSON.parse(e.data);
  if (type === 'text') {
    // Update UI with streamed text
    appendText(content);
  }
};

// Server
app.get('/api/chat-stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  const stream = await openai.chat.completions.create({ stream: true });
  for await (const chunk of stream) {
    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  }
});
```

**When to use:**
- Simplicity is priority
- Text-only conversations
- Budget is tight
- Don't need interruption
- Learning/prototyping

---

## 📊 Comparison Table

| Feature | Realtime API | WebSocket + Chat | SSE |
|---------|-------------|------------------|-----|
| **Latency** | 500ms-1.5s | 1.5-2.5s | 1.5-3s |
| **Bidirectional** | ✅ Yes | ✅ Yes | ❌ No |
| **Voice Support** | ✅ Native | ⚠️ Manual | ❌ No |
| **Interruption** | ✅ Yes | ❌ No | ❌ No |
| **Cost** | $0.30/min | $0.02/msg | $0.02/msg |
| **Complexity** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| **Stability** | ⚠️ Beta | ✅ Stable | ✅ Stable |
| **Setup Time** | 4-6 hours | 2-3 hours | 30 mins |
| **Production Ready** | ✅ With fixes | ✅ Yes | ✅ Yes |

---

## 🚀 Recommended Implementation Path

### **Step 1: Start with Approach 2 (WebSocket + Chat)**
- Easiest to get working
- 1.5-2.5s latency (acceptable)
- Budget-friendly
- Can switch to Realtime later
- Takes 2-3 hours to implement

### **Step 2: Add Approach 1 (Realtime API) Later**
- For power users who want voice
- For enterprise version
- Takes additional 4-6 hours
- Can use both simultaneously

### **Step 3: Optional - Add Approach 3 (SSE)**
- For browser compatibility
- As fallback if WebSocket fails
- Minimal additional effort

---

## 💡 Implementation Recommendation

**I recommend Approach 2 (WebSocket + Streaming Chat) because:**

1. **Best bang for buck** - 80% of Realtime UX, 20% of complexity
2. **Reliable** - Uses stable Chat API, not beta
3. **Fast enough** - 1.5-2.5s is acceptable for therapy
4. **Budget-friendly** - $0.02 per message vs $0.30/min
5. **Simple to debug** - Familiar REST + WebSocket patterns
6. **Easy to scale** - Standard web architecture
7. **Can add Realtime later** - Not locked in

---

## 🔧 Quick Start: Approach 2 (WebSocket + Streaming)

### Server Code
```javascript
// server/index.js

// Add WebSocket server for streaming chat
const streamingWss = new WebSocketServer({ server, path: "/streaming-chat" });

const activeSessions = new Map();

streamingWss.on('connection', (ws) => {
  const sessionId = Date.now().toString();
  activeSessions.set(sessionId, ws);
  console.log(`✅ Client connected: ${sessionId}`);

  ws.on('message', async (data) => {
    try {
      const { type, content, includeAudio } = JSON.parse(data);

      if (type === 'text') {
        // Stream text response
        console.log(`📝 User: ${content}`);
        
        const stream = await openai.chat.completions.create({
          model: CHAT_MODEL,
          messages: [
            { role: 'system', content: THERAPIST_PROMPT },
            { role: 'user', content: content }
          ],
          stream: true,
          max_tokens: 150
        });

        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content || '';
          if (delta) {
            ws.send(JSON.stringify({
              type: 'text',
              content: delta
            }));
          }
        }

        // Optional: Send audio response
        if (includeAudio) {
          const replyText = /* accumulated text */;
          for await (const chunk of streamTextToSpeech(replyText)) {
            ws.send(JSON.stringify({
              type: 'audio',
              chunk: chunk.toString('base64')
            }));
          }
        }
      }

      else if (type === 'audio') {
        // Transcribe and respond
        const buffer = Buffer.from(content, 'base64');
        const transcription = await openai.audio.transcriptions.create({
          file: buffer,
          model: "whisper-1"
        });
        
        // Emit transcript
        ws.send(JSON.stringify({
          type: 'transcript',
          text: transcription.text
        }));

        // Then send response (same as text flow above)
      }
    } catch (err) {
      ws.send(JSON.stringify({
        type: 'error',
        message: err.message
      }));
    }
  });

  ws.on('close', () => {
    activeSessions.delete(sessionId);
    console.log(`❌ Client disconnected: ${sessionId}`);
  });
});
```

### Client Code
```typescript
// ui/src/utils/realtimeChat.ts

export class RealtimeStreamingClient {
  constructor(onMessage, onError) {
    this.onMessage = onMessage;
    this.onError = onError;
    this.ws = null;
  }

  connect() {
    this.ws = new WebSocket('ws://localhost:3001/streaming-chat');
    
    this.ws.onopen = () => {
      console.log('✅ Real-time connection established');
    };

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      
      if (message.type === 'text') {
        this.onMessage({ type: 'text', delta: message.content });
      } else if (message.type === 'audio') {
        this.onMessage({ type: 'audio', chunk: message.chunk });
      } else if (message.type === 'transcript') {
        this.onMessage({ type: 'transcript', text: message.text });
      }
    };

    this.ws.onerror = (err) => {
      this.onError('Connection error: ' + err.message);
    };
  }

  sendMessage(text, includeAudio = true) {
    this.ws.send(JSON.stringify({
      type: 'text',
      content: text,
      includeAudio
    }));
  }

  sendAudio(audioBlob) {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      this.ws.send(JSON.stringify({
        type: 'audio',
        content: base64
      }));
    };
    reader.readAsDataURL(audioBlob);
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
  }
}
```

---

## ✅ Next Steps

Would you like me to:

1. **Implement Approach 2** (WebSocket + Streaming Chat) - 2-3 hours
2. **Fix Approach 1** (Realtime API) - 3-4 hours  
3. **Provide full Approach 3** (SSE) code - 30 mins
4. **Create hybrid** (all three with fallbacks) - 6 hours

Which would you prefer? I can have a complete implementation ready for testing in your UI.
