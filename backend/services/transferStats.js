import { Transfer } from '../models/Transfer.js';

const REASON_LABEL = {
  none: '有外接',
  full: '滿床',
  lt3: '空床 < 3',
  self: '自行抱來',
  '': '未填',
};

function reasonLabel(key) {
  return REASON_LABEL[key] || key || '未填';
}

export async function buildTransferStats(yearRaw) {
  const year = yearRaw && String(yearRaw) !== 'all' ? String(yearRaw) : 'all';
  const match = {};
  if (year !== 'all') {
    match.callDate = { $gte: `${year}-01-01`, $lte: `${year}-12-31` };
  }

  const [all, undated, rangeRows, monthRows, reasonRows, hospitalRows, bedRows, yearRows] =
    await Promise.all([
      Transfer.countDocuments({}),
      Transfer.countDocuments({
        $or: [{ callDate: null }, { callDate: '' }, { callDate: { $exists: false } }],
      }),
      Transfer.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            transferred: {
              $sum: { $cond: [{ $eq: ['$noTransferReason', 'none'] }, 1, 0] },
            },
            replyYes: { $sum: { $cond: [{ $eq: ['$doctorReply24h', 'yes'] }, 1, 0] } },
            replyNo: { $sum: { $cond: [{ $eq: ['$doctorReply24h', 'no'] }, 1, 0] } },
          },
        },
      ]),
      Transfer.aggregate([
        { $match: { ...match, callDate: match.callDate || { $regex: '^[0-9]{4}-[0-9]{2}-[0-9]{2}' } } },
        {
          $project: {
            month: { $substr: ['$callDate', 0, 7] },
            transferred: { $cond: [{ $eq: ['$noTransferReason', 'none'] }, 1, 0] },
          },
        },
        {
          $group: {
            _id: '$month',
            total: { $sum: 1 },
            transferred: { $sum: '$transferred' },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Transfer.aggregate([
        { $match: match },
        { $group: { _id: { $ifNull: ['$noTransferReason', ''] }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Transfer.aggregate([
        { $match: match },
        {
          $group: {
            _id: {
              $cond: [
                { $or: [{ $eq: ['$hospitalName', ''] }, { $eq: ['$hospitalName', null] }] },
                '未填院所',
                '$hospitalName',
              ],
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 8 },
      ]),
      Transfer.aggregate([
        { $match: match },
        { $unwind: { path: '$preBedSlots', preserveNullAndEmptyArrays: false } },
        { $match: { preBedSlots: { $nin: ['', null] } } },
        { $group: { _id: '$preBedSlots', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Transfer.aggregate([
        { $match: { callDate: { $regex: '^[0-9]{4}-' } } },
        { $group: { _id: { $substr: ['$callDate', 0, 4] } } },
        { $sort: { _id: -1 } },
      ]),
    ]);

  const summary = rangeRows[0] || { total: 0, transferred: 0, replyYes: 0, replyNo: 0 };
  const total = summary.total || 0;
  const transferred = summary.transferred || 0;
  const notTransferred = total - transferred;
  const replyYes = summary.replyYes || 0;
  const replyNo = summary.replyNo || 0;

  const byMonth = new Map(
    monthRows
      .filter((r) => /^\d{4}-\d{2}$/.test(r._id || ''))
      .map((r) => [r._id, r]),
  );

  let monthly;
  if (year !== 'all') {
    monthly = Array.from({ length: 12 }, (_, i) => {
      const key = `${year}-${String(i + 1).padStart(2, '0')}`;
      const row = byMonth.get(key);
      const t = row?.transferred || 0;
      const n = row?.total || 0;
      return {
        key,
        label: `${i + 1}月`,
        total: n,
        transferred: t,
        notTransferred: n - t,
      };
    });
  } else {
    const keys = [...byMonth.keys()].sort();
    const recent = keys.slice(-24);
    monthly = recent.map((key) => {
      const row = byMonth.get(key);
      const t = row?.transferred || 0;
      const n = row?.total || 0;
      const [y, m] = key.split('-');
      return {
        key,
        label: `${y}/${Number(m)}`,
        total: n,
        transferred: t,
        notTransferred: n - t,
      };
    });
  }

  const years = yearRows.map((r) => r._id).filter(Boolean);
  const thisYear = String(new Date().getFullYear());
  if (!years.includes(thisYear)) years.unshift(thisYear);

  return {
    year,
    years,
    totals: { all, undated },
    range: {
      total,
      transferred,
      notTransferred,
      rate: total ? Math.round((transferred / total) * 100) : 0,
      replyYes,
      replyNo,
      replyEmpty: Math.max(total - replyYes - replyNo, 0),
    },
    monthly,
    reasons: reasonRows
      .filter((r) => r._id !== 'none')
      .map((r) => ({ key: r._id || '', label: reasonLabel(r._id), count: r.count })),
    hospitals: hospitalRows.map((r) => ({ name: r._id || '未填院所', count: r.count })),
    beds: bedRows.map((r) => ({ name: r._id, count: r.count })),
  };
}
