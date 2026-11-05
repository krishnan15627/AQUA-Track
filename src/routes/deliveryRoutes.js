const express = require('express');
const {
  getDeliveries,
  assignDelivery,
  completeDelivery,
  failDelivery
} = require('../controllers/deliveryController');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.route('/')
  .get(getDeliveries);

router.patch('/:id/assign', authorize('owner'), assignDelivery);
router.post('/:id/complete', authorize('owner', 'staff'), completeDelivery);
router.post('/:id/fail', authorize('owner', 'staff'), failDelivery);

module.exports = router;
