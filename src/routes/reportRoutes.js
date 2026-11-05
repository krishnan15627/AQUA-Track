const express = require('express');
const {
  getDashboardMetrics,
  getAnalytics
} = require('../controllers/reportController');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect, authorize('owner'));

router.get('/dashboard', getDashboardMetrics);
router.get('/analytics', getAnalytics);

module.exports = router;
