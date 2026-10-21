import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import { Transfer } from './models/Transfer.js';
import {
  findTransferById,
  deleteTransfer,
  saveFormSection,
  splitRegistryPatch,
  toDetailDto,
  toListDto,
} from './services/transferRepo.js';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import { transcribeAudio, sttStatus } from './services/stt.js';
import {
  ensureDefaultAdmin,
  registerAccountRoutes,
  requireAuth,
  requireFormWrite,
  requirePermission,
} from './services/accounts.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
process.chdir(__dirname);

dotenv.config({ path: path.join(__dirname, '.env') });

const UPLOAD_DIR = path.join(__dirname, 'upload_tmp');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const app = express();

app.use(express.json({ limit: '2mb' }));
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  next();
});

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/CC_DB';

mongoose
  .connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useCreateIndex: true,
    useFindAndModify: false,
  })
  .then(async () => {
    const dbName = mongoose.connection.name;
    const host = mongoose.connection.host;
    console.log(`✅ MongoDB Connected → ${host}/${dbName}`);
    await ensureDefaultAdmin();
  })
  .catch((err) => {
    console.error('❌ MongoDB connection failed:', err);
    process.exit(1);
  });

function toCaseDto(doc) {
  return toListDto(doc);
}

async function updateRegistry(id, patch) {
  const { registry, rest } = splitRegistryPatch(patch);
  if (Object.keys(rest).length) {
    console.warn('[transfer] ignored non-registry keys in registry update:', Object.keys(rest));
  }
  if (registry.noTransferReason != null) {
    registry.isTransferred = registry.noTransferReason === 'none';
  }
  const doc =
    (await Transfer.findOneAndUpdate(
      { serial: id },
      { $set: registry, $currentDate: { 'formUpdatedAt.registry': true } },
      { new: true },
    )) ||
    (await Transfer.findOneAndUpdate(
      { patientId: id },
      { $set: registry, $currentDate: { 'formUpdatedAt.registry': true } },
      { new: true },
    )) ||
    (mongoose.isValidObjectId(id)
      ? await Transfer.findByIdAndUpdate(
          id,
          { $set: registry, $currentDate: { 'formUpdatedAt.registry': true } },
          { new: true },
        )
      : null);
  return doc;
}

function nextSerial(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const prefix = `${y}${m}${day}`;
  return Transfer.find({ serial: new RegExp(`^${prefix}`) })
    .select('serial')
    .lean()
    .then((rows) => {
      let max = 0;
      for (const r of rows) {
        const n = parseInt(String(r.serial).slice(-2), 10);
        if (!Number.isNaN(n) && n > max) max = n;
      }
      const next = Math.min(max + 1, 99);
      return `${prefix}${String(next).padStart(2, '0')}`;
    });
}

app.get('/api/mongo/status', (_req, res) => {
  const st = mongoose.connection.readyState; // 1=connected
  res.json({
    ok: st === 1,
    readyState: st,
    uriHost: '127.0.0.1',
    db: mongoose.connection.name || null,
    host: mongoose.connection.host || null,
  });
});

registerAccountRoutes(app);

app.get('/api/transfers', requireAuth, requirePermission('transfers.view'), async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    const q = String(req.query.q || '').trim();
    const filter = {};
    if (q) {
      filter.$or = [
        { serial: new RegExp(q, 'i') },
        { hospitalName: new RegExp(q, 'i') },
        { assignedDoctor: new RegExp(q, 'i') },
        { transferReason: new RegExp(q, 'i') },
        { registrar: new RegExp(q, 'i') },
      ];
    }
    if (req.query.from || req.query.to) {
      filter.callDate = {};
      if (req.query.from) filter.callDate.$gte = String(req.query.from);
      if (req.query.to) filter.callDate.$lte = String(req.query.to);
    }
    const rows = await Transfer.find(filter).sort({ callDate: -1, callTime: -1, createdAt: -1 }).limit(limit);
    res.json(rows.map(toCaseDto));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/transfers/:id', requireAuth, requirePermission('transfers.view'), async (req, res) => {
  try {
    const doc = await findTransferById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'not found' });
    res.json(toDetailDto(doc));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** 暫存單張表單：history | doctor-record | nurse-record | handover */
app.post('/api/transfers/:id/forms/:section', requireAuth, requireFormWrite, async (req, res) => {
  try {
    const doc = await saveFormSection(req.params.id, req.params.section, req.body);
    res.json(toDetailDto(doc));
  } catch (error) {
    const code = error.status || 500;
    if (code >= 500) console.error('表單暫存失敗:', error);
    res.status(code).json({ error: error.message });
  }
});

app.get('/api/transfers/:id/forms/:section', requireAuth, requirePermission('transfers.view'), async (req, res) => {
  try {
    const doc = await findTransferById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'not found' });
    const detail = toDetailDto(doc);
    const section = req.params.section;
    const aliases = {
      history: 'history',
      'doctor-record': 'doctorRecord',
      doctorRecord: 'doctorRecord',
      'nurse-record': 'nurseRecord',
      nurseRecord: 'nurseRecord',
      handover: 'handover',
    };
    const key = aliases[section];
    if (!key) return res.status(400).json({ error: 'unknown section' });
    res.json({ section: key, data: detail[key] || {} });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/transfers', requireAuth, requirePermission('transfers.edit'), async (req, res) => {
  try {
    const body = { ...req.body };
    if (!body.serial) body.serial = await nextSerial();
    body.patientId = body.patientId || body.serial;
    body.isTransferred = body.noTransferReason === 'none' || body.isTransferred === true;
    const saved = await Transfer.create(body);
    res.status(201).json(toCaseDto(saved));
  } catch (error) {
    console.error('建立失敗:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/transfers/:id', requireAuth, requirePermission('forms.registry', 'transfers.edit'), async (req, res) => {
  try {
    const patch = { ...req.body };
    delete patch._id;
    delete patch.id;
    delete patch.history;
    delete patch.doctorRecord;
    delete patch.nurseRecord;
    delete patch.handover;
    const doc = await updateRegistry(req.params.id, patch);
    if (!doc) return res.status(404).json({ error: 'not found' });
    res.json(toListDto(doc));
  } catch (error) {
    console.error('更新失敗:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/transfers/:id', requireAuth, requirePermission('transfers.delete'), async (req, res) => {
  try {
    const result = await deleteTransfer(req.params.id);
    res.json(result);
  } catch (error) {
    const code = error.status || 500;
    if (code >= 500) console.error('刪除失敗:', error);
    res.status(code).json({ error: error.message });
  }
});

/** nginx/舊版相容：POST 刪除 */
app.post('/api/transfers/:id/delete', requireAuth, requirePermission('transfers.delete'), async (req, res) => {
  try {
    const result = await deleteTransfer(req.params.id);
    res.json(result);
  } catch (error) {
    const code = error.status || 500;
    if (code >= 500) console.error('刪除失敗:', error);
    res.status(code).json({ error: error.message });
  }
});

app.patch('/api/transfers/:id', requireAuth, requirePermission('forms.registry', 'transfers.edit'), async (req, res) => {
  try {
    const patch = { ...req.body };
    delete patch._id;
    delete patch.id;
    delete patch.history;
    delete patch.doctorRecord;
    delete patch.nurseRecord;
    delete patch.handover;
    const doc = await updateRegistry(req.params.id, patch);
    if (!doc) return res.status(404).json({ error: 'not found' });
    res.json(toListDto(doc));
  } catch (error) {
    console.error('更新失敗:', error);
    res.status(500).json({ error: error.message });
  }
});

/** 舊相容：外接登錄 */
app.post('/api/transfer/registry', requireAuth, requirePermission('forms.registry', 'transfers.edit'), async (req, res) => {
  try {
    const body = { ...req.body };
    if (!body.serial && !body.patientId) body.serial = await nextSerial();
    body.patientId = body.patientId || body.serial;
    body.serial = body.serial || body.patientId;
    const saved = await Transfer.create(body);
    res.status(201).json(saved);
  } catch (error) {
    console.error('保存失敗:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/stt/status', (_req, res) => {
  res.json(sttStatus());
});

app.post('/api/speech-to-text', requireAuth, (req, res) => {
  upload.single('audio')(req, res, async (multerErr) => {
    if (multerErr) {
      console.error('[語音辨識] 上傳失敗:', multerErr);
      return res.status(500).json({ error: `音檔上傳失敗: ${multerErr.message}` });
    }

    try {
      const audioFile = req.file;
      if (!audioFile?.buffer?.length) {
        return res.status(400).json({ error: '沒有收到音檔' });
      }

      console.log(
        `[語音辨識] 收到音訊 memory ${audioFile.size} bytes, ${audioFile.mimetype}`,
        sttStatus(),
      );

      if (audioFile.size < 800) {
        return res.status(400).json({
          error: '音檔太小。請按住麥克風至少 1–2 秒再說一次。',
        });
      }

      const { text, provider } = await transcribeAudio(
        audioFile.buffer,
        audioFile.mimetype || 'audio/webm',
      );

      return res.json({ text, provider, chunks: [{ speech: text }] });
    } catch (error) {
      console.error('[語音辨識] 失敗:', error);
      return res.status(500).json({ error: error.message || String(error) });
    }
  });
});

app.get('/api/transfer/:id', requireAuth, requirePermission('transfers.view'), async (req, res) => {
  try {
    const records = await Transfer.find({
      $or: [{ patientId: req.params.id }, { serial: req.params.id }],
    });
    res.json(records);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/ping', (_req, res) => {
  res.send('Backend is alive!');
});

const PORT = process.env.PORT || 3000;
const options = {
  key: fs.readFileSync(path.join(__dirname, 'server.key')),
  cert: fs.readFileSync(path.join(__dirname, 'server.cert')),
};

https.createServer(options, app).listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 HTTPS Server running on port ${PORT}`);
  console.log('[STT]', sttStatus());
  console.log('[Mongo URI]', MONGO_URI.replace(/\/\/.*@/, '//***@'));
});
