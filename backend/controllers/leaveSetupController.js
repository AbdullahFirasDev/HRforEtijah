const mongoose = require('mongoose');
const LeaveType = require('../models/LeaveType');
const LeaveRequest = require('../models/LeaveRequest');
const LeaveBalanceEntry = require('../models/LeaveBalanceEntry');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { todayLocal } = require('../utils/dateUtils');
const { balancesFor, daysText } = require('../utils/leaves');

// Company leave policy, managed by admins: the kinds of leave and the yearly
// balances. Nothing here is assumed; every number is entered by an admin.

const TYPE_FIELDS = ['name', 'description', 'paid', 'deductsBalance', 'countMode', 'requiresAttachment', 'maxDaysPerRequest', 'allowPastDays', 'isActive', 'order'];
const PUBLIC_FIELDS = 'name description paid deductsBalance countMode requiresAttachment maxDaysPerRequest allowPastDays order';

const sameName = (name, exceptId) =>
  LeaveType.findOne({
    name: new RegExp(`^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    ...(exceptId && { _id: { $ne: exceptId } }),
  }).lean();

// ---------- Types ----------

// @desc  Leave types: the active ones, or all of them with their change log (admins, ?all=1)
// @route GET /api/leaves/types
// @access Private
const listTypes = asyncHandler(async (req, res) => {
  if (req.user.role === 'admin' && req.query.all) {
    const [types, usage] = await Promise.all([
      LeaveType.find().sort({ order: 1, name: 1 }).lean(),
      LeaveRequest.aggregate([{ $group: { _id: '$leaveType', n: { $sum: 1 } } }]),
    ]);
    const used = new Map(usage.map((u) => [String(u._id), u.n]));
    return res.json({ success: true, types: types.map((t) => ({ ...t, requests: used.get(String(t._id)) || 0 })) });
  }
  const types = await LeaveType.find({ isActive: true }).select(PUBLIC_FIELDS).sort({ order: 1, name: 1 }).lean();
  res.json({ success: true, types });
});

// @desc  Admin adds a kind of leave
// @route POST /api/leaves/types
// @access Private (admin)
const createType = asyncHandler(async (req, res) => {
  if (await sameName(req.body.name)) throw new ApiError(409, 'يوجد نوع إجازة بهذا الاسم');
  const fields = Object.fromEntries(TYPE_FIELDS.filter((f) => req.body[f] !== undefined).map((f) => [f, req.body[f]]));
  const type = await LeaveType.create({ ...fields, createdBy: req.user._id, changes: [] });
  res.status(201).json({ success: true, type });
});

// @desc  Admin changes a kind of leave. Requests already made keep the
//        settings they were made with; every change is logged.
// @route PATCH /api/leaves/types/:id
// @access Private (admin)
const updateType = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(404, 'نوع الإجازة غير موجود');
  const type = await LeaveType.findById(req.params.id);
  if (!type) throw new ApiError(404, 'نوع الإجازة غير موجود');
  if (req.body.name !== undefined && (await sameName(req.body.name, type._id))) throw new ApiError(409, 'يوجد نوع إجازة بهذا الاسم');

  const before = {};
  const after = {};
  for (const f of TYPE_FIELDS) {
    if (req.body[f] === undefined) continue;
    const next = req.body[f] === '' ? null : req.body[f];
    if (JSON.stringify(type[f] ?? null) === JSON.stringify(next ?? null)) continue;
    before[f] = type[f] ?? null;
    after[f] = next;
    type[f] = next;
  }
  if (Object.keys(after).length) {
    type.changes.push({ by: req.user._id, byName: req.user.name, at: new Date(), before, after });
    await type.save();
  }
  res.json({ success: true, type, changed: Object.keys(after) });
});

// ---------- Balances ----------

// Types shown in the balances table for a year: those that use a balance,
// and any with balance entries that year
const balanceTypes = async (year) => {
  const withEntries = await LeaveBalanceEntry.distinct('leaveType', { year });
  return LeaveType.find({ $or: [{ deductsBalance: true }, { _id: { $in: withEntries } }] })
    .select('name deductsBalance isActive')
    .sort({ order: 1, name: 1 })
    .lean();
};

// @desc  Every employee's balance of each type for a year
// @route GET /api/leaves/balances?year=2026
// @access Private (admin)
const getBalances = asyncHandler(async (req, res) => {
  const year = Number(req.query.year) || Number(todayLocal().slice(0, 4));
  const [types, employees] = await Promise.all([
    balanceTypes(year),
    User.find({ role: 'employee' }).select('name department employeeNumber isActive').sort({ isActive: -1, name: 1 }).lean(),
  ]);
  const balances = await balancesFor({ userIds: employees.map((e) => e._id), typeIds: types.map((t) => t._id), year });
  res.json({
    success: true,
    year,
    types,
    rows: employees.map((e) => ({
      user: e,
      balances: Object.fromEntries(types.map((t) => [String(t._id), balances.get(e._id, t._id)])),
    })),
  });
});

// @desc  Ledger lines (grants and adjustments) with who wrote them
// @route GET /api/leaves/balances/entries?user=&leaveType=&year=
// @access Private (admin)
const getBalanceEntries = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.user && mongoose.isValidObjectId(req.query.user)) filter.user = req.query.user;
  if (req.query.leaveType && mongoose.isValidObjectId(req.query.leaveType)) filter.leaveType = req.query.leaveType;
  if (req.query.year) filter.year = Number(req.query.year);
  const entries = await LeaveBalanceEntry.find(filter)
    .populate('user', 'name')
    .populate('leaveType', 'name')
    .sort({ createdAt: -1 })
    .limit(500)
    .lean();
  res.json({ success: true, entries });
});

const loadEmployeeAndType = async (userId, typeId) => {
  const [user, type] = await Promise.all([
    User.findOne({ _id: userId, role: 'employee' }).select('name').lean(),
    LeaveType.findById(typeId).select('name').lean(),
  ]);
  if (!user) throw new ApiError(404, 'الموظف غير موجود');
  if (!type) throw new ApiError(404, 'نوع الإجازة غير موجود');
  return { user, type };
};

// @desc  Admin grants an employee's yearly balance (once per type and year)
//        or records an adjustment (+/-) with its reason
// @route POST /api/leaves/balances
// @access Private (admin)
const addBalanceEntry = asyncHandler(async (req, res) => {
  const { user: userId, leaveType, year, kind, days } = req.body;
  const { user, type } = await loadEmployeeAndType(userId, leaveType);
  try {
    const entry = await LeaveBalanceEntry.create({
      user: user._id,
      leaveType: type._id,
      year,
      kind,
      days,
      reason: req.body.reason.trim(),
      by: req.user._id,
      byName: req.user.name,
      ...(kind === 'grant' && { key: `grant:${user._id}:${type._id}:${year}` }),
    });
    const balance = (await balancesFor({ userIds: [user._id], typeIds: [type._id], year })).get(user._id, type._id);
    res.status(201).json({ success: true, entry, balance });
  } catch (err) {
    if (err.code === 11000) {
      throw new ApiError(409, `سبق منح رصيد «${type.name}» لسنة ${year} لـ ${user.name}. لتغييره أضف تسوية بالفرق.`);
    }
    throw err;
  }
});

// @desc  Admin grants the same yearly balance to many employees at once;
//        anyone already granted that type and year is skipped
// @route POST /api/leaves/balances/grant
// @access Private (admin)
const bulkGrant = asyncHandler(async (req, res) => {
  const { leaveType, year, days } = req.body;
  const type = await LeaveType.findById(leaveType).select('name').lean();
  if (!type) throw new ApiError(404, 'نوع الإجازة غير موجود');
  const filter = req.body.users ? { _id: { $in: req.body.users }, role: 'employee' } : { role: 'employee', isActive: true };
  const employees = await User.find(filter).select('_id').lean();
  if (!employees.length) throw new ApiError(400, 'لا يوجد موظفون لمنحهم الرصيد');
  const now = new Date();
  const ops = employees.map((e) => {
    const key = `grant:${e._id}:${type._id}:${year}`;
    return {
      updateOne: {
        filter: { key },
        update: {
          $setOnInsert: {
            user: e._id,
            leaveType: type._id,
            year,
            kind: 'grant',
            days,
            reason: req.body.reason.trim(),
            by: req.user._id,
            byName: req.user.name,
            key,
            createdAt: now,
            updatedAt: now,
          },
        },
        upsert: true,
      },
    };
  });
  const result = await LeaveBalanceEntry.collection.bulkWrite(ops, { ordered: false });
  const granted = result.upsertedCount || 0;
  res.status(201).json({
    success: true,
    granted,
    skipped: employees.length - granted,
    message:
      `مُنح رصيد «${type.name}» لسنة ${year} (${daysText(days)}) لعدد ${granted} من الموظفين` +
      (employees.length - granted ? `، وتُرك ${employees.length - granted} سبق منحهم.` : '.'),
  });
});

module.exports = { listTypes, createType, updateType, getBalances, getBalanceEntries, addBalanceEntry, bulkGrant };
