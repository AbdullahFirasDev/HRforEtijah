const express = require('express');
const { getDailyReport, exportDailyReportCsv } = require('../controllers/reportController');
const { protect } = require('../middleware/auth');
const closeOverdue = require('../middleware/closeOverdue');

const router = express.Router();

router.use(protect, closeOverdue);

router.get('/daily', getDailyReport);
router.get('/daily/export', exportDailyReportCsv);

module.exports = router;
