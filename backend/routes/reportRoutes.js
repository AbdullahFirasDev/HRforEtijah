const express = require('express');
const { getDailyReport, exportDailyReportCsv } = require('../controllers/reportController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.get('/daily', getDailyReport);
router.get('/daily/export', exportDailyReportCsv);

module.exports = router;
