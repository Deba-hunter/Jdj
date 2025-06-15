const express = require('express');
const fs = require('fs');
const multer = require('multer');
const { Boom } = require('@hapi/boom');
const { makeWASocket, useSingleFileAuthState, delay } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

const { state, saveState } = useSingleFileAuthState('./session/session.json');
let sock;

app.use(express.static('views'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => cb(null, 'messages.txt'),
});
const upload = multer({ storage });

// QR Code Login + Socket Setup
async function connectToWhatsApp() {
  sock = makeWASocket({
    auth: state,
    printQRInTerminal: true
  });

  sock.ev.on('connection.update', ({ connection, qr }) => {
    if (qr) qrcode.generate(qr, { small: true });
    if (connection === 'close') {
      connectToWhatsApp();
    }
  });

  sock.ev.on('creds.update', saveState);
}

connectToWhatsApp();

// Serve HTML page
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/views/index.html');
});

// Upload and Start Messaging
app.post('/start', upload.single('messageFile'), async (req, res) => {
  const number = req.body.number;
  const delaySec = parseInt(req.body.delay) * 1000;
  const filePath = path.join(__dirname, 'uploads', 'messages.txt');

  if (!fs.existsSync(filePath)) {
    return res.status(400).send('Message file not found');
  }

  const messages = fs.readFileSync(filePath, 'utf-8').split('\n').filter(line => line.trim());

  async function sendLoop() {
    while (true) {
      for (const msg of messages) {
        const jid = number.includes('@s.whatsapp.net') ? number : `${number}@s.whatsapp.net`;
        await sock.sendMessage(jid, { text: msg });
        console.log(`Sent: ${msg}`);
        await delay(delaySec);
      }
    }
  }

  sendLoop(); // Infinite loop
  res.send('Message sending started!');
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
