const express = require('express');
const { getStaff, createStaff } = require('../controllers/userController');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect, authorize('owner'));

router.get('/staff', getStaff);
router.post('/staff', createStaff);

module.exports = router;
