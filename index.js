const express = require('express');
const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');

// Initialize the Express app
const app = express();
const port = 3000;

// Middleware to parse form data and JSON
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Serve the main page where the user can initiate the login process
app.get('/', (req, res) => {
  res.send(`
    <html>
      <body>
        <h1>WhatsApp Bot Login</h1>
        <form action="/login" method="POST">
          <label for="phone">Enter your phone number:</label>
          <input type="text" id="phone" name="phone" required>
          <button type="submit">Start Login</button>
        </form>
      </body>
    </html>
  `);
});

// Handle the form submission to generate a pairing code
app.post('/login', async (req, res) => {
  const { phone } = req.body;  // Get the phone number from the form input
  console.log('Phone number received:', phone);

  // Set up multi-file authentication state (to store WhatsApp login details)
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  const { version } = await fetchLatestBaileysVersion();

  // Create the WhatsApp socket
  const sock = makeWASocket({
    logger: pino({ level: 'silent' }),  // Disable logging
    printQRInTerminal: false,  // Disable QR code display in terminal
    auth: state,
    version,
    browser: ['WA-GENIE', 'Chrome', '1.0'],
    getMessage: async () => ({ conversation: '💬' }),  // Default message handler
  });

  // Generate QR code when pairing is required
  sock.ev.on('qr', (qr) => {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(qr)}&size=200x200`;
    res.send(`
      <html>
        <body>
          <h1>Scan this QR Code to Login</h1>
          <p>Phone Number: ${phone}</p>
          <h2>Scan the QR Code with WhatsApp</h2>
          <img src="${qrUrl}" alt="QR Code" />
          <p>Go to WhatsApp -> Linked Devices -> Link a Device</p>
          <p>Once you've scanned, the bot will be ready to use.</p>
        </body>
      </html>
    `);  // Show QR code on webpage
  });

  // After scanning the QR code, WhatsApp will connect and handle further actions
  sock.ev.on('open', () => {
    console.log('Bot is now connected');
    res.send(`
      <html>
        <body>
          <h1>Successfully Logged In</h1>
          <p>Your WhatsApp account is now paired with the bot!</p>
          <p>You can now interact with the bot.</p>
        </body>
      </html>
    `);  // Inform user of successful login
  });

  // Handle connection errors
  sock.ev.on('close', () => {
    console.log('Connection closed');
    res.send(`
      <html>
        <body>
          <h1>Connection Closed</h1>
          <p>Your session was closed. Please try logging in again.</p>
        </body>
      </html>
    `);  // Notify user if connection is lost
  });
});

// Start the Express server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
