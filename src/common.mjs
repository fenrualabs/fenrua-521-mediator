import crypto from 'node:crypto';

export function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function sha256Binding(value) {
  return `sha256:${crypto.createHash('sha256').update(canonicalRecord(value), 'utf8').digest('hex')}`;
}

export function canonicalRecord(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Canonical JSON rejects non-finite numbers.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalRecord(entry)).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => {
      if (value[key] === undefined) throw new TypeError(`Canonical JSON field ${key} is undefined.`);
      return `${JSON.stringify(key)}:${canonicalRecord(value[key])}`;
    }).join(',')}}`;
  }
  throw new TypeError(`Unsupported canonical JSON type: ${typeof value}.`);
}

export function issueCorrelationId() {
  return `krn-${crypto.randomUUID()}`;
}

export function fail(stage, code, action, correlationId) {
  return Object.freeze({
    ok: false,
    stage,
    status: action === 'CONTAIN' ? 'contained' : 'rejected',
    action,
    code,
    ...(correlationId ? { correlation_id: correlationId } : {}),
  });
}

export function utf8ByteLength(value) {
  return Buffer.byteLength(canonicalRecord(value), 'utf8');
}

export function walkValues(value, visitor) {
  visitor(value);
  if (Array.isArray(value)) {
    for (const entry of value) walkValues(entry, visitor);
  } else if (isPlainObject(value)) {
    for (const entry of Object.values(value)) walkValues(entry, visitor);
  }
}

export function allStringsAreNfc(value) {
  let normalized = true;
  walkValues(value, (entry) => {
    if (typeof entry === 'string' && entry.normalize('NFC') !== entry) normalized = false;
  });
  return normalized;
}

export function countFields(value) {
  let count = 0;
  walkValues(value, (entry) => {
    if (Array.isArray(entry) || isPlainObject(entry)) count += 1;
  });
  return count;
}
