const express = require('express');
const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');

// Initialize the Express app
const app = express();
const port = 3000;

// Middleware to parse form data and JSON
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Serve the main page where the user can input their phone number
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

// Handle the form submission to generate a pairing code
app.post('/generate-pairing-code', async (req, res) => {
  const { phone } = req.body;  // Get the phone number from the form input
  console.log('Phone number received:', phone);

  const { state, saveCreds } = await useMultiFileAuthState('auth_info');  // Handle authentication state
  const { version } = await fetchLatestBaileysVersion();  // Fetch the latest Baileys version

  // Create the WhatsApp socket
  const sock = makeWASocket({
    logger: pino({ level: 'silent' }),  // Disable logging
    printQRInTerminal: false,  // Disable QR code display in terminal
    auth: state,
    version,
    browser: ['WA-GENIE', 'Chrome', '1.0'],
    getMessage: async () => ({ conversation: '💬' }),  // Default message handler
  });

  // If the device is not registered, request a pairing code
  try {
    if (!sock.authState.creds.registered) {
      sock.ev.on('qr', (qr) => {
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(qr)}&size=200x200`;
        res.send(`
          <html>
            <body>
              <h1>WhatsApp Bot Pairing</h1>
              <p>Phone Number: ${phone}</p>
              <h2>Scan the QR Code with WhatsApp</h2>
              <img src="${qrUrl}" alt="QR Code" />
              <p>Go to WhatsApp -> Linked Devices -> Link a Device</p>
              <a href="/">Try again</a>
            </body>
          </html>
        `);  // Display the QR code on the page
      });
    } else {
      res.status(400).send('Device already registered');
    }
  } catch (error) {
    console.error('Error generating pairing code:', error);
    res.status(500).send('Error generating pairing code');
  }
});

// Start the Express server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
