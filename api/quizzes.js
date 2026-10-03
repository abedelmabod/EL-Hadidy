export default async function handler(req, res) {
  try {
    const { default: handleQuiz } = await import('./_quiz-handler.js');
    return await handleQuiz(req, res);
  } catch (error) {
    console.error('Quiz function startup failure:', error);
    if (!res.headersSent) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(503).json({ error: 'Quiz service is temporarily unavailable.', code: error.code || error.name || 'unknown', detail: String(error.message || '').slice(0, 240) });
    }
  }
}
