const express = require('express');
const {
  getOrders,
  createOrder,
  updateOrderStatus
} = require('../controllers/orderController');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.route('/')
  .get(authorize('owner', 'customer'), getOrders)
  .post(authorize('owner', 'customer'), createOrder);

router.patch('/:id/status', authorize('owner', 'customer'), updateOrderStatus);

module.exports = router;
