import test from 'node:test';
import assert from 'node:assert/strict';
import { getQuizChapters, getQuizSubjects, getQuizVideos } from '../src/quiz-content.js';

const sameYear = (a, b) => a === b;
const subjects = [
  { id: 'college', name: 'تشريح', year: 'الفرقة الأولى' },
  { id: 'school', name: 'أحياء', year: 'الصف الأول الثانوي' },
];
const chapters = {
  college: [{ id: 'chapter-1', name: 'مقدمة', year: 'الفرقة الأولى', order: 0 }],
  school: [{ id: 'chapter-2', name: 'الخلية', year: 'الصف الأول الثانوي', order: 0 }],
};
const lessons = [
  { id: 'college-video', title: 'الفيديو الأول', year: 'الفرقة الأولى', subjectId: 'college', chapterId: 'chapter-1', url: 'https://example.com/video', order: 0 },
  { id: 'school-video', title: 'الفيديو الثاني', year: 'الصف الأول الثانوي', subjectId: 'school', chapterId: 'chapter-2', url: 'https://example.com/video', order: 0 },
  { id: 'college-pdf', title: 'ملف فقط', year: 'الفرقة الأولى', subjectId: 'college', chapterId: 'chapter-1', pdfUrl: 'https://example.com/file' },
  { id: 'college-old', title: 'فيديو قديم', year: 'الفرقة الأولى', subject: 'تشريح', url: 'https://example.com/video' },
];

test('quiz picker limits subjects and videos to the selected year', () => {
  assert.deepEqual(getQuizSubjects(subjects, chapters, lessons, 'الفرقة الأولى', sameYear).map((item) => item.id), ['college']);
  assert.deepEqual(getQuizVideos(lessons, 'الفرقة الأولى', subjects[0], sameYear).map((item) => item.id), ['college-video', 'college-old']);
});

test('quiz picker includes ungrouped videos without mixing chapters', () => {
  const videos = getQuizVideos(lessons, 'الفرقة الأولى', subjects[0], sameYear);
  const groups = getQuizChapters(chapters, subjects[0], 'الفرقة الأولى', videos, sameYear);
  assert.deepEqual(groups.map((item) => [item.name, item.lessonIds]), [
    ['مقدمة', ['college-video']],
    ['فيديوهات بدون شابتر', ['college-old']],
  ]);
});
