import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";

const ROLE_COLLECTIONS = [
  { name: "admins", role: "admin" },
  { name: "support_team", role: "support" },
  { name: "students", role: "student" },
];

export class SharedAuthError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "SharedAuthError";
    this.code = code;
    this.details = details;
  }
}

export function normalizeIdentifier(value) {
  return normalizeEnglishDigits(value).trim().toLowerCase();
}

export function normalizeEnglishDigits(value = "") {
  return String(value || "")
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 1776));
}

export function keepEnglishDigitsOnly(value = "") {
  return normalizeEnglishDigits(value).replace(/\D/g, "");
}

export function buildAuthEmail(identifier) {
  const normalized = normalizeIdentifier(identifier);
  if (!normalized) {
    return "";
  }

  if (normalized.includes("@")) {
    return normalized;
  }

  return `${normalized}@elhadidy.app`;
}

function normalizeYear(value) {
  return String(value || "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();
}

function buildSessionUser(id, role, data, authUser = null) {
  return {
    id,
    uid: authUser?.uid || data.authUid || id,
    email: authUser?.email || data.email || buildAuthEmail(data.username),
    ...data,
    role,
  };
}

function mapQueryDocument(collectionConfig, snapshot) {
  return {
    id: snapshot.id,
    role: collectionConfig.role,
    collectionName: collectionConfig.name,
    data: snapshot.data(),
  };
}

async function findUserByIdentifier(db, identifier) {
  for (const collectionConfig of ROLE_COLLECTIONS) {
    const snapshot = await getDocs(
      query(
        collection(db, collectionConfig.name),
        where("username", "==", normalizeIdentifier(identifier))
      )
    );

    if (!snapshot.empty) {
      return mapQueryDocument(collectionConfig, snapshot.docs[0]);
    }
  }

  return null;
}

async function findUserByUid(db, uid) {
  for (const collectionConfig of ROLE_COLLECTIONS) {
    const directDoc = await getDoc(doc(db, collectionConfig.name, uid));

    if (directDoc.exists()) {
      return {
        id: directDoc.id,
        role: collectionConfig.role,
        collectionName: collectionConfig.name,
        data: directDoc.data(),
      };
    }

    const fallbackQuery = await getDocs(
      query(collection(db, collectionConfig.name), where("authUid", "==", uid))
    );

    if (!fallbackQuery.empty) {
      return mapQueryDocument(collectionConfig, fallbackQuery.docs[0]);
    }
  }

  return null;
}

function shouldFallbackToLegacy(profile, error) {
  if (!profile) {
    return false;
  }

  const code = error?.code || "";

  return (
    !code ||
    code === "auth/user-not-found" ||
    code === "auth/invalid-email" ||
    code === "auth/invalid-credential"
  );
}

function mapFirebaseAuthError(error) {
  const code = error?.code || "auth/unknown";

  if (code === "auth/invalid-credential" || code === "auth/wrong-password") {
    return new SharedAuthError(
      "INVALID_CREDENTIALS",
      "اسم المستخدم أو كلمة المرور غير صحيحة."
    );
  }

  if (code === "auth/email-already-in-use") {
    return new SharedAuthError(
      "EMAIL_IN_USE",
      "هذا المستخدم مرتبط بحساب Firebase بالفعل."
    );
  }

  if (code === "auth/weak-password") {
    return new SharedAuthError(
      "WEAK_PASSWORD",
      "كلمة المرور ضعيفة. اختر كلمة مرور أقوى."
    );
  }

  if (code === "auth/network-request-failed") {
    return new SharedAuthError(
      "NETWORK_ERROR",
      "حدثت مشكلة في الاتصال بالشبكة أثناء التواصل مع Firebase."
    );
  }

  return new SharedAuthError(
    "AUTH_ERROR",
    error?.message || "تعذر إتمام المصادقة حاليا."
  );
}

async function ensureStudentAccess(db, profile, device = {}) {
  const studentRef = doc(db, "students", profile.id);
  const studentData = profile.data;

  if (studentData.isBanned) {
    throw new SharedAuthError(
      "ACCOUNT_BANNED",
      studentData.banReason || "هذا الحساب محظور من قبل الإدارة.",
      { profile }
    );
  }

  if (
    studentData.deviceId &&
    device.id &&
    String(studentData.deviceId) !== String(device.id)
  ) {
    throw new SharedAuthError("DEVICE_MISMATCH", "هذا الحساب مرتبط بجهاز آخر.", {
      profile,
      requestedDevice: device,
    });
  }

  if (!studentData.deviceId && device.id) {
    const devicePatch = {
      deviceId: device.id,
      deviceType: device.type || null,
      deviceInfo: device.info || null,
    };

    await updateDoc(studentRef, devicePatch);

    return {
      ...studentData,
      ...devicePatch,
    };
  }

  return studentData;
}

export async function signInWithSharedCredentials(services, payload) {
  const { auth, db } = services;
  const identifier = normalizeIdentifier(payload?.identifier);
  const password = String(payload?.password || "");
  const device = payload?.device || {};

  if (!identifier || !password) {
    throw new SharedAuthError(
      "MISSING_CREDENTIALS",
      "أدخل اسم المستخدم وكلمة المرور أولا."
    );
  }

  const legacyProfile = await findUserByIdentifier(db, identifier);

  try {
    const credential = await signInWithEmailAndPassword(
      auth,
      buildAuthEmail(identifier),
      password
    );

    const resolvedProfile =
      (await findUserByUid(db, credential.user.uid)) || legacyProfile;

    if (!resolvedProfile) {
      throw new SharedAuthError(
        "PROFILE_NOT_FOUND",
        "تم تسجيل الدخول لكن لم يتم العثور على ملف المستخدم داخل Firestore."
      );
    }

    const resolvedData =
      resolvedProfile.role === "student"
        ? await ensureStudentAccess(db, resolvedProfile, device)
        : resolvedProfile.data;

    return {
      authMode: "firebase",
      user: buildSessionUser(
        resolvedProfile.id,
        resolvedProfile.role,
        resolvedData,
        credential.user
      ),
    };
  } catch (error) {
    if (
      legacyProfile &&
      shouldFallbackToLegacy(legacyProfile, error) &&
      String(legacyProfile.data.password) === password
    ) {
      const resolvedData =
        legacyProfile.role === "student"
          ? await ensureStudentAccess(db, legacyProfile, device)
          : legacyProfile.data;

      return {
        authMode: "legacy",
        user: buildSessionUser(
          legacyProfile.id,
          legacyProfile.role,
          resolvedData
        ),
      };
    }

    if (error instanceof SharedAuthError) {
      throw error;
    }

    if (legacyProfile) {
      throw new SharedAuthError(
        "INVALID_CREDENTIALS",
        "اسم المستخدم أو كلمة المرور غير صحيحة.",
        { profile: legacyProfile }
      );
    }

    throw mapFirebaseAuthError(error);
  }
}

export async function registerStudentWithCode(services, payload) {
  const { auth, db } = services;
  const name = String(payload?.name || "").trim();
  const username = normalizeIdentifier(payload?.username);
  const password = String(payload?.password || "").trim();
  const phone = keepEnglishDigitsOnly(payload?.phone);
  const year = String(payload?.year || "").trim();
  const codeValue = normalizeEnglishDigits(payload?.code).trim().toUpperCase();
  const device = payload?.device || {};

  if (!name || !username || !password || !phone || !year) {
    throw new SharedAuthError(
      "MISSING_FIELDS",
      "برجاء إدخال جميع البيانات المطلوبة."
    );
  }

  const existingUser = await findUserByIdentifier(db, username);
  if (existingUser) {
    throw new SharedAuthError("USERNAME_TAKEN", "اسم المستخدم محجوز بالفعل.");
  }

  let codeDocRef = null;
  let codeData = null;
  if (codeValue) {
    const codeSnapshot = await getDocs(
      query(collection(db, "codes"), where("code", "==", codeValue))
    );

    if (codeSnapshot.empty) {
      throw new SharedAuthError("INVALID_CODE", "الكود غير صحيح أو غير موجود.");
    }

    const codeDoc = codeSnapshot.docs[0];
    codeData = codeDoc.data();
    codeDocRef = doc(db, "codes", codeDoc.id);

    if (codeData.isUsed) {
      throw new SharedAuthError("CODE_ALREADY_USED", "هذا الكود مستخدم من قبل.");
    }

    if (codeData.year && codeData.year !== year) {
      throw new SharedAuthError("CODE_YEAR_MISMATCH", `هذا الكود مخصص لـ ${codeData.year}.`);
    }
  }

  const credential = await createUserWithEmailAndPassword(
    auth,
    buildAuthEmail(username),
    password
  );

  const accessYear = codeData?.year || year;
  const studentProfile = {
    name,
    username,
    phone,
    password,
    year,
    email: credential.user.email,
    authUid: credential.user.uid,
    isBanned: false,
    isSubscribed: Boolean(codeValue),
    usedCode: codeValue || "",
    accessYear: codeValue ? accessYear : "",
    codeYear: codeValue ? accessYear : "",
    pendingCode: "",
    codeReviewStatus: codeValue ? "approved" : "",
    deviceId: device.id || null,
    deviceType: device.type || null,
    deviceInfo: device.info || null,
    createdAt: serverTimestamp(),
  };

  const batch = writeBatch(db);
  batch.set(doc(db, "students", credential.user.uid), studentProfile);

  if (codeValue && codeDocRef) {
    batch.update(codeDocRef, {
      isUsed: true,
      usedByName: name,
      usedBy: username,
      usedById: credential.user.uid,
      usedAt: serverTimestamp(),
    });
    batch.set(doc(collection(db, "logs")), {
      studentId: credential.user.uid,
      studentName: name,
      action: `تفعيل كود تلقائي عند التسجيل لـ ${accessYear}`,
      code: codeValue,
      alertType: "code_activation",
      seen: true,
      deviceType: device.type || "Unknown",
      time: serverTimestamp(),
    });
  }

  await batch.commit();

  return {
    authMode: "firebase",
    user: buildSessionUser(
      credential.user.uid,
      "student",
      studentProfile,
      credential.user
    ),
  };
}

export function observeSharedAuthSession(services, onChange) {
  const { auth, db } = services;

  return onAuthStateChanged(auth, async (firebaseUser) => {
    if (!firebaseUser) {
      onChange(null);
      return;
    }

    const profile = await findUserByUid(db, firebaseUser.uid);
    onChange(profile ? buildSessionUser(profile.id, profile.role, profile.data, firebaseUser) : null);
  });
}

export async function signOutSharedSession(services) {
  return signOut(services.auth);
}

export async function logDeviceResetRequest(services, payload) {
  const { db } = services;

  return addDoc(collection(db, "logs"), {
    studentId: payload.studentId,
    studentName: payload.studentName,
    action: "طلب تصفير جهاز",
    deviceType: payload.deviceType || "Unknown",
    time: serverTimestamp(),
  });
}
