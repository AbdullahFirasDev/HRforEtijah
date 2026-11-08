const mongoose = require('mongoose');
const LeaveType = require('../models/LeaveType');
const LeaveRequest = require('../models/LeaveRequest');
const LeaveAttachment = require('../models/LeaveAttachment');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { addDays, todayLocal } = require('../utils/dateUtils');
const notifyEvents = require('../utils/notifyEvents');
const {
  ACTIVE,
  STATUSES,
  MAX_FILES,
  MAX_DRAFTS,
  DRAFT_HOURS,
  leavesReady,
  isValidDate,
  checkDates,
  findOverlap,
  balancesFor,
  checkBalance,
  nextRequestNumber,
  historyEntry,
  attachmentView,
} = require('../utils/leaves');

// Who sees what: an employee only their own requests; a manager the requests
// of the employees assigned to them; an admin everyone's. A request someone
// may not see answers 404, as if it didn't exist.

const USER_FIELDS = 'name email role manager employeeNumber department jobTitle isActive';
const isAdmin = (u) => u.role === 'admin';
const idOf = (ref) => String(ref?._id || ref || '');
const ownerOf = (r) => idOf(r.user);
const isOwner = (viewer, r) => ownerOf(r) === String(viewer._id);
const managesOwner = (viewer, r) => viewer.role === 'manager' && idOf(r.user?.manager) === String(viewer._id);
const canView = (viewer, r) => isAdmin(viewer) || isOwner(viewer, r) || managesOwner(viewer, r);
const canReview = (viewer, r) => r.status === 'Pending' && !isOwner(viewer, r) && (isAdmin(viewer) || managesOwner(viewer, r));

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const notFound = () => new ApiError(404, 'طلب الإجازة غير موجود');

const loadRequest = async (id) => {
  if (!mongoose.isValidObjectId(id)) throw notFound();
  const request = await LeaveRequest.findById(id).populate('user', USER_FIELDS);
  if (!request) throw notFound();
  return request;
};

const loadVisible = async (req) => {
  const request = await loadRequest(req.params.id);
  if (!canView(req.user, request)) throw notFound();
  return request;
};

// The employees a reviewer oversees (null: everyone, for admins)
const scopeUserIds = async (viewer) => {
  if (isAdmin(viewer)) return null;
  const team = await User.find({ manager: viewer._id }).select('_id').lean();
  return team.map((u) => u._id);
};

const permissionsFor = (viewer, r) => ({
  canReview: canReview(viewer, r),
  canCancel: isOwner(viewer, r) && (r.status === 'Pending' || (r.status === 'Approved' && r.startDate > todayLocal())),
  canRevoke: isAdmin(viewer) && !isOwner(viewer, r) && r.status === 'Approved',
  canEditAttachments: isOwner(viewer, r) && r.status === 'Pending',
});

const balanceOf = async (r) => {
  if (!r.policy?.deductsBalance) return null;
  const year = Number(r.startDate.slice(0, 4));
  const balances = await balancesFor({ userIds: [r.user._id || r.user], typeIds: [r.leaveType], year });
  return { year, ...balances.get(r.user._id || r.user, r.leaveType) };
};

// ---------- Meta ----------

// @desc  Is the leave section set up, and what may the signed-in user do
// @route GET /api/leaves/meta
// @access Private
const getMeta = asyncHandler(async (req, res) => {
  const ready = await leavesReady();
  res.json({ success: true, ready, today: todayLocal(), canRequest: req.user.role === 'employee', canManage: req.user.role !== 'employee' });
});

// ---------- The employee's own requests ----------

// @desc  How many days a request would count, and the balance it would use
// @route POST /api/leaves/preview
// @access Private (employee)
const previewRequest = asyncHandler(async (req, res) => {
  const { leaveType, startDate, endDate } = req.body;
  const type = await LeaveType.findOne({ _id: leaveType, isActive: true }).lean();
  if (!type) throw new ApiError(400, 'نوع الإجازة غير متاح');
  try {
    const { all, counted } = checkDates(req.user, type, startDate, endDate);
    const overlap = await findOverlap(req.user._id, startDate, endDate);
    let balance = null;
    if (type.deductsBalance) {
      const year = Number(startDate.slice(0, 4));
      balance = { year, ...(await balancesFor({ userIds: [req.user._id], typeIds: [type._id], year })).get(req.user._id, type._id) };
    }
    let balanceError = null;
    if (type.deductsBalance) {
      try {
        await checkBalance(req.user._id, type, counted);
      } catch (err) {
        balanceError = err.message;
      }
    }
    res.json({
      success: true,
      ok: !overlap && !balanceError,
      days: counted.length,
      calendarDays: all.length,
      excluded: all.filter((d) => !counted.includes(d)),
      balance,
      message: overlap
        ? `يتداخل مع طلبك رقم ${overlap.number} (${overlap.startDate} إلى ${overlap.endDate})`
        : balanceError,
    });
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;
    res.json({ success: true, ok: false, message: err.message });
  }
});

// @desc  Employee submits a leave request
// @route POST /api/leaves
// @access Private (employee)
const createRequest = asyncHandler(async (req, res) => {
  const { leaveType, startDate, endDate } = req.body;
  const reason = req.body.reason.trim();
  const notes = (req.body.notes || '').trim();
  const me = req.user;

  const type = await LeaveType.findOne({ _id: leaveType, isActive: true });
  if (!type) throw new ApiError(400, 'نوع الإجازة غير متاح');
  const { all, counted } = checkDates(me, type, startDate, endDate);

  const overlap = await findOverlap(me._id, startDate, endDate);
  if (overlap) {
    throw new ApiError(409, `يتداخل هذا الطلب مع طلبك رقم ${overlap.number} (${overlap.startDate} إلى ${overlap.endDate})`);
  }

  const ids = [...new Set((req.body.attachments || []).map(String))];
  const drafts = ids.length
    ? await LeaveAttachment.find({ _id: { $in: ids }, owner: me._id, request: null }).select('-data').lean()
    : [];
  if (drafts.length !== ids.length) {
    throw new ApiError(400, 'أحد المرفقات لم يعد متاحاً (يُحذف المرفق إن لم يُرسل الطلب خلال يوم من رفعه). أرفقه من جديد.');
  }
  if (type.requiresAttachment && !drafts.length) throw new ApiError(400, `«${type.name}» تتطلب إرفاق مستند داعم`);

  if (type.deductsBalance) await checkBalance(me._id, type, counted);

  const now = new Date();
  const request = await LeaveRequest.create({
    number: await nextRequestNumber(),
    user: me._id,
    leaveType: type._id,
    typeName: type.name,
    policy: {
      paid: type.paid,
      deductsBalance: type.deductsBalance,
      countMode: type.countMode,
      requiresAttachment: type.requiresAttachment,
    },
    startDate,
    endDate,
    countedDates: counted,
    days: counted.length,
    calendarDays: all.length,
    reason,
    notes,
    attachments: drafts.map((d) => ({ _id: d._id, name: d.name, type: d.type, size: d.size, at: now })),
    history: [historyEntry('submitted', me)],
  });

  // Two submissions at once (a double tap) can both pass the overlap check:
  // the later one withdraws itself
  const clash = await findOverlap(me._id, startDate, endDate, request._id);
  if (clash && String(clash._id) < String(request._id)) {
    await request.deleteOne();
    throw new ApiError(409, `يتداخل هذا الطلب مع طلبك رقم ${clash.number} (${clash.startDate} إلى ${clash.endDate})`);
  }

  if (ids.length) {
    await LeaveAttachment.updateMany(
      { _id: { $in: ids }, owner: me._id, request: null },
      { $set: { request: request._id }, $unset: { draftExpiresAt: 1 } }
    );
  }
  await notifyEvents.leaveRequested(request, me);
  res.status(201).json({ success: true, request });
});

// @desc  The signed-in employee's requests and their balances for a year
// @route GET /api/leaves/me?year=2026
// @access Private
const getMyRequests = asyncHandler(async (req, res) => {
  const year = req.query.year ? Number(req.query.year) : Number(todayLocal().slice(0, 4));
  const requests = await LeaveRequest.find({ user: req.user._id }).sort({ startDate: -1, createdAt: -1 }).limit(500).lean();

  // Types that use a balance, and any the employee has used or been granted
  const [from, to] = [`${year}-01-01`, `${year}-12-31`];
  const typeIds = new Set(
    requests.filter((r) => r.endDate >= from && r.startDate <= to && r.policy?.deductsBalance).map((r) => String(r.leaveType))
  );
  const tracked = await LeaveType.find({ deductsBalance: true, isActive: true }).select('_id').lean();
  tracked.forEach((t) => typeIds.add(String(t._id)));
  const types = await LeaveType.find({ _id: { $in: [...typeIds] } }).select('name').sort({ order: 1, name: 1 }).lean();
  const balances = await balancesFor({ userIds: [req.user._id], typeIds: types.map((t) => t._id), year });
  res.json({
    success: true,
    year,
    requests,
    balances: types.map((t) => ({ type: { id: t._id, name: t.name }, year, ...balances.get(req.user._id, t._id) })),
  });
});

// @desc  One request with its history and attachments
// @route GET /api/leaves/:id
// @access Private (the employee, their manager, an admin)
const getRequest = asyncHandler(async (req, res) => {
  const request = await loadVisible(req);
  res.json({
    success: true,
    request,
    balance: await balanceOf(request),
    permissions: permissionsFor(req.user, request),
  });
});

// @desc  Employee withdraws a pending request, or an approved one that hasn't started
// @route POST /api/leaves/:id/cancel
// @access Private (the employee)
const cancelRequest = asyncHandler(async (req, res) => {
  const request = await loadVisible(req);
  if (!isOwner(req.user, request)) throw new ApiError(403, 'يلغي الطلبَ صاحبُه فقط. يمكن للمسؤول إلغاء إجازة مقبولة من «إلغاء الإجازة».');
  const before = request.status;
  if (!ACTIVE.includes(before)) throw new ApiError(409, 'هذا الطلب مرفوض أو ملغى مسبقاً');
  if (before === 'Approved' && request.startDate <= todayLocal()) {
    throw new ApiError(409, 'بدأت هذه الإجازة، فلا يمكنك إلغاؤها بنفسك. تواصل مع الإدارة.');
  }
  const reason = (req.body.reason || '').trim();
  const updated = await LeaveRequest.findOneAndUpdate(
    { _id: request._id, status: before },
    {
      $set: { status: 'Cancelled', cancelledBy: req.user._id, cancelledByName: req.user.name, cancelledAt: new Date(), cancelReason: reason },
      $push: { history: historyEntry('cancelled', req.user, reason) },
    },
    { new: true }
  ).populate('user', USER_FIELDS);
  if (!updated) throw new ApiError(409, 'تغيّرت حالة الطلب للتو. حدّث الصفحة ثم حاول مرة أخرى.');
  await notifyEvents.leaveCancelled(updated, req.user, before === 'Approved');
  res.json({ success: true, request: updated });
});

// @desc  Approve or reject a pending request
// @route PATCH /api/leaves/:id/review
// @access Private (the employee's manager, or an admin)
const reviewRequest = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const remarks = (req.body.remarks || '').trim();
  const request = await loadVisible(req);
  if (isOwner(req.user, request)) throw new ApiError(403, 'لا يمكنك مراجعة طلبك بنفسك');
  if (!isAdmin(req.user) && !managesOwner(req.user, request)) throw new ApiError(403, 'يمكنك مراجعة طلبات أعضاء فريقك فقط');
  if (request.status !== 'Pending') throw new ApiError(409, 'تمت مراجعة هذا الطلب مسبقاً أو أُلغي');

  if (status === 'Approved' && request.policy?.deductsBalance) {
    await checkBalance(request.user._id, { _id: request.leaveType, name: request.typeName }, request.countedDates, { ownPending: true });
  }

  const updated = await LeaveRequest.findOneAndUpdate(
    { _id: request._id, status: 'Pending' },
    {
      $set: { status, reviewedBy: req.user._id, reviewedByName: req.user.name, reviewedAt: new Date(), reviewRemarks: remarks },
      $push: { history: historyEntry(status === 'Approved' ? 'approved' : 'rejected', req.user, remarks) },
    },
    { new: true }
  ).populate('user', USER_FIELDS);
  if (!updated) throw new ApiError(409, 'تمت مراجعة هذا الطلب مسبقاً أو أُلغي');
  await notifyEvents.leaveReviewed(updated, req.user);
  res.json({ success: true, request: updated });
});

// @desc  Admin cancels an approved leave (e.g. called back to work); its
//        days return to the balance. The reason is required and kept.
// @route POST /api/leaves/:id/revoke
// @access Private (admin)
const revokeRequest = asyncHandler(async (req, res) => {
  const request = await loadVisible(req);
  if (isOwner(req.user, request)) throw new ApiError(403, 'لا يمكنك إلغاء إجازتك بهذه الطريقة');
  if (request.status !== 'Approved') throw new ApiError(409, 'يمكن إلغاء الإجازات المقبولة فقط؛ أما الطلب المعلق فيُرفض');
  const reason = req.body.reason.trim();
  const updated = await LeaveRequest.findOneAndUpdate(
    { _id: request._id, status: 'Approved' },
    {
      $set: { status: 'Cancelled', cancelledBy: req.user._id, cancelledByName: req.user.name, cancelledAt: new Date(), cancelReason: reason },
      $push: { history: historyEntry('revoked', req.user, reason) },
    },
    { new: true }
  ).populate('user', USER_FIELDS);
  if (!updated) throw new ApiError(409, 'تغيّرت حالة الطلب للتو. حدّث الصفحة ثم حاول مرة أخرى.');
  await notifyEvents.leaveRevoked(updated, req.user);
  res.json({ success: true, request: updated });
});

// ---------- Attachments ----------

// @desc  Upload a file while filling the form (a draft until the request is sent)
// @route POST /api/leaves/attachments   (body: the file; X-File-Name: its name)
// @access Private (employee)
const uploadDraft = asyncHandler(async (req, res) => {
  const drafts = await LeaveAttachment.countDocuments({ owner: req.user._id, request: null });
  if (drafts >= MAX_DRAFTS) throw new ApiError(429, 'رفعت ملفات كثيرة لم تُرسل بعد. أرسل الطلب أو احذف بعضها.');
  const { data, type, size, name } = req.file;
  const file = await LeaveAttachment.create({
    owner: req.user._id,
    name,
    type,
    size,
    data,
    draftExpiresAt: new Date(Date.now() + DRAFT_HOURS * 3600e3),
  });
  res.status(201).json({ success: true, attachment: attachmentView(file) });
});

// @desc  Remove a draft file before sending the request
// @route DELETE /api/leaves/attachments/:attId
// @access Private (its owner)
const deleteDraft = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.attId)) throw new ApiError(404, 'المرفق غير موجود');
  const out = await LeaveAttachment.deleteOne({ _id: req.params.attId, owner: req.user._id, request: null });
  if (!out.deletedCount) throw new ApiError(404, 'المرفق غير موجود');
  res.json({ success: true });
});

// @desc  Add a file to a request still waiting for a decision
// @route POST /api/leaves/:id/attachments   (body: the file)
// @access Private (the employee)
const addAttachment = asyncHandler(async (req, res) => {
  const request = await loadVisible(req);
  if (!isOwner(req.user, request)) throw new ApiError(403, 'يضيف المرفقاتِ صاحبُ الطلب فقط');
  if (request.status !== 'Pending') throw new ApiError(409, 'يمكن إضافة المرفقات قبل مراجعة الطلب فقط');
  if (request.attachments.length >= MAX_FILES) throw new ApiError(409, `يمكن إرفاق ${MAX_FILES} ملفات كحد أقصى`);
  const { data, type, size, name } = req.file;
  const file = await LeaveAttachment.create({ owner: req.user._id, request: request._id, name, type, size, data });
  const updated = await LeaveRequest.findOneAndUpdate(
    { _id: request._id, status: 'Pending', [`attachments.${MAX_FILES - 1}`]: { $exists: false } },
    {
      $push: {
        attachments: { _id: file._id, name, type, size, at: file.createdAt },
        history: historyEntry('attachmentAdded', req.user, name),
      },
    },
    { new: true }
  ).populate('user', USER_FIELDS);
  if (!updated) {
    await LeaveAttachment.deleteOne({ _id: file._id });
    throw new ApiError(409, 'تغيّر الطلب للتو (رُوجع أو اكتملت مرفقاته). حدّث الصفحة.');
  }
  res.status(201).json({ success: true, request: updated, attachment: attachmentView(file) });
});

// @desc  Remove a file from a request still waiting for a decision
// @route DELETE /api/leaves/:id/attachments/:attId
// @access Private (the employee)
const removeAttachment = asyncHandler(async (req, res) => {
  const request = await loadVisible(req);
  if (!isOwner(req.user, request)) throw new ApiError(403, 'يحذف المرفقاتِ صاحبُ الطلب فقط');
  if (request.status !== 'Pending') throw new ApiError(409, 'يمكن حذف المرفقات قبل مراجعة الطلب فقط');
  const ref = request.attachments.find((a) => String(a._id) === req.params.attId);
  if (!ref) throw new ApiError(404, 'المرفق غير موجود');
  if (request.policy?.requiresAttachment && request.attachments.length === 1) {
    throw new ApiError(409, `«${request.typeName}» تتطلب مرفقاً واحداً على الأقل. أضف المستند الجديد قبل حذف القديم.`);
  }
  const updated = await LeaveRequest.findOneAndUpdate(
    { _id: request._id, status: 'Pending', 'attachments._id': ref._id },
    { $pull: { attachments: { _id: ref._id } }, $push: { history: historyEntry('attachmentRemoved', req.user, ref.name) } },
    { new: true }
  ).populate('user', USER_FIELDS);
  if (!updated) throw new ApiError(409, 'تغيّر الطلب للتو. حدّث الصفحة.');
  await LeaveAttachment.deleteOne({ _id: ref._id, request: request._id });
  res.json({ success: true, request: updated });
});

// @desc  Download one attachment of a request
// @route GET /api/leaves/:id/attachments/:attId
// @access Private (whoever may see the request)
const getAttachment = asyncHandler(async (req, res) => {
  const request = await loadVisible(req);
  const ref = request.attachments.find((a) => String(a._id) === req.params.attId);
  if (!ref) throw new ApiError(404, 'المرفق غير موجود');
  const file = await LeaveAttachment.findOne({ _id: ref._id, request: request._id });
  if (!file) throw new ApiError(404, 'المرفق غير موجود');
  res.set({
    'Content-Type': file.type,
    'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    'Cache-Control': 'private, no-store',
  });
  res.send(Buffer.from(file.data));
});

// ---------- Reviewers ----------

const userFilter = async (viewer, { q, department, user }) => {
  const scope = await scopeUserIds(viewer);
  const match = {};
  if (scope) match._id = { $in: scope };
  if (user) {
    if (!mongoose.isValidObjectId(user)) return [];
    match._id = scope ? { $in: scope.filter((id) => String(id) === String(user)) } : user;
  }
  const text = String(q || '').trim();
  if (text) {
    const re = new RegExp(escapeRegex(text.slice(0, 80)), 'i');
    match.$or = [{ name: re }, { email: re }, { employeeNumber: re }];
  }
  const dept = String(department || '').trim();
  if (dept) match.department = new RegExp(`^${escapeRegex(dept.slice(0, 80))}$`, 'i');
  if (!scope && !user && !text && !dept) return null; // everyone
  return (await User.find(match).select('_id').lean()).map((u) => u._id);
};

const requestFilter = async (viewer, query) => {
  const filter = {};
  const users = await userFilter(viewer, query);
  if (users) filter.user = { $in: users };
  if (STATUSES.includes(query.status)) filter.status = query.status;
  if (query.type && mongoose.isValidObjectId(query.type)) filter.leaveType = query.type;
  if (isValidDate(query.from)) filter.endDate = { $gte: query.from };
  if (isValidDate(query.to)) filter.startDate = { $lte: query.to };
  return filter;
};

// @desc  Requests of the people the reviewer oversees, with filters
// @route GET /api/leaves/review?status=&type=&from=&to=&q=&department=&user=
// @access Private (manager: their team, admin: everyone)
const listForReview = asyncHandler(async (req, res) => {
  const filter = await requestFilter(req.user, req.query);
  const limit = Math.min(Math.max(Number(req.query.limit) || 300, 1), 1000);
  const scope = await scopeUserIds(req.user);
  const [requests, pending] = await Promise.all([
    LeaveRequest.find(filter)
      .select('-countedDates -history')
      .populate('user', USER_FIELDS)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean(),
    LeaveRequest.countDocuments({ status: 'Pending', ...(scope && { user: { $in: scope } }) }),
  ]);
  res.json({ success: true, requests, pending, limit });
});

// @desc  Choices for the filters: leave types, departments, employees
// @route GET /api/leaves/filters
// @access Private (manager, admin)
const getFilters = asyncHandler(async (req, res) => {
  const scope = await scopeUserIds(req.user);
  const [types, employees] = await Promise.all([
    LeaveType.find().select('name isActive deductsBalance').sort({ order: 1, name: 1 }).lean(),
    User.find(scope ? { _id: { $in: scope } } : { role: 'employee' })
      .select('name department employeeNumber jobTitle isActive')
      .sort({ name: 1 })
      .lean(),
  ]);
  const departments = [...new Set(employees.map((e) => (e.department || '').trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'ar')
  );
  res.json({ success: true, types, employees, departments });
});

// ---------- Printable statements ----------

// @desc  One employee's leaves for a year, with balances (كشف إجازات الموظف)
// @route GET /api/leaves/statement?user=&year=
// @access Private (the employee themself, their manager, an admin)
const getStatement = asyncHandler(async (req, res) => {
  const year = Number(req.query.year) || Number(todayLocal().slice(0, 4));
  if (year < 2000 || year > 2100) throw new ApiError(400, 'السنة غير صحيحة');
  const userId = req.query.user || String(req.user._id);
  if (!mongoose.isValidObjectId(userId)) throw new ApiError(404, 'الموظف غير موجود');
  const employee = await User.findById(userId).select(USER_FIELDS).lean();
  const allowed =
    employee &&
    (isAdmin(req.user) || String(employee._id) === String(req.user._id) || (req.user.role === 'manager' && idOf(employee.manager) === String(req.user._id)));
  if (!allowed) throw new ApiError(404, 'الموظف غير موجود');

  const [from, to] = [`${year}-01-01`, `${year}-12-31`];
  const requests = await LeaveRequest.find({ user: employee._id, startDate: { $lte: to }, endDate: { $gte: from } })
    .select('-history')
    .sort({ startDate: 1, createdAt: 1 })
    .lean();
  const typeIds = new Set(requests.map((r) => String(r.leaveType)));
  (await LeaveType.find({ deductsBalance: true }).select('_id').lean()).forEach((t) => typeIds.add(String(t._id)));
  const types = await LeaveType.find({ _id: { $in: [...typeIds] } }).select('name deductsBalance paid').sort({ order: 1, name: 1 }).lean();
  const balances = await balancesFor({ userIds: [employee._id], typeIds: types.map((t) => t._id), year });
  const inYear = (r) => r.countedDates.filter((d) => d >= from && d <= to).length;

  res.json({
    success: true,
    year,
    employee,
    requests: requests.map(({ countedDates, ...r }) => ({ ...r, daysInPeriod: inYear({ countedDates }) })),
    summary: types.map((t) => {
      const mine = requests.filter((r) => String(r.leaveType) === String(t._id));
      return {
        type: { id: t._id, name: t.name, paid: t.paid, deductsBalance: t.deductsBalance },
        approvedDays: mine.filter((r) => r.status === 'Approved').reduce((s, r) => s + inYear(r), 0),
        pendingDays: mine.filter((r) => r.status === 'Pending').reduce((s, r) => s + inYear(r), 0),
        requests: mine.length,
        balance: t.deductsBalance || balances.get(employee._id, t._id).total ? balances.get(employee._id, t._id) : null,
      };
    }),
    printedBy: req.user.name,
  });
});

// @desc  Leaves of the reviewer's people in a period (تقرير الإجازات)
// @route GET /api/leaves/report?from=&to=&status=&type=&department=&user=&q=
// @access Private (manager: their team, admin: everyone)
const getReport = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  if (!isValidDate(from) || !isValidDate(to)) throw new ApiError(400, 'حدّد بداية الفترة ونهايتها');
  if (to < from) throw new ApiError(400, 'نهاية الفترة يجب أن تكون بعد بدايتها');
  if (to > addDays(from, 2 * 366)) throw new ApiError(400, 'أطول فترة للتقرير سنتان');
  const filter = await requestFilter(req.user, req.query);
  const requests = await LeaveRequest.find(filter)
    .select('-history')
    .populate('user', USER_FIELDS)
    .sort({ startDate: 1, createdAt: 1 })
    .limit(3000)
    .lean();
  const rows = requests.map(({ countedDates, ...r }) => ({
    ...r,
    daysInPeriod: countedDates.filter((d) => d >= from && d <= to).length,
  }));

  const group = (keyFn, labelFn) => {
    const map = new Map();
    for (const r of rows) {
      const k = keyFn(r);
      if (!map.has(k)) map.set(k, { ...labelFn(r), requests: 0, approvedDays: 0, pendingDays: 0 });
      const g = map.get(k);
      g.requests += 1;
      if (r.status === 'Approved') g.approvedDays += r.daysInPeriod;
      if (r.status === 'Pending') g.pendingDays += r.daysInPeriod;
    }
    return [...map.values()];
  };

  res.json({
    success: true,
    from,
    to,
    rows,
    byType: group(
      (r) => String(r.leaveType),
      (r) => ({ name: r.typeName, paid: r.policy?.paid })
    ).sort((a, b) => b.approvedDays - a.approvedDays),
    byEmployee: group(
      (r) => ownerOf(r),
      (r) => ({ name: r.user?.name || '-', department: r.user?.department || '', employeeNumber: r.user?.employeeNumber || '' })
    ).sort((a, b) => a.name.localeCompare(b.name, 'ar')),
    totals: {
      requests: rows.length,
      approvedDays: rows.filter((r) => r.status === 'Approved').reduce((s, r) => s + r.daysInPeriod, 0),
      pendingDays: rows.filter((r) => r.status === 'Pending').reduce((s, r) => s + r.daysInPeriod, 0),
    },
    truncated: requests.length >= 3000,
    printedBy: req.user.name,
  });
});

module.exports = {
  getMeta,
  previewRequest,
  createRequest,
  getMyRequests,
  getRequest,
  cancelRequest,
  reviewRequest,
  revokeRequest,
  uploadDraft,
  deleteDraft,
  addAttachment,
  removeAttachment,
  getAttachment,
  listForReview,
  getFilters,
  getStatement,
  getReport,
};
