const express = require('express');
const {
  getInventory,
  adjustStock,
  getStockMovements
} = require('../controllers/inventoryController');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect, authorize('owner'));

router.get('/', getInventory);
router.post('/adjust', adjustStock);
router.get('/movements', getStockMovements);

module.exports = router;
