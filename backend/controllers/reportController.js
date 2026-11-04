const Attendance = require('../models/Attendance');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const { todayLocal } = require('../utils/dateUtils');

const todayStr = todayLocal;

// Builds the base query according to the requester's role:
// employee -> only their own records, manager -> their team, admin -> everyone
const buildScopedQuery = async (req) => {
  const { date, from, to, userId } = req.query;
  const query = {};

  if (req.user.role === 'employee') {
    query.user = req.user._id;
  } else if (req.user.role === 'manager') {
    const team = await User.find({ manager: req.user._id }).select('_id');
    const teamIds = team.map((u) => u._id);
    query.user = userId && teamIds.map(String).includes(userId) ? userId : { $in: teamIds };
  } else if (req.user.role === 'admin') {
    if (userId) query.user = userId;
  }

  if (date) {
    query.date = date;
  } else if (from || to) {
    query.date = {};
    if (from) query.date.$gte = from;
    if (to) query.date.$lte = to;
  } else {
    // Default to today's report if no range is specified
    query.date = todayStr();
  }

  return query;
};

// @desc  Generate attendance report (JSON), scoped by role
// @route GET /api/reports/daily
// @access Private
const getDailyReport = asyncHandler(async (req, res) => {
  const query = await buildScopedQuery(req);

  const records = await Attendance.find(query)
    .populate('user', 'name email role')
    .sort({ date: -1, 'user.name': 1 });

  const report = records.map((r) => {
    const sessions = r.workSessions();
    return {
      id: r._id,
      name: r.user?.name,
      email: r.user?.email,
      date: r.date,
      punchInTime: r.punchIn?.time || null,
      punchOutTime: r.punchOut?.time || null,
      punchInSelfie: sessions[0]?.punchIn?.selfie || null,
      punchOutSelfie: sessions[sessions.length - 1]?.punchOut?.selfie || null,
      faceVerified: sessions.some((s) => s.punchIn?.faceDistance != null),
      location: r.punchIn?.location || null,
      totalHours: r.totalHours,
      status: r.status,
      sessionsCount: sessions.length,
      lateMinutes: r.lateMinutes || 0,
      earlyLeaveMinutes: r.earlyLeaveMinutes || 0,
      dayOff: !!r.schedule?.dayOff,
      missedPunchOut: !!r.missedPunchOut,
      edited: !!r.edits?.length,
      overtimeMinutes: r.overtimeMinutes || 0,
      leaveMinutes: r.leaveMinutes || 0,
      validationStatus: r.validation?.status,
      validationRemarks: r.validation?.remarks,
    };
  });

  res.json({ success: true, count: report.length, report });
});

// @desc  Export the same report as CSV
// @route GET /api/reports/daily/export
// @access Private
const exportDailyReportCsv = asyncHandler(async (req, res) => {
  const query = await buildScopedQuery(req);

  const records = await Attendance.find(query).populate('user', 'name email role').sort({ date: -1 });

  const header = [
    'Name',
    'Email',
    'Date',
    'Punch In',
    'Punch Out',
    'Latitude',
    'Longitude',
    'Total Hours',
    'Status',
    'Periods',
    'Late (min)',
    'Early Leave (min)',
    'Day Off',
    'Missed Punch-out',
    'Overtime (min)',
    'Validation',
    'Remarks',
  ];

  const rows = records.map((r) => [
    r.user?.name || '',
    r.user?.email || '',
    r.date,
    r.punchIn?.time ? new Date(r.punchIn.time).toISOString() : '',
    r.punchOut?.time ? new Date(r.punchOut.time).toISOString() : '',
    r.punchIn?.location?.lat ?? '',
    r.punchIn?.location?.lng ?? '',
    r.totalHours ?? 0,
    r.status,
    r.workSessions().length,
    r.lateMinutes || 0,
    r.earlyLeaveMinutes || 0,
    r.schedule?.dayOff ? 'Yes' : 'No',
    r.missedPunchOut ? 'Yes' : 'No',
    r.overtimeMinutes || 0,
    r.validation?.status || 'Pending',
    (r.validation?.remarks || '').replace(/,/g, ';'),
  ]);

  const csv = [header, ...rows].map((row) => row.join(',')).join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="attendance-report.csv"');
  res.send(csv);
});

module.exports = { getDailyReport, exportDailyReportCsv };
