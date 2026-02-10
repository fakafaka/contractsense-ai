import fetch from 'node-fetch';

const API_URL = 'http://localhost:3000/trpc';

async function testAnalysis() {
  try {
    console.log('Making analyzeText request...');
    const response = await fetch(`${API_URL}/contracts.analyzeText`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Test Contract',
        text: 'This is a test employment agreement. The employee shall work 40 hours per week. The employer may terminate employment at any time with 30 days notice.'
      })
    });

    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));
    
    const text = await response.text();
    console.log('\n=== RESPONSE BODY ===');
    console.log(text);
    
    try {
      const json = JSON.parse(text);
      console.log('\n=== PARSED JSON ===');
      console.log(JSON.stringify(json, null, 2));
    } catch (e) {
      console.log('(Not JSON)');
    }
  } catch (error) {
    console.error('Request failed:', error);
  }
}

testAnalysis();
