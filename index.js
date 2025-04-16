const express = require('express');
const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const { default: pino } = require('pino');
const axios = require('axios');
const askGPT = require('./ai');  // OpenAI GPT-3 for text-based queries

// Initialize Express
const app = express();
const port = 3000;

// Middleware for parsing form data
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

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

// Express route to serve the main page
app.get('/', (req, res) => {
  res.send(`
    <html>
      <body>
        <h1>WhatsApp Bot Pairing</h1>
        <form action="/generate-pairing-code" method="POST">
          <label for="phone">Enter your phone number:</label>
          <input type="text" id="phone" name="phone" required>
          <button type="submit">Generate Pairing Code</button>
        </form>
        <h2>Pairing Code: <span id="pairingCode">Waiting...</span></h2>
      </body>
    </html>
  `);
});

// Express route to generate pairing code after phone number is provided
app.post('/generate-pairing-code', async (req, res) => {
  const { phone } = req.body;  // Get the phone number or input from the user
  console.log('Phone number received:', phone);

  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,  // Disable QR Code in terminal
    auth: state,
    version,
    browser: ['WA-GENIE', 'Chrome', '1.0'],
    getMessage: async () => ({ conversation: '💬' }),  // Default reply message
  });

  // If device is not registered, request a pairing code
  if (!sock.authState.creds.registered) {
    try {
      const code = await sock.requestPairingCode();
      res.send(`
        <html>
          <body>
            <h1>WhatsApp Bot Pairing</h1>
            <p>Phone Number: ${phone}</p>
            <h2>Pairing Code: <strong>${code}</strong></h2>
            <p>Go to WhatsApp -> Linked Devices -> Link a Device</p>
            <a href="/">Try again</a>
          </body>
        </html>
      `);  // Display the pairing code after submission
    } catch (error) {
      console.error('Error generating pairing code:', error);
      res.status(500).send('Error generating pairing code');
    }
  } else {
    res.status(400).send('Already registered');
  }
});

// Start the Express server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

// Bot's connection setup
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,  // Disable QR Code in terminal
    auth: state,
    version,
    browser: ['WA-GENIE', 'Chrome', '1.0'],
    getMessage: async () => ({ conversation: '💬' }),  // Default reply message
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut;
      console.log('Connection closed. Reconnecting...', shouldReconnect);
      if (shouldReconnect) {
        startBot();  // Reconnect on error
      } else {
        console.error('Connection error:', lastDisconnect.error);
      }
    }
    console.log('Connection update:', update);
  });

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

// Start the bot
startBot().catch(console.error);
