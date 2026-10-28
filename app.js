const express = require('express');
const https = require('https');
const http = require('http');
const { URL } = require('url');

const app = express();
const port = process.env.PORT || 3000;
const verifyToken = process.env.VERIFY_TOKEN || 'odiceus-wa-piloto-2026';
const routineUrl = process.env.ROUTINE_WEBHOOK_URL || '';
const routineKey = process.env.ROUTINE_SENDER_KEY || '';

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

function forwardToRoutine(rawBody, contentType) {
  return new Promise((resolve, reject) => {
    if (!routineUrl) {
      resolve({ skipped: true });
      return;
    }
    const u = new URL(routineUrl);
    const headers = {
      'Content-Type': contentType || 'application/json',
      'Content-Length': Buffer.byteLength(rawBody),
      Authorization: `Bearer ${routineKey}`,
      'X-Automation-Key': routineKey,
    };
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        method: 'POST',
        headers,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, body: data.slice(0, 300) }));
      }
    );
    req.on('error', reject);
    req.write(rawBody);
    req.end();
  });
}

app.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === verifyToken && challenge) {
    console.log('WEBHOOK VERIFIED');
    return res.status(200).send(String(challenge));
  }
  return res.status(403).end();
});

app.post('/', async (req, res) => {
  res.status(200).end();
  const raw =
    req.rawBody ||
    Buffer.from(JSON.stringify(req.body || {}));
  console.log('Webhook POST', new Date().toISOString(), raw.length, 'bytes');
  try {
    const fwd = await forwardToRoutine(raw, 'application/json');
    console.log('forward', fwd);
  } catch (e) {
    console.error('forward error', e.message);
  }
});

app.listen(port, () => {
  console.log(`Listening on ${port}; verify_token set=${Boolean(verifyToken)}`);
});
