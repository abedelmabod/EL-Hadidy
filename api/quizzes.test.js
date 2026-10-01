import test from 'node:test';
import assert from 'node:assert/strict';
import handler from './quizzes.js';

function response() {
  return {
    statusCode: 200,
    headers: {},
    setHeader(key, value) { this.headers[key] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
  };
}

test('quiz API rejects unauthenticated reads before database access', async () => {
  const res = response();
  await handler({ method: 'GET', headers: {}, query: { action: 'quiz', lessonId: 'x' } }, res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.headers['Cache-Control'], 'no-store');
});

test('quiz API rejects unsupported methods', async () => {
  const res = response();
  await handler({ method: 'DELETE', headers: {} }, res);
  assert.equal(res.statusCode, 405);
});
