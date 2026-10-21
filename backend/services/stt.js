import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { randomBytes } from 'crypto';
import OpenAI, { toFile } from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Whisper 初始提示：提供醫療詞彙可明顯減少幻聽／錯字。
 * 只放高頻詞，不要太長（Groq/Whisper prompt 建議短）。
 */
const MEDICAL_WHISPER_PROMPT = [
  '新生兒外接轉診。',
  '常見詞彙：早產、呼吸窘迫、RDS、N-CPAP、IMV、surfactant、Apgar、GBS、',
  '低血糖、黃疸、敗血症、插管、保溫箱、滿床、空床、外接、轉院原因、',
  '桃園敏盛、新竹馬偕、林口長庚、中壢天成、竹北國泰。',
].join('');

/** 常見 Whisper 繁中錯字／同音 → 醫療正確詞 */
const MEDICAL_CORRECTIONS = [
  [/Ｎ[\s\-]?ＣＰＡＰ/gi, 'N-CPAP'],
  [/N[\s\-]?CPAP/gi, 'N-CPAP'],
  [/恩西帕|恩西趴|恩CPAP/gi, 'N-CPAP'],
  [/阿普嘎|阿普加|阿帕加/g, 'Apgar'],
  [/Ａｐｇａｒ/gi, 'Apgar'],
  [/ＲＤＳ/gi, 'RDS'],
  [/Ｒｄｓ/g, 'RDS'],
  [/氣喘窘迫|呼吸窘迫症候群/g, '呼吸窘迫'],
  [/蘇法坦特|サーファクタント|surfaktant/gi, 'surfactant'],
  [/沙伐坦|沙法坦/g, 'surfactant'],
  [/ＩＭＶ/gi, 'IMV'],
  [/ＧＢＳ/gi, 'GBS'],
  [/吉畢斯|GB S/gi, 'GBS'],
  [/ＮＩＣＵ/gi, 'NICU'],
  [/妮可|泥庫|霓庫/g, 'NICU'],
  [/衛保溫箱|保溫想/g, '保溫箱'],
  [/外接車|外接專/g, '外接'],
  [/轉原原因|轉院原應/g, '轉院原因'],
  [/敏盛醫院院/g, '敏盛醫院'],
  [/馬偕紀念紀念醫院/g, '馬偕紀念醫院'],
  [/長庚醫院醫院/g, '長庚醫院'],
];

function cleanText(raw) {
  let text = String(raw || '')
    .replace(/\[BLANK_AUDIO\]/gi, '')
    .replace(/\[Silence\]/gi, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/[（(]\s*字幕製作\s*[:：][^）)]*[）)]/g, '')
    .replace(/字幕製作\s*[:：]\s*\S+/g, '')
    .replace(/^```(?:\w+)?\s*/g, '')
    .replace(/```$/g, '')
    .replace(/♪+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const promptEchoes = [
    /你是醫療[語文]{0,4}[語音文字轉]{2,8}引擎[。.\s]*/g,
    /請把這段繁體中文語音完整轉成文字[。.\s]*/g,
    /只輸出辨識結果本身[^。\n]*[。.\s]*/g,
    /若幾乎沒有人聲[^。\n]*[。.\s]*/g,
    /不要加說明[^。\n]*[。.\s]*/g,
    /新生兒外接登錄表[。.\s]*/g,
    /新生兒外接轉診[。.\s]*/g,
    /轉院原因、外接院所、產前產後紀錄[。.\s]*/g,
    /常見詞彙[：:][^\n]*/g,
    /請不吝点赞[\s\S]*$/g,
  ];
  for (const re of promptEchoes) text = text.replace(re, '');

  return applyMedicalCorrections(text.replace(/\s+/g, ' ').trim());
}

function applyMedicalCorrections(text) {
  let out = text;
  for (const [re, replacement] of MEDICAL_CORRECTIONS) {
    out = out.replace(re, replacement);
  }
  // 全形數字／英文字母 → 半形（方便後續填表與搜尋）
  out = out.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
  out = out.replace(/[Ａ-Ｚａ-ｚ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
  return out.trim();
}

function isJunk(text) {
  if (!text) return true;
  if (/字幕製作/.test(text)) return true;
  if (/醫療.*(語音|文字).*(引擎|轉)/.test(text)) return true;
  if (/只輸出辨識結果/.test(text)) return true;
  if (/請把這段.*(語音|音訊)/.test(text)) return true;
  if (/请不吝点赞|订阅|打赏支持/.test(text)) return true;
  if (/常見詞彙/.test(text)) return true;
  const meaningful = (text.match(/[\u4e00-\u9fffA-Za-z0-9]/g) || []).join('');
  return meaningful.length < 2;
}

function tmpPath(ext) {
  return path.join(os.tmpdir(), `medical-stt-${Date.now()}-${randomBytes(4).toString('hex')}${ext}`);
}

function extFromMime(mimeType = '') {
  if (mimeType.includes('wav')) return '.wav';
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return '.mp3';
  if (mimeType.includes('mp4') || mimeType.includes('m4a') || mimeType.includes('aac')) return '.m4a';
  if (mimeType.includes('ogg')) return '.ogg';
  return '.webm';
}

function groqFilename(mimeType = '') {
  const ext = extFromMime(mimeType);
  if (ext === '.m4a') return 'audio.m4a';
  if (ext === '.mp3') return 'audio.mp3';
  if (ext === '.ogg') return 'audio.ogg';
  if (ext === '.wav') return 'audio.wav';
  return 'audio.webm';
}

/** 從 WAV header 粗估時長（秒） */
function wavDurationSec(buf) {
  try {
    if (!buf || buf.length < 44) return 0;
    // sample rate @ 24, byte rate @ 28, data size @ 40
    const sampleRate = buf.readUInt32LE(24);
    const byteRate = buf.readUInt32LE(28) || (sampleRate * 2);
    const dataSize = buf.readUInt32LE(40);
    if (!byteRate) return 0;
    return dataSize / byteRate;
  } catch {
    return 0;
  }
}

/** 盡量修復殘缺瀏覽器錄音再轉 wav；順便做高通濾波減少低頻雜訊 */
async function bufferToWav(inputBuffer, inputExt = '.webm') {
  const inPath = tmpPath(inputExt);
  const outPath = tmpPath('.wav');
  fs.writeFileSync(inPath, inputBuffer);

  const attempts = [
    // 去靜音開頭、單聲道 16k、輕微高通
    ['-y', '-fflags', '+genpts+igndts+discardcorrupt', '-i', inPath,
      '-af', 'highpass=f=80,silenceremove=start_periods=1:start_silence=0.2:start_threshold=-40dB',
      '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', outPath],
    ['-y', '-fflags', '+genpts+igndts+discardcorrupt', '-i', inPath,
      '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', outPath],
    ['-y', '-f', inputExt.replace('.', ''), '-i', inPath,
      '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', outPath],
  ];

  let lastErr = '';
  try {
    for (const args of attempts) {
      try {
        await new Promise((resolve, reject) => {
          const ff = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
          let err = '';
          ff.stderr.on('data', (d) => { err += d.toString(); });
          ff.on('close', (code) => {
            if (code === 0 && fs.existsSync(outPath) && fs.statSync(outPath).size > 100) resolve();
            else reject(new Error(err.slice(-400)));
          });
        });
        return fs.readFileSync(outPath);
      } catch (e) {
        lastErr = e.message || String(e);
      }
    }
    throw new Error(`ffmpeg 轉檔失敗: ${lastErr.slice(-200)}`);
  } finally {
    try { fs.unlinkSync(inPath); } catch {}
    try { fs.unlinkSync(outPath); } catch {}
  }
}

async function groqTranscribeFile(client, buf, filename, mimeType) {
  const file = await toFile(buf, filename, { type: mimeType });
  const model = process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo';
  const result = await client.audio.transcriptions.create({
    file,
    model,
    language: 'zh',
    temperature: 0,
    // response_format text 對某些版本較穩；預設 json 也 OK
    prompt: process.env.GROQ_STT_PROMPT || MEDICAL_WHISPER_PROMPT,
  });
  const text = cleanText(typeof result === 'string' ? result : result.text);
  if (isJunk(text)) throw new Error(`Groq 回傳無效內容: "${text}"`);
  return text;
}

async function transcribeGroq(audioBuffer, mimeType = 'audio/webm') {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('未設定 GROQ_API_KEY');

  const client = new OpenAI({
    apiKey,
    baseURL: 'https://api.groq.com/openai/v1',
  });

  if (mimeType.includes('wav')) {
    const dur = wavDurationSec(audioBuffer);
    if (dur > 0 && dur < 0.6) {
      throw new Error('錄音太短（不足 1 秒），請按住再說一次');
    }
    const text = await groqTranscribeFile(client, audioBuffer, 'audio.wav', 'audio/wav');
    return { text, provider: 'groq', durationSec: dur || undefined };
  }

  const errors = [];

  try {
    const text = await groqTranscribeFile(
      client,
      audioBuffer,
      groqFilename(mimeType),
      mimeType || 'audio/webm',
    );
    return { text, provider: 'groq-direct' };
  } catch (err) {
    errors.push(`direct: ${err.message || err}`);
    console.warn('[STT] groq 原檔失敗，改試轉 wav:', err.message || err);
  }

  try {
    const wavBuf = await bufferToWav(audioBuffer, extFromMime(mimeType));
    const text = await groqTranscribeFile(client, wavBuf, 'audio.wav', 'audio/wav');
    return { text, provider: 'groq-wav' };
  } catch (err) {
    errors.push(`wav: ${err.message || err}`);
    throw new Error(errors.join(' | '));
  }
}

async function transcribeGemini(audioBuffer, mimeType = 'audio/webm') {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('未設定 GEMINI_API_KEY');

  let payload = audioBuffer;
  let sendMime = mimeType || 'audio/webm';
  try {
    if (!sendMime.includes('wav')) {
      payload = await bufferToWav(audioBuffer, extFromMime(sendMime));
      sendMime = 'audio/wav';
    }
  } catch {
    // 轉檔失敗就用原檔
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const models = [
    process.env.GEMINI_STT_MODEL,
    'gemini-2.0-flash',
    'gemini-2.5-flash',
    'gemini-1.5-flash',
  ].filter(Boolean);

  const audioPart = {
    inlineData: {
      mimeType: sendMime,
      data: payload.toString('base64'),
    },
  };
  const userAsk = {
    text:
      '這是台灣新生兒外接／轉診場景的口語錄音。' +
      '請用繁體中文轉錄聽到的內容，保留醫療縮寫原文（如 N-CPAP、Apgar、RDS、GBS、NICU）。' +
      '只輸出轉錄文字，不要加標題或說明。',
  };

  let lastErr;
  for (const modelName of [...new Set(models)]) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction:
          '任務：醫療語音轉文字（繁體中文）。規則：只輸出聽到的原文；禁止輸出角色設定、規則說明、標題；無語音則輸出空。',
      });
      const result = await model.generateContent([audioPart, userAsk]);
      const text = cleanText(result?.response?.text?.() || '');
      if (isJunk(text)) throw new Error(`模型回傳無效內容: "${text}"`);
      return { text, provider: `gemini:${modelName}` };
    } catch (err) {
      lastErr = err;
      console.warn(`[STT] gemini model ${modelName} 失敗:`, err.message || err);
    }
  }
  throw lastErr || new Error('Gemini 全部模型都失敗');
}

export async function transcribeAudio(audioBuffer, mimeType = 'audio/webm') {
  const preferred = (process.env.STT_PROVIDER || 'auto').toLowerCase();
  const errors = [];

  const tryOne = async (name, fn) => {
    console.log(`[STT] 使用 ${name}...`);
    const out = await fn();
    if (isJunk(out.text)) throw new Error(`${name} 沒有辨識到有效語音`);
    console.log(`[STT] ${name} 成功: "${out.text}"`);
    return out;
  };

  // auto：Groq 快 → Gemini 備援；也可設 STT_PROVIDER=groq|gemini
  const order =
    preferred === 'groq' ? ['groq'] :
    preferred === 'gemini' ? ['gemini'] :
    ['groq', 'gemini'];

  for (const name of order) {
    try {
      if (name === 'groq') {
        if (!process.env.GROQ_API_KEY) {
          errors.push('groq: 無 GROQ_API_KEY');
          continue;
        }
        return await tryOne('groq', () => transcribeGroq(audioBuffer, mimeType));
      }
      if (name === 'gemini') {
        if (!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)) {
          errors.push('gemini: 無 GEMINI_API_KEY');
          continue;
        }
        return await tryOne('gemini', () => transcribeGemini(audioBuffer, mimeType));
      }
    } catch (err) {
      console.error(`[STT] ${name} 失敗:`, err.message || err);
      errors.push(`${name}: ${err.message || err}`);
    }
  }

  throw new Error(
    `雲端語音辨識失敗。請靠近麥克風、按住至少 2 秒後再試。${errors.map((e) => e.slice(0, 80)).join(' | ')}`
  );
}

export function sttStatus() {
  return {
    provider: process.env.STT_PROVIDER || 'auto',
    groq: Boolean(process.env.GROQ_API_KEY),
    gemini: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
    groqModel: process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo',
    geminiModel: process.env.GEMINI_STT_MODEL || 'gemini-2.0-flash',
    storage: 'memory',
    medicalPrompt: true,
    corrections: MEDICAL_CORRECTIONS.length,
  };
}
