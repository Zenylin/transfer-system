import crypto from 'crypto';
import { User } from '../models/User.js';

const SECRET = process.env.AUTH_SECRET || 'ntms-dev-auth-secret-change-me';
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const PERMISSIONS = [
  { key: 'users.manage', label: '管理帳號與權限', group: '帳號' },
  { key: 'transfers.view', label: '查看轉診清單', group: '轉診' },
  { key: 'transfers.edit', label: '新增與編輯轉診', group: '轉診' },
  { key: 'transfers.delete', label: '刪除轉診', group: '轉診' },
  { key: 'forms.registry', label: '外接紀錄表', group: '表單' },
  { key: 'forms.history', label: '孕產史／系統交班', group: '表單' },
  { key: 'forms.doctor', label: '轉診紀錄單（醫師）', group: '表單' },
  { key: 'forms.nurse', label: '轉診紀錄單（護理師）', group: '表單' },
  { key: 'stats.view', label: '查看統計圖表', group: '統計' },
];

const ALL_KEYS = PERMISSIONS.map((p) => p.key);

export const ROLES = [
  {
    key: 'admin',
    label: '管理員',
    permissions: ALL_KEYS,
  },
  {
    key: 'doctor',
    label: '醫師',
    permissions: [
      'transfers.view',
      'transfers.edit',
      'forms.registry',
      'forms.history',
      'forms.doctor',
      'forms.nurse',
      'stats.view',
    ],
  },
  {
    key: 'nurse',
    label: '護理師',
    permissions: [
      'transfers.view',
      'transfers.edit',
      'forms.registry',
      'forms.history',
      'forms.nurse',
    ],
  },
  {
    key: 'bed',
    label: '控床',
    permissions: ['transfers.view', 'transfers.edit', 'forms.registry'],
  },
];

const ROLE_MAP = Object.fromEntries(ROLES.map((r) => [r.key, r]));

const FORM_SECTION_PERM = {
  history: 'forms.history',
  doctorRecord: 'forms.doctor',
  nurseRecord: 'forms.nurse',
  handover: 'forms.nurse',
};

const SECTION_ALIAS = {
  history: 'history',
  'doctor-record': 'doctorRecord',
  doctorRecord: 'doctorRecord',
  'nurse-record': 'nurseRecord',
  nurseRecord: 'nurseRecord',
  handover: 'handover',
};

const GENERAL_PERMISSIONS = [
  'transfers.view',
  'transfers.edit',
  'transfers.delete',
  'forms.registry',
  'forms.history',
  'forms.doctor',
  'forms.nurse',
];

export function roleLabel(role) {
  if (role === 'general') return '使用者';
  return ROLE_MAP[role]?.label || role;
}

export function defaultPermissions(role) {
  return [...(ROLE_MAP[role]?.permissions || [])];
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 32).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  if (!stored || typeof password !== 'string') return false;
  const [algo, salt, hash] = String(stored).split('$');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const next = crypto.scryptSync(password, salt, 32);
  const prev = Buffer.from(hash, 'hex');
  if (prev.length !== next.length) return false;
  return crypto.timingSafeEqual(prev, next);
}

function signPayload(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function signToken(user) {
  return signPayload({
    sub: String(user._id),
    exp: Date.now() + TOKEN_TTL_MS,
  });
}

export function signGeneralToken(name) {
  return signPayload({
    kind: 'general',
    name,
    exp: Date.now() + TOKEN_TTL_MS,
  });
}

export function verifyToken(token) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload?.exp || payload.exp < Date.now()) return null;
    if (payload.kind === 'general') return payload.name ? payload : null;
    if (!payload.sub) return null;
    return payload;
  } catch {
    return null;
  }
}

export function generalPublicUser(name) {
  return {
    id: `general:${name}`,
    username: name,
    name,
    role: 'general',
    roleLabel: '使用者',
    permissions: [...GENERAL_PERMISSIONS],
    active: true,
  };
}

export function toPublicUser(user) {
  if (user?.role === 'general') return generalPublicUser(user.displayName || user.name);
  return {
    id: String(user._id),
    username: user.username,
    name: user.displayName,
    role: user.role,
    roleLabel: roleLabel(user.role),
    permissions: user.role === 'admin' ? ALL_KEYS : [...(user.permissions || [])],
    active: user.active !== false,
  };
}

export function hasPerm(user, keys) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const list = Array.isArray(keys) ? keys : [keys];
  return list.some((k) => user.permissions?.includes(k));
}

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const payload = verifyToken(token);
    if (!payload) return res.status(401).json({ error: '請重新登入' });
    if (payload.kind === 'general') {
      req.user = {
        displayName: payload.name,
        username: payload.name,
        role: 'general',
        permissions: GENERAL_PERMISSIONS,
        active: true,
      };
      return next();
    }
    const user = await User.findById(payload.sub);
    if (!user || user.active === false) {
      return res.status(401).json({ error: '帳號已停用或不存在，請重新登入' });
    }
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

export function requirePermission(...keys) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: '請重新登入' });
    if (hasPerm(req.user, keys)) return next();
    return res.status(403).json({ error: '沒有權限執行此操作' });
  };
}

export function requireFormWrite(req, res, next) {
  const section = SECTION_ALIAS[req.params.section];
  const key = section ? FORM_SECTION_PERM[section] : null;
  if (!key) return res.status(400).json({ error: 'unknown section' });
  if (!hasPerm(req.user, key)) return res.status(403).json({ error: '沒有權限執行此操作' });
  next();
}

export async function ensureDefaultAdmin() {
  const count = await User.countDocuments();
  if (count > 0) return;
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  await User.create({
    username: 'admin',
    displayName: '系統管理員',
    passwordHash: hashPassword(password),
    role: 'admin',
    permissions: ALL_KEYS,
    active: true,
  });
  console.log('[auth] 已建立預設管理員 username=admin（請登入後立即修改密碼）');
}

export function catalog() {
  return {
    permissions: PERMISSIONS,
    roles: ROLES.map((r) => ({
      key: r.key,
      label: r.label,
      permissions: r.permissions,
    })),
  };
}
