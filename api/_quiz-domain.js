export const REVIEW_DAYS = [1, 3, 7];

export function normalizeYear(value = '') {
  return String(value || '')
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 1776))
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function activeCodeGrantsAccess(code, student, requestedYear) {
  if (!code || code.isActive === false || code.disabled === true || code.revoked === true || code.isStopped === true || code.isUsed === false) return false;
  const studentId = String(student.id || '');
  const usedCodes = Array.isArray(student.usedCodes) ? student.usedCodes : [student.usedCode];
  const matchesOwner = code.usedById
    ? String(code.usedById) === studentId
    : usedCodes.some((value) => !!value && String(value).replace(/\D/g, '') === String(code.code || '').replace(/\D/g, ''));
  return !!matchesOwner && normalizeYear(code.year || code.accessYear || code.codeYear) === normalizeYear(requestedYear);
}

export function validateQuizInput(input) {
  const title = String(input?.title || '').trim();
  const questions = input?.questions;
  if (!title || title.length > 140) throw new Error('عنوان الاختبار مطلوب (بحد أقصى 140 حرفًا).');
  if (!Array.isArray(questions) || questions.length < 1 || questions.length > 30) throw new Error('أضف من سؤال إلى 30 سؤالًا.');
  return { title, questions: questions.map((item, index) => {
    const prompt = String(item?.prompt || '').trim();
    const options = Array.isArray(item?.options) ? item.options.map((option) => String(option || '').trim()) : [];
    const answerIndex = Number(item?.answerIndex);
    const explanation = String(item?.explanation || '').trim();
    if (!prompt || prompt.length > 1000 || options.length !== 4 || options.some((option) => !option || option.length > 400)
      || !Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 3 || explanation.length > 1000) {
      throw new Error(`راجع بيانات السؤال رقم ${index + 1}.`);
    }
    return { prompt, options, answerIndex, explanation };
  }) };
}

export function gradeAnswers(questions, answers) {
  if (!Array.isArray(answers) || answers.length !== questions.length || answers.some((answer) => !Number.isInteger(answer) || answer < 0 || answer > 3)) {
    throw new Error('اختر إجابة واحدة لكل سؤال.');
  }
  const wrongIds = questions.filter((question, index) => question.answer_index !== answers[index]).map((question) => question.id);
  return { correct: questions.length - wrongIds.length, total: questions.length, wrongIds };
}

export function publicQuestions(rows) {
  return rows.map((row) => ({
    id: row.id,
    prompt: row.prompt,
    options: JSON.parse(row.options_json),
  }));
}

export function reviewSchedule(now = Date.now()) {
  return REVIEW_DAYS.map((days) => new Date(now + days * 86400000).toISOString());
}
