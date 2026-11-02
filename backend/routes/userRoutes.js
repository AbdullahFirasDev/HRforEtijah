const express = require('express');
const { getAllUsers, createUser, getManagersList, getMyTeam, updateUser } = require('../controllers/userController');
const { protect, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { newUserRules } = require('../utils/userAccount');

const router = express.Router();

// Public - used by the signup form to let an employee pick their manager
router.get('/managers', getManagersList);

router.use(protect);

router.get('/', authorize('admin'), getAllUsers);
router.post('/', authorize('admin'), newUserRules, validate, createUser);
router.get('/team', authorize('manager', 'admin'), getMyTeam);
router.patch('/:id', authorize('admin'), updateUser);

module.exports = router;
