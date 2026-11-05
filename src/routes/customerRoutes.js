const express = require('express');
const {
  getCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  toggleCustomerStatus
} = require('../controllers/customerController');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.route('/')
  .get(authorize('owner', 'customer'), getCustomers)
  .post(authorize('owner'), createCustomer);

router.route('/:id')
  .get(authorize('owner', 'customer'), getCustomerById)
  .put(authorize('owner'), updateCustomer);

router.patch('/:id/toggle-status', authorize('owner'), toggleCustomerStatus);

module.exports = router;
