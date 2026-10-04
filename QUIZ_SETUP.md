# Lecture quizzes (Turso)

The quiz feature does not call any AI service. Questions are written by the teacher and graded in the Vercel Function.

## Required Vercel Production environment variables

- `TURSO_DATABASE_URL`: the database URL beginning with `libsql://`.
- `TURSO_AUTH_TOKEN`: a database Read & Write token. Keep it as a server-only Secret.
- `FIREBASE_SERVICE_ACCOUNT_JSON`: the complete Firebase service-account JSON as a server-only Secret. Use the service account for the existing `el-hadidy-app` Firebase project. Do not commit the JSON file or paste it into chat.

The function creates its Turso tables on its first request. After setting variables, deploy a new Vercel Production build. The dashboard's **الاختبارات** tab can save and publish one quiz per lecture, show attempt/question analytics, pause availability, and prepare a corrected revision. Publishing a revision keeps old attempt answers, results, and due reviews tied to the original question snapshot. Each student still has only one initial attempt per lecture; a corrected revision does not grant a new attempt. The mobile app requires a new store build to show quiz and review screens. To use a different API host, configure `EXPO_PUBLIC_QUIZ_API_URL` during the mobile build; the default is the current Vercel app host.

The existing teacher username and password in Firestore are accepted through `/api/admin-session`. The server verifies the credential, limits failed attempts, exchanges it for a Firebase custom sign-in token, links the admin document by `authUid`, and replaces its plain-text `password` field with a scrypt `passwordHash` on the first successful sign-in. No manual Firebase Authentication user creation is needed. The teacher continues to use the same login form. Adding a new `password` field later replaces the previous hash on the next successful login. Deploy this API before signing in so the migrated password does not strand the older client.

Student endpoints verify Firebase ID tokens, the Firestore student profile, the lecture, and the current code status. Answer keys remain server-side until submission. Wrong answers create reviews due after 1, 3, and 7 days; questions answered correctly in a review are removed from later pending reviews. Stopping a student's code also stops quiz and review access. Draft answers are saved only on the student's current device. Review reminders are local device notifications, require notification permission, and do not sync across devices or survive an app reinstall; the in-app due count still uses server data.

Run `npm run test:quiz` and `npm run build` before deployment. Test the published, revised, and paused flows with one teacher account and at least two student accounts before release. Verify that the Vercel Production environment has all three secrets and that the admin login uses Firebase Auth.
