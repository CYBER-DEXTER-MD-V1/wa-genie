// index.js
const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { default: pino } = require('pino');
const askGPT = require('./ai');

async function startBot() {
  // Load the authentication state from the file system
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  
  // Fetch the latest Baileys version
  const { version } = await fetchLatestBaileysVersion();

  // Create the socket instance for WhatsApp
  const sock = makeWASocket({
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false, // No QR code shown on console
    auth: state,
    version,
    browser: ['WA-GENIE', 'Chrome', '1.0'],
    getMessage: async () => ({ conversation: '💬' }), // Default message if empty
  });

  // Pairing Code method
  if (!sock.authState.creds.registered) {
    console.log('📲 Go to WhatsApp -> Linked Devices -> Link a Device');
    const code = await sock.requestPairingCode('YOUR_PHONE_NUMBER'); // Replace with your number
    console.log(`🔗 Pairing Code: ${code}`);
  }

  // Save credentials on updates
  sock.ev.on('creds.update', saveCreds);

  // Listen for new messages
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const from = msg.key.remoteJid;
    const body = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

    // Handle ".ai" command to trigger GPT-3
    if (body.startsWith('.ai ')) {
      const prompt = body.slice(4);
      const reply = await askGPT(prompt);
      await sock.sendMessage(from, { text: reply }, { quoted: msg });
    }
  });
}

startBot();
