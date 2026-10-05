# Device security rollout

The Android and iOS mobile builds require `/api/device-session` on the same
API base URL as quizzes. Deploy the server before distributing the mobile build.
Existing Firebase Admin and Turso environment variables are reused; no database
token or service account is included in the app.

The schema is created by `getDatabase()`. A write transaction binds one installation
per Firebase UID. Both installation ID and a cryptographic secret are required.
Only SHA-256 hashes are stored in Turso; the secret is stored in the device's
SecureStore using a device-only iOS keychain accessibility policy. The first legacy
Firestore device is preserved during migration. Accounts previously allowed more
than one device now require administrator reset to move to another installation.

Administrator and support reset buttons clear legacy fields and the Turso binding.
Resetting atomically revokes the old proof and deletes its binding. That old
installation cannot rebind itself on restart. A new installation/device can bind;
the administrator reset does not transfer credentials.
The official app checks at login, foreground resume, every 60 seconds, and at
protected quiz/study-plan API requests. A failed verification blocks playback.
Network failures fail closed and are retried. No heartbeat writes to Firestore.
Firebase Auth token verification and initial profile reads remain in use.

Old mobile and Windows builds without device-proof headers cannot use student
quiz/study-plan endpoints after this server deployment. Coordinate the rollout;
do not deploy this change by itself without communicating the required update.

Android sets FLAG_SECURE and denies audio playback capture through both the
manifest and AudioManager. iOS uses Expo's window capture protection plus a local
native capture-state module to pause/mute video and protect the app switcher.
This requires NEW native Android/iOS builds, not Expo Go or an OTA-only update.

Before release, test on physical Android and iOS devices: screenshots, recording
with internal audio, recording already active before launch, full screen, app
switcher, background/resume, simultaneous sign-ins, lost network, reset followed
by a new device login, and restoring a backup onto another device. iOS native
compilation must be verified on macOS or EAS.

This is not DRM or hardware attestation. Rooted/jailbroken clients can defeat
local protections. Open Firestore rules and unsigned Bunny links are separate,
unresolved bypasses. The binding does not secure direct Firestore/CDN access
from modified or old clients; fix those before claiming platform-wide enforcement.
