const hasVideo = (lesson) => Boolean(lesson.url || lesson.videoUrl || lesson.bunnyVideoId);

const belongsToSubject = (lesson, subject) => lesson.subjectId
  ? lesson.subjectId === subject.id
  : lesson.subject === subject.name;

export function getQuizSubjects(subjects, chaptersBySubject, lessons, year, isSameYear) {
  return subjects.filter((subject) => {
    const years = [subject.year, subject.accessYear, subject.grade, subject.stage,
      ...(Array.isArray(subject.years) ? subject.years : []),
      ...(Array.isArray(subject.accessYears) ? subject.accessYears : [])];
    return years.some((value) => isSameYear(value, year))
      || (chaptersBySubject[subject.id] || []).some((chapter) => isSameYear(chapter.year, year))
      || lessons.some((lesson) => hasVideo(lesson) && isSameYear(lesson.year, year) && belongsToSubject(lesson, subject));
  });
}

export function getQuizVideos(lessons, year, subject, isSameYear) {
  if (!subject) return [];
  return lessons.filter((lesson) => lesson.id && hasVideo(lesson)
    && isSameYear(lesson.year, year) && belongsToSubject(lesson, subject))
    .sort((a, b) => {
      const first = Number(a.order ?? a.sortOrder ?? a.lessonOrder);
      const second = Number(b.order ?? b.sortOrder ?? b.lessonOrder);
      if (Number.isFinite(first) && Number.isFinite(second)) return first - second;
      if (Number.isFinite(first)) return -1;
      if (Number.isFinite(second)) return 1;
      return String(a.title || '').localeCompare(String(b.title || ''), 'ar');
    });
}

export function getQuizChapters(chaptersBySubject, subject, year, videos, isSameYear) {
  if (!subject) return [];
  const result = (chaptersBySubject[subject.id] || [])
    .filter((chapter) => isSameYear(chapter.year, year))
    .sort((a, b) => Number(a.order ?? 999) - Number(b.order ?? 999))
    .map((chapter) => ({ ...chapter, lessonIds: [] }));

  for (const video of videos) {
    let chapter = result.find((item) => video.chapterId
      ? item.id === video.chapterId
      : video.chapterName && item.name === video.chapterName);
    if (!chapter) {
      const key = `missing:${video.chapterId || video.chapterName || 'none'}`;
      chapter = result.find((item) => item.id === key);
      if (!chapter) {
        chapter = { id: key, name: video.chapterName || 'فيديوهات بدون شابتر', lessonIds: [] };
        result.push(chapter);
      }
    }
    chapter.lessonIds.push(video.id);
  }
  return result;
}
