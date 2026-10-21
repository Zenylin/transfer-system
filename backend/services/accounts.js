import { User } from '../models/User.js';
import {
  catalog,
  defaultPermissions,
  ensureDefaultAdmin,
  hashPassword,
  requireAuth,
  requirePermission,
  generalPublicUser,
  signGeneralToken,
  signToken,
  toPublicUser,
  verifyPassword,
} from './auth.js';
import { buildTransferStats } from './transferStats.js';

export { ensureDefaultAdmin, requireAuth, requirePermission };
export { requireFormWrite } from './auth.js';

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function assertPassword(password, required) {
  const value = String(password || '');
  if (!value && !required) return null;
  if (value.length < 6) throw fail(400, '密碼至少 6 個字元');
  if (value.length > 72) throw fail(400, '密碼過長');
  return value;
}

function assertUsername(username) {
  const value = String(username || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(value)) {
    throw fail(400, '帳號需為 3–32 碼英數，可含 . _ -');
  }
  return value;
}

function assertName(name) {
  const value = String(name || '').trim();
  if (!value || value.length > 40) throw fail(400, '請填寫姓名（最多 40 字）');
  return value;
}

function assertRole(role) {
  const allowed = ['admin', 'doctor', 'nurse', 'bed'];
  if (!allowed.includes(role)) throw fail(400, '角色不正確');
  return role;
}

function normalizePermissions(role, permissions) {
  if (role === 'admin') return defaultPermissions('admin');
  const allowed = new Set(defaultPermissions('admin'));
  const list = Array.isArray(permissions) ? permissions : defaultPermissions(role);
  return [...new Set(list.filter((k) => allowed.has(k)))];
}

async function assertKeepsAnAdmin(user, next) {
  const stillAdmin = next.active && (next.role === 'admin' || next.permissions.includes('users.manage'));
  const wasAdmin = user.role === 'admin' || (user.permissions || []).includes('users.manage');
  if (!wasAdmin || stillAdmin) return;
  const others = await User.countDocuments({
    _id: { $ne: user._id },
    active: true,
    $or: [{ role: 'admin' }, { permissions: 'users.manage' }],
  });
  if (others === 0) throw fail(400, '至少要保留一位可管理帳號的管理員');
}

export function registerAccountRoutes(app) {
  const login = async (req, res) => {
    try {
      const rawName = String(req.body?.username || req.body?.name || '').trim();
      const password = String(req.body?.password || '');
      if (!rawName) return res.status(400).json({ error: '請輸入姓名' });
      if (!password) {
        if (rawName.length > 40) return res.status(400).json({ error: '姓名最多 40 字' });
        const namedAccount = await User.findOne({ username: rawName.toLowerCase() });
        if (namedAccount) return res.status(401).json({ error: '此帳號需要密碼' });
        return res.json({ token: signGeneralToken(rawName), user: generalPublicUser(rawName) });
      }
      const username = rawName.toLowerCase();
      const user = await User.findOne({ username });
      if (!user || !verifyPassword(password, user.passwordHash)) {
        return res.status(401).json({ error: '帳號或密碼錯誤' });
      }
      if (user.active === false) {
        return res.status(403).json({ error: '此帳號已停用' });
      }
      res.json({ token: signToken(user), user: toPublicUser(user) });
    } catch (error) {
      console.error('[auth] login', error);
      res.status(500).json({ error: '登入失敗' });
    }
  };

  const me = (req, res) => {
    res.json(toPublicUser(req.user));
  };

  const listUsers = async (_req, res) => {
    try {
      const users = await User.find().sort({ createdAt: 1 });
      res.json({ ...catalog(), users: users.map(toPublicUser) });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };

  const createUser = async (req, res) => {
    try {
      const username = assertUsername(req.body?.username);
      const displayName = assertName(req.body?.name);
      const password = assertPassword(req.body?.password, true);
      const role = assertRole(req.body?.role || 'nurse');
      const permissions = normalizePermissions(role, req.body?.permissions);
      const active = req.body?.active !== false;
      const exists = await User.findOne({ username });
      if (exists) throw fail(409, '此帳號已存在');
      const user = await User.create({
        username,
        displayName,
        passwordHash: hashPassword(password),
        role,
        permissions,
        active,
      });
      res.status(201).json(toPublicUser(user));
    } catch (error) {
      const code = error.status || 500;
      if (code >= 500) console.error('[admin] create user', error);
      res.status(code).json({ error: error.message });
    }
  };

  const updateUser = async (req, res) => {
    try {
      const user = await User.findById(req.params.id);
      if (!user) return res.status(404).json({ error: '找不到帳號' });
      const username = req.body?.username != null ? assertUsername(req.body.username) : user.username;
      const displayName = req.body?.name != null ? assertName(req.body.name) : user.displayName;
      const role = req.body?.role != null ? assertRole(req.body.role) : user.role;
      const permissions = normalizePermissions(
        role,
        req.body?.permissions != null ? req.body.permissions : user.permissions,
      );
      const active = req.body?.active != null ? req.body.active !== false : user.active !== false;
      const password = assertPassword(req.body?.password, false);
      if (String(req.user._id) === String(user._id) && !active) {
        throw fail(400, '不能停用自己的帳號');
      }
      await assertKeepsAnAdmin(user, { active, role, permissions });
      if (username !== user.username) {
        const exists = await User.findOne({ username, _id: { $ne: user._id } });
        if (exists) throw fail(409, '此帳號已存在');
        user.username = username;
      }
      user.displayName = displayName;
      user.role = role;
      user.permissions = permissions;
      user.active = active;
      if (password) user.passwordHash = hashPassword(password);
      await user.save();
      res.json(toPublicUser(user));
    } catch (error) {
      const code = error.status || 500;
      if (code >= 500) console.error('[admin] update user', error);
      res.status(code).json({ error: error.message });
    }
  };

  const deleteUser = async (req, res) => {
    try {
      const user = await User.findById(req.params.id);
      if (!user) return res.status(404).json({ error: '找不到帳號' });
      if (String(req.user._id) === String(user._id)) {
        throw fail(400, '不能刪除自己的帳號');
      }
      await assertKeepsAnAdmin(user, { active: false, role: user.role, permissions: [] });
      await user.deleteOne();
      res.json({ deleted: true });
    } catch (error) {
      const code = error.status || 500;
      if (code >= 500) console.error('[admin] delete user', error);
      res.status(code).json({ error: error.message });
    }
  };

  const stats = async (req, res) => {
    try {
      const stats = await buildTransferStats(req.query.year);
      res.json(stats);
    } catch (error) {
      console.error('[admin] stats', error);
      res.status(500).json({ error: error.message });
    }
  };

  // /api/auth 給本機 Gateway；/api/transfer/auth 給對外 nginx（只轉發 /api/transfer）
  for (const prefix of ['/api', '/api/transfer']) {
    app.post(`${prefix}/auth/login`, login);
    app.get(`${prefix}/auth/me`, requireAuth, me);
    app.get(`${prefix}/admin/users`, requireAuth, requirePermission('users.manage'), listUsers);
    app.post(`${prefix}/admin/users`, requireAuth, requirePermission('users.manage'), createUser);
    app.patch(`${prefix}/admin/users/:id`, requireAuth, requirePermission('users.manage'), updateUser);
    app.delete(`${prefix}/admin/users/:id`, requireAuth, requirePermission('users.manage'), deleteUser);
    app.get(`${prefix}/admin/stats`, requireAuth, requirePermission('stats.view'), stats);
  }
}
