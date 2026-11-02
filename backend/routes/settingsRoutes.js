const express = require('express');
const { body } = require('express-validator');
const { getGeofence, updateGeofence } = require('../controllers/settingsController');
const { protect, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');

const router = express.Router();

router.use(protect, authorize('admin'));

const geofenceRules = [
  body('enabled', 'قيمة تفعيل التحقق من الموقع غير صحيحة').isBoolean({ strict: true }),
  body('lat', 'خط العرض يجب أن يكون رقماً بين -90 و90').optional({ values: 'null' }).isFloat({ min: -90, max: 90 }).toFloat(),
  body('lng', 'خط الطول يجب أن يكون رقماً بين -180 و180').optional({ values: 'null' }).isFloat({ min: -180, max: 180 }).toFloat(),
  body('lng').custom((lng, { req }) => {
    const { lat, enabled } = req.body;
    if ((lat == null) !== (lng == null)) throw new Error('أدخل خط العرض وخط الطول معاً');
    if (enabled === true && lat == null) throw new Error('حدّد موقع مقر العمل قبل تفعيل التحقق من الموقع');
    return true;
  }),
  body('radius', 'نطاق الحضور يجب أن يكون بين 20 و20000 متر').isInt({ min: 20, max: 20000 }).toInt(),
  body('maxAccuracy', 'هامش دقة الموقع المقبول يجب أن يكون بين 10 و5000 متر').isInt({ min: 10, max: 5000 }).toInt(),
];

router.get('/geofence', getGeofence);
router.put('/geofence', geofenceRules, validate, updateGeofence);

module.exports = router;
