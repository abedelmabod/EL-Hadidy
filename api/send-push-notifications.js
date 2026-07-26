const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const allowedOrigins = new Set([
  'https://el-hadidy-ei6w.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

const setCorsHeaders = (req, res) => {
  const origin = req.headers.origin;
  if (allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
};

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];

    if (!messages.length) {
      return res.status(400).json({ error: 'No push messages were provided.' });
    }

    if (messages.length > 100) {
      return res.status(400).json({ error: 'Expo accepts a maximum of 100 messages per request.' });
    }

    const expoResponse = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    const text = await expoResponse.text();
    let payload = null;

    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { raw: text };
    }

    if (!expoResponse.ok) {
      return res.status(expoResponse.status).json({
        error: 'Expo Push API request failed.',
        details: payload,
      });
    }

    return res.status(200).json(payload);
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to send push notifications.',
      message: error?.message || String(error),
    });
  }
}
