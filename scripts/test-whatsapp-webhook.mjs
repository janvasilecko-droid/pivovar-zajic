#!/usr/bin/env node

/**
 * Test script for WhatsApp webhook integration
 * Usage: node scripts/test-whatsapp-webhook.mjs
 */

try {
  await import('dotenv/config');
} catch {
  // dotenv is optional — env vars can be provided from the shell instead
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'your-anon-key';

const WEBHOOK_URL = `${SUPABASE_URL}/functions/v1/whatsapp-webhook`;

// Test data - realistic WhatsApp order messages
const testMessages = [
  {
    sender: "Hospoda U Zajíce",
    senderNumber: "+420123456789",
    message: "Ahoj sládku, na čtvrtek potřebujeme:\n2x 12° světlý ležák 50l\n1x 13° jantar 30l\nDíky!",
    timestamp: new Date().toISOString(),
    webhookId: `test-${Date.now()}-1`,
  },
  {
    sender: "Restaurace Na Růžku",
    senderNumber: "+420987654321",
    message: "Dobrý den, objednávám na pondělí:\n3x 11° světlý 30l\n1x 13° jantar 50l\nProsím o dodání do 14:00",
    timestamp: new Date().toISOString(),
    webhookId: `test-${Date.now()}-2`,
  },
  {
    sender: "Pivnice U Dvou Sudů",
    senderNumber: "+420555666777",
    message: "Na středu:\n1x 12° světlý 50l\n2x 13° jantar 30l\nPříjezd do 15:00",
    timestamp: new Date().toISOString(),
    webhookId: `test-${Date.now()}-3`,
  },
];

async function testWebhook(messageData) {
  console.log(`\n📤 Sending test message from: ${messageData.sender}`);
  console.log(`Message: ${messageData.message.substring(0, 50)}...`);
  
  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(messageData),
    });
    
    const data = await response.json();
    
    console.log(`Status: ${response.status} ${response.statusText}`);
    console.log('Response:', JSON.stringify(data, null, 2));
    
    return { success: response.ok, data };
  } catch (error) {
    console.error('Error:', error.message);
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('🚀 Testing WhatsApp Webhook Integration');
  console.log('========================================');
  console.log(`Webhook URL: ${WEBHOOK_URL}`);
  console.log(`Supabase URL: ${SUPABASE_URL}`);
  
  const results = [];
  
  for (const message of testMessages) {
    const result = await testWebhook(message);
    results.push(result);
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log('\n📊 Test Summary');
  console.log('==============');
  
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log(`Total tests: ${results.length}`);
  console.log(`Successful: ${successful}`);
  console.log(`Failed: ${failed}`);
  
  if (failed > 0) {
    console.log('\n❌ Some tests failed. Check the error messages above.');
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed! WhatsApp webhook integration is working.');
    console.log('\n📝 Next steps:');
    console.log('1. Set up AutoNotification + Tasker on your Android phone');
    console.log('2. Create a Make.com scenario with the webhook trigger');
    console.log('3. Map AutoNotification data to the webhook payload');
    console.log('4. Test with real WhatsApp messages');
  }
}

// Run the tests
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});