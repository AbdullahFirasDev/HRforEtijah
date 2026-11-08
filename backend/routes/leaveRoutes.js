const express = require('express');
const { query } = require('express-validator');
const leaves = require('../controllers/leaveController');
const setup = require('../controllers/leaveSetupController');
const { protect, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');
const {
  requireLeaves,
  readFile,
  yearRule,
  typeRules,
  requestRules,
  previewRules,
  reviewRules,
  cancelRules,
  revokeRules,
  balanceEntryRules,
  bulkGrantRules,
} = require('../utils/leaves');

// Leave requests (إجازات). Every route checks the role here and, for a
// single request, who may see or decide it in the controller.
const router = express.Router();

router.use(protect);
router.get('/meta', leaves.getMeta);
router.use(requireLeaves);

// Leave types (policy): everyone reads the active ones, admins manage them
router.get('/types', setup.listTypes);
router.post('/types', authorize('admin'), typeRules(true), validate, setup.createType);
router.patch('/types/:id', authorize('admin'), typeRules(false), validate, setup.updateType);

// Balances: admins only (employees see their own in /me)
router.get('/balances', authorize('admin'), [yearRule('year', query)], validate, setup.getBalances);
router.get('/balances/entries', authorize('admin'), [yearRule('year', query)], validate, setup.getBalanceEntries);
router.post('/balances', authorize('admin'), balanceEntryRules, validate, setup.addBalanceEntry);
router.post('/balances/grant', authorize('admin'), bulkGrantRules, validate, setup.bulkGrant);

// The employee's side
router.post('/preview', authorize('employee'), previewRules, validate, leaves.previewRequest);
router.post('/attachments', authorize('employee'), readFile, leaves.uploadDraft);
router.delete('/attachments/:attId', authorize('employee'), leaves.deleteDraft);
router.get('/me', [yearRule('year', query)], validate, leaves.getMyRequests);
router.post('/', authorize('employee'), requestRules, validate, leaves.createRequest);

// Reviewers
router.get('/review', authorize('manager', 'admin'), leaves.listForReview);
router.get('/filters', authorize('manager', 'admin'), leaves.getFilters);
router.get('/report', authorize('manager', 'admin'), leaves.getReport);
router.get('/statement', [yearRule('year', query)], validate, leaves.getStatement);

// One request
router.get('/:id', leaves.getRequest);
router.post('/:id/cancel', cancelRules, validate, leaves.cancelRequest);
router.patch('/:id/review', authorize('manager', 'admin'), reviewRules, validate, leaves.reviewRequest);
router.post('/:id/revoke', authorize('admin'), revokeRules, validate, leaves.revokeRequest);
router.post('/:id/attachments', authorize('employee'), readFile, leaves.addAttachment);
router.delete('/:id/attachments/:attId', authorize('employee'), leaves.removeAttachment);
router.get('/:id/attachments/:attId', leaves.getAttachment);

module.exports = router;
