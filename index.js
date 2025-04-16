const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { default: pino } = require('pino');
const axios = require('axios');
const askGPT = require('./ai');  // OpenAI GPT-3 for text-based queries

// DALL-E Image generation function
async function generateImage(prompt) {
  try {
    const response = await axios.post(
      'https://api.openai.com/v1/images/generations', // DALL·E endpoint for image generation
      {
        model: 'dall-e-2',  // Choose DALL·E 2 model or any other available
        prompt: prompt,
        n: 1,  // Number of images to generate
        size: '1024x1024'  // Image size
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data.data[0].url;  // Return the URL of the generated image
  } catch (error) {
    console.error('Error generating image:', error);
    return 'Sorry, I couldn’t generate the image.';
  }
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  const { version } = await fetchLatestBaileysVersion();
  
  const sock = makeWASocket({
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,  // No QR Code in terminal
    auth: state,
    version,
    browser: ['WA-GENIE', 'Chrome', '1.0'],
    getMessage: async () => ({ conversation: '💬' }),  // Default reply message
  });

  if (!sock.authState.creds.registered) {
    console.log('📲 Go to WhatsApp -> Linked Devices -> Link a Device');
    const code = await sock.requestPairingCode('YOUR_PHONE_NUMBER');  // Replace with your phone number
    console.log(`🔗 Pairing Code: ${code}`);
  }

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const from = msg.key.remoteJid;
    const body = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

    // Handle ".ai" command for GPT-3
    if (body.startsWith('.ai ')) {
      const prompt = body.slice(4);
      const reply = await askGPT(prompt);
      await sock.sendMessage(from, { text: reply }, { quoted: msg });
    }

    // Handle ".img" command for image generation
    if (body.startsWith('.img ')) {
      const prompt = body.slice(5);  // Get the prompt after ".img "
      const imageUrl = await generateImage(prompt);  // Call DALL·E or other API
      await sock.sendMessage(from, { text: imageUrl }, { quoted: msg });  // Send the image URL
    }
  });
}

startBot();
