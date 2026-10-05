import { createHash, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';

export class DeviceBindingError extends Error {
  constructor(code, status = 403) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

const hash = (value) => createHash('sha256').update(value).digest('hex');
const equal = (left, right) => typeof left === 'string' && left.length === right.length
  && timingSafeEqual(Buffer.from(left), Buffer.from(right));

export function deviceProof(headers = {}) {
  const id = headers['x-device-id'];
  const secret = headers['x-device-secret'];
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{10,160}$/.test(id)
    || typeof secret !== 'string' || !/^[a-zA-Z0-9_-]{32,160}$/.test(secret)) {
    throw new DeviceBindingError('DEVICE_PROOF_REQUIRED', 401);
  }
  return { idHash: hash(id), secretHash: hash(secret) };
}

export async function bindDevice(database, uid, proof, legacyIds = []) {
  const transaction = await database.transaction('write');
  try {
    const existing = (await transaction.execute({
      sql: 'SELECT device_hash, secret_hash FROM student_device_bindings WHERE student_uid = ?', args: [uid],
    })).rows[0];
    if (existing) {
      if (!equal(existing.device_hash, proof.idHash) || !equal(existing.secret_hash, proof.secretHash)) {
        throw new DeviceBindingError('DEVICE_MISMATCH');
      }
    } else {
      const revoked = (await transaction.execute({ sql: `SELECT 1 FROM student_revoked_devices
        WHERE student_uid = ? AND device_hash = ? AND secret_hash = ?`,
      args: [uid, proof.idHash, proof.secretHash] })).rows[0];
      if (revoked) throw new DeviceBindingError('DEVICE_MISMATCH');
      // Preserve the first previously registered device during migration.
      if (legacyIds.length && !equal(hash(legacyIds[0]), proof.idHash)) {
        throw new DeviceBindingError('DEVICE_MISMATCH');
      }
      await transaction.execute({ sql: `INSERT INTO student_device_bindings
        (student_uid, device_hash, secret_hash, linked_at) VALUES (?, ?, ?, ?)`,
      args: [uid, proof.idHash, proof.secretHash, new Date().toISOString()] });
    }
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  } finally { transaction.close(); }
}

export async function resetDevice(database, uid) {
  const transaction = await database.transaction('write');
  try {
    await transaction.execute({ sql: `INSERT OR IGNORE INTO student_revoked_devices
      (student_uid, device_hash, secret_hash)
      SELECT student_uid, device_hash, secret_hash FROM student_device_bindings WHERE student_uid = ?`, args: [uid] });
    await transaction.execute({ sql: 'DELETE FROM student_device_bindings WHERE student_uid = ?', args: [uid] });
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  } finally { transaction.close(); }
}

export async function verifyDevice(database, uid, proof) {
  const row = (await database.execute({ sql:
    'SELECT device_hash, secret_hash FROM student_device_bindings WHERE student_uid = ?', args: [uid],
  })).rows[0];
  if (!row || !equal(row.device_hash, proof.idHash) || !equal(row.secret_hash, proof.secretHash)) {
    throw new DeviceBindingError('DEVICE_MISMATCH');
  }
}
