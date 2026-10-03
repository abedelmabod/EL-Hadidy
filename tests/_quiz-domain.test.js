import test from 'node:test';
import assert from 'node:assert/strict';
import { activeCodeGrantsAccess, gradeAnswers, normalizeYear, publicQuestions, reviewSchedule, validateQuizInput } from '../api/_quiz-domain.js';

test('year normalization accepts Arabic variants', () => {
  assert.equal(normalizeYear('الفرقة الأولى'), normalizeYear('الفرقه الاولي'));
});

test('revoked codes cannot grant access even for their original student', () => {
  const student = { id: 'student-1', usedCodes: ['12345'] };
  const code = { code: '12345', usedById: 'student-1', year: 'الفرقة الأولى', isUsed: true };
  assert.equal(activeCodeGrantsAccess(code, student, 'الفرقة الأولى'), true);
  assert.equal(activeCodeGrantsAccess({ ...code, revoked: true }, student, 'الفرقة الأولى'), false);
  assert.equal(activeCodeGrantsAccess({ ...code, usedById: 'someone-else' }, student, 'الفرقة الأولى'), false);
  assert.equal(activeCodeGrantsAccess(code, student, 'الفرقة الثانية'), false);
});

test('quiz validates four complete options and a valid answer', () => {
  const valid = { title: 'المحاضرة الأولى', questions: [{ prompt: 'اختر', options: ['أ', 'ب', 'ج', 'د'], answerIndex: 2 }] };
  assert.equal(validateQuizInput(valid).questions.length, 1);
  assert.throws(() => validateQuizInput({ ...valid, questions: [{ ...valid.questions[0], answerIndex: 4 }] }));
});

test('grading rejects incomplete answers and counts wrong question IDs', () => {
  const questions = [{ id: 'a', answer_index: 1 }, { id: 'b', answer_index: 2 }];
  assert.deepEqual(gradeAnswers(questions, [1, 0]), { correct: 1, total: 2, wrongIds: ['b'] });
  assert.throws(() => gradeAnswers(questions, [1]));
});

test('public questions do not contain answer keys', () => {
  const result = publicQuestions([{ id: 'a', prompt: 'سؤال', options_json: '["أ","ب","ج","د"]', answer_index: 1, explanation: 'سبب' }]);
  assert.deepEqual(Object.keys(result[0]).sort(), ['id', 'options', 'prompt']);
});

test('reviews are due after one, three, and seven days', () => {
  assert.deepEqual(reviewSchedule(0), [86400000, 259200000, 604800000].map((value) => new Date(value).toISOString()));
});
