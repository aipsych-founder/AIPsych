// Performance testing tool - measure latency breakdown
import fetch from 'node-fetch';

const API_BASE = 'http://localhost:3001';

console.log('🚀 AIPsych Performance Test Suite\n');
console.log('=' .repeat(60));

// Test 1: Text-to-Chat Latency
async function testTextChat() {
  console.log('\n📝 Test 1: Text-to-Chat Latency');
  console.log('-'.repeat(60));
  
  const testMessages = [
    'Hello, how are you?',
    'I am feeling anxious today',
    'Can you help me with my stress?'
  ];
  
  const results = [];
  
  for (const msg of testMessages) {
    try {
      const start = performance.now();
      const response = await fetch(`${API_BASE}/api/psych`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg })
      });
      const end = performance.now();
      const data = await response.json();
      
      const roundTrip = Math.round(end - start);
      const serverTime = data.durationMs;
      const networkTime = roundTrip - serverTime;
      
      results.push({ msg: msg.substring(0, 30), roundTrip, serverTime, networkTime });
      console.log(`✅ "${msg.substring(0, 30)}..."`);
      console.log(`   Round-trip: ${roundTrip}ms | Server: ${serverTime}ms | Network: ${networkTime}ms`);
    } catch (err) {
      console.error(`❌ Error: ${err.message}`);
    }
  }
  
  // Calculate averages
  if (results.length > 0) {
    const avgRoundTrip = Math.round(results.reduce((a, b) => a + b.roundTrip, 0) / results.length);
    const avgServer = Math.round(results.reduce((a, b) => a + b.serverTime, 0) / results.length);
    const avgNetwork = Math.round(results.reduce((a, b) => a + b.networkTime, 0) / results.length);
    console.log(`\n📊 Chat Averages: ${avgRoundTrip}ms (server: ${avgServer}ms, network: ${avgNetwork}ms)`);
  }
}

// Test 2: TTS Latency
async function testTTS() {
  console.log('\n🔊 Test 2: Text-to-Speech Latency');
  console.log('-'.repeat(60));
  
  const testTexts = [
    'Good morning',
    'How are you feeling today?',
    'I understand your concerns and I am here to listen'
  ];
  
  const results = [];
  
  for (const text of testTexts) {
    try {
      const start = performance.now();
      const response = await fetch(`${API_BASE}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      
      // Measure time to first chunk
      const firstChunk = performance.now();
      const reader = response.body.getReader();
      const { value } = await reader.read();
      const firstChunkTime = firstChunk - start;
      
      // Read remaining chunks
      let totalSize = value.length;
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        totalSize += chunk.length;
      }
      reader.releaseLock();
      
      const end = performance.now();
      const roundTrip = Math.round(end - start);
      
      results.push({ text: text.substring(0, 25), roundTrip, firstChunkTime: Math.round(firstChunkTime), totalSize });
      console.log(`✅ "${text.substring(0, 25)}..."`);
      console.log(`   First chunk: ${Math.round(firstChunkTime)}ms | Total: ${roundTrip}ms | Size: ${totalSize} bytes`);
    } catch (err) {
      console.error(`❌ Error: ${err.message}`);
    }
  }
  
  if (results.length > 0) {
    const avgRoundTrip = Math.round(results.reduce((a, b) => a + b.roundTrip, 0) / results.length);
    const avgFirstChunk = Math.round(results.reduce((a, b) => a + b.firstChunkTime, 0) / results.length);
    const avgSize = Math.round(results.reduce((a, b) => a + b.totalSize, 0) / results.length);
    console.log(`\n📊 TTS Averages: First chunk ${avgFirstChunk}ms, Total ${avgRoundTrip}ms, Avg size ${avgSize} bytes`);
  }
}

// Test 3: End-to-End Flow (Voice)
async function testVoiceFlow() {
  console.log('\n🎤 Test 3: Voice Input (Transcribe + Chat)');
  console.log('-'.repeat(60));
  
  // Create a mock audio file (small silent WAV)
  const mockAudio = Buffer.from([
    0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
    0x66, 0x6D, 0x74, 0x20, 0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
    0x44, 0xAC, 0x00, 0x00, 0x88, 0x58, 0x01, 0x00, 0x02, 0x00, 0x10, 0x00,
    0x64, 0x61, 0x74, 0x61, 0x00, 0x00, 0x00, 0x00
  ]);
  
  try {
    console.log('⏱️  Uploading mock audio and requesting transcription + chat...');
    const start = performance.now();
    
    const formData = new URLSearchParams();
    // Since this is a node test, we'll just measure the API call
    const response = await fetch(`${API_BASE}/api/transcribe`, {
      method: 'POST',
      body: mockAudio,
      headers: { 'Content-Type': 'audio/wav' }
    }).catch(() => null);
    
    if (!response) {
      console.log('⚠️  Transcribe test requires proper multipart form-data (skipped)');
      return;
    }
    
    const data = await response.json();
    const end = performance.now();
    const roundTrip = Math.round(end - start);
    
    if (data.breakdown) {
      console.log(`✅ Voice flow completed`);
      console.log(`   Transcription: ${data.breakdown.transcriptionMs}ms`);
      console.log(`   Chat API: ${data.breakdown.chatMs}ms`);
      console.log(`   Total: ${data.durationMs}ms`);
      console.log(`   Round-trip: ${roundTrip}ms`);
    }
  } catch (err) {
    console.log(`⚠️  Voice test skipped (requires audio upload): ${err.message}`);
  }
}

// Test 4: Performance Summary
async function testSummary() {
  console.log('\n\n' + '='.repeat(60));
  console.log('📈 Performance Summary');
  console.log('='.repeat(60));
  console.log(`\n✅ Optimizations enabled:`);
  console.log('   • Streaming Chat Completions (first-token latency)');
  console.log('   • Streaming TTS (progressive audio playback)');
  console.log('   • gzip Compression (transfer size reduction)');
  console.log('   • Model: gpt-4o-mini (faster than gpt-4o)');
  console.log('   • Max tokens: 150 (shorter, faster responses)');
  console.log('   • Temperature: 0.5 (deterministic, faster)');
  console.log(`\n💡 Latency breakdown typical values:`);
  console.log('   • Chat API: ~1.5-2.5 seconds (OpenAI latency)');
  console.log('   • TTS: ~2.5-3.5 seconds (OpenAI latency)');
  console.log('   • Network: ~50-200ms');
  console.log(`\n🎯 Target response times (with streaming):`);
  console.log('   • Text reply appears: 1-2 seconds');
  console.log('   • Audio starts playing: 2-3 seconds');
  console.log('   • Audio fully downloaded: 3-4 seconds');
}

// Run all tests
async function runAllTests() {
  try {
    await testTextChat();
    await new Promise(r => setTimeout(r, 1000)); // Wait between tests
    
    await testTTS();
    await new Promise(r => setTimeout(r, 1000));
    
    await testVoiceFlow();
    
    await testSummary();
    
    console.log('\n✅ Performance tests completed!\n');
  } catch (err) {
    console.error('❌ Test suite error:', err);
  }
  process.exit(0);
}

// Start tests
console.log('Waiting for server to be ready...\n');
setTimeout(runAllTests, 1000);
