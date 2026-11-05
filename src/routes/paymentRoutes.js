const express = require('express');
const {
  getPayments,
  recordPayment
} = require('../controllers/paymentController');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.route('/')
  .get(authorize('owner', 'customer'), getPayments)
  .post(authorize('owner'), recordPayment);

module.exports = router;
