import mongoose from 'mongoose';
import { Transfer, FORM_SECTION_ALIASES } from '../models/Transfer.js';

const REGISTRY_KEYS = new Set([
  'callDate',
  'callTime',
  'hospitalName',
  'hospitalPhone',
  'transferReason',
  'registrar',
  'bedControlDoctor',
  'assignedDoctor',
  'noTransferReason',
  'doctorReply24h',
  'preBedSlots',
  'externalTransferAt',
]);

export function normalizeSection(raw) {
  const key = FORM_SECTION_ALIASES[String(raw || '').trim()];
  if (!key) return null;
  return key;
}

export async function findTransferById(id) {
  if (!id) return null;
  return (
    (await Transfer.findOne({ serial: id })) ||
    (await Transfer.findOne({ patientId: id })) ||
    (mongoose.isValidObjectId(id) ? await Transfer.findById(id) : null)
  );
}

export function toListDto(doc) {
  const o = doc.toObject ? doc.toObject() : doc;
  const serial = o.serial || o.patientId || String(o._id);
  return {
    id: serial,
    _id: String(o._id),
    serial,
    callDate: o.callDate || '',
    callTime: o.callTime || '',
    hospitalName: o.hospitalName || '',
    hospitalPhone: o.hospitalPhone || '',
    transferReason: o.transferReason || '',
    registrar: o.registrar || '',
    bedControlDoctor: o.bedControlDoctor || '',
    assignedDoctor: o.assignedDoctor || '',
    noTransferReason: o.noTransferReason || (o.isTransferred === false ? 'full' : 'none'),
    doctorReply24h: o.doctorReply24h || '',
    preBedSlots: Array.isArray(o.preBedSlots) ? o.preBedSlots : [],
    externalTransferAt: o.externalTransferAt || undefined,
    formUpdatedAt: o.formUpdatedAt || {},
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

export function toDetailDto(doc) {
  const base = toListDto(doc);
  const o = doc.toObject ? doc.toObject() : doc;
  return {
    ...base,
    history: o.history && typeof o.history === 'object' ? o.history : {},
    doctorRecord: o.doctorRecord && typeof o.doctorRecord === 'object' ? o.doctorRecord : {},
    nurseRecord: o.nurseRecord && typeof o.nurseRecord === 'object' ? o.nurseRecord : {},
    handover: o.handover && typeof o.handover === 'object' ? o.handover : {},
  };
}

export function splitRegistryPatch(body) {
  const registry = {};
  const rest = {};
  for (const [k, v] of Object.entries(body || {})) {
    if (REGISTRY_KEYS.has(k)) registry[k] = v;
    else rest[k] = v;
  }
  return { registry, rest };
}

export async function deleteTransfer(id) {
  const doc = await findTransferById(id);
  if (!doc) {
    const err = new Error('not found');
    err.status = 404;
    throw err;
  }
  const serial = doc.serial || doc.patientId;
  await Transfer.deleteOne({ _id: doc._id });
  return { serial, deleted: true };
}

export async function saveFormSection(id, section, payload) {
  const field = normalizeSection(section);
  if (!field) {
    const err = new Error(`unknown form section: ${section}`);
    err.status = 400;
    throw err;
  }
  const doc = await findTransferById(id);
  if (!doc) {
    const err = new Error('not found');
    err.status = 404;
    throw err;
  }
  doc[field] = payload && typeof payload === 'object' ? payload : {};
  if (!doc.formUpdatedAt) doc.formUpdatedAt = {};
  doc.formUpdatedAt[field] = new Date();
  doc.markModified(field);
  doc.markModified('formUpdatedAt');
  await doc.save();
  return doc;
}
