import WebSocket from 'ws';

const URL = 'ws://localhost:3001/realtime';

const ws = new WebSocket(URL);
let messagesSent = 0;

ws.on('open', () => {
  console.log('Connected to proxy');
});

ws.on('message', (data) => {
  try {
    const msg = JSON.parse(data.toString());
    
    // Log the message type and key fields
    if (msg.type === 'session.created') {
      console.log('[session.created] ready');
      
      // Wait a moment, then send a simple test message
      setTimeout(() => {
        console.log('Sending text message...');
        ws.send(JSON.stringify({
          type: 'conversation.item.create',
          item: {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: 'Hi' }]
          }
        }));
        
        // Request response
        setTimeout(() => {
          ws.send(JSON.stringify({
            type: 'response.create',
            response: { modalities: ['text'] }
          }));
        }, 100);
      }, 500);
    } else if (msg.type === 'response.text.delta' && msg.delta) {
      process.stdout.write(msg.delta);
    } else if (msg.type === 'response.done') {
      console.log('\n[response.done]');
      setTimeout(() => ws.close(), 1000);
    } else if (msg.type === 'error') {
      console.error('\n[error]', msg.error?.message || '(unknown)');
      console.error('Full error:', JSON.stringify(msg.error, null, 2));
      setTimeout(() => ws.close(), 500);
    }
  } catch (err) {
    console.log('Parse error:', err.message);
  }
});

ws.on('close', () => {
  console.log('\nClosed');
  process.exit(0);
});

ws.on('error', (e) => {
  console.error('WebSocket error', e);
  process.exit(1);
});

// Auto-close after 20 seconds
setTimeout(() => {
  console.log('\n[Timeout]');
  ws.close();
}, 20000);
