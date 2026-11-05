const { supabase, isDbReady } = require('../config/supabase');
const { memState } = require('../utils/dataStore');
const { mapRow, mapRows, throwIfError } = require('../utils/supabaseHelpers');

const getInventoryRow = async () => {
  const { data, error } = await supabase
    .from('inventory')
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  throwIfError(error);

  if (data) return data;

  const { data: created, error: createError } = await supabase
    .from('inventory')
    .insert({
      id: 1,
      full_cans_ready: 0,
      empty_cans_refill: 0,
      with_delivery_staff: 0,
      damaged_unavailable: 0,
      total_cans: 0
    })
    .select()
    .single();
  throwIfError(createError);
  return created;
};

// @desc    Get current inventory and stock status
// @route   GET /api/inventory
// @access  Private
exports.getInventory = async (req, res, next) => {
  try {
    if (isDbReady()) {
      const inv = await getInventoryRow();
      const totalCans =
        inv.full_cans_ready +
        inv.empty_cans_refill +
        inv.with_delivery_staff +
        inv.damaged_unavailable;

      return res.status(200).json({
        success: true,
        data: {
          fullCansReady: inv.full_cans_ready,
          emptyCansRefill: inv.empty_cans_refill,
          withDeliveryStaff: inv.with_delivery_staff,
          damagedUnavailable: inv.damaged_unavailable,
          totalCans,
          isLowStock: inv.full_cans_ready < (inv.low_stock_threshold || 25),
          lowStockThreshold: inv.low_stock_threshold || 25
        }
      });
    }

    const inv = memState.inventory;
    const totalCans =
      inv.fullCansReady +
      inv.emptyCansRefill +
      inv.withDeliveryStaff +
      inv.damagedUnavailable;

    res.status(200).json({
      success: true,
      data: {
        ...inv,
        totalCans,
        isLowStock: inv.fullCansReady < inv.lowStockThreshold
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Adjust or add stock
// @route   POST /api/inventory/adjust
// @access  Private (Owner only)
exports.adjustStock = async (req, res, next) => {
  try {
    const { category, action, quantity, notes } = req.body;

    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a positive quantity'
      });
    }

    if (!['full', 'empty', 'staff', 'damaged'].includes(category)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid category. Choose full, empty, staff, or damaged.'
      });
    }

    const fieldMap = {
      full: 'fullCansReady',
      empty: 'emptyCansRefill',
      staff: 'withDeliveryStaff',
      damaged: 'damagedUnavailable'
    };
    const dbFieldMap = {
      full: 'full_cans_ready',
      empty: 'empty_cans_refill',
      staff: 'with_delivery_staff',
      damaged: 'damaged_unavailable'
    };

    const targetField = fieldMap[category];

    if (isDbReady()) {
      const inv = await getInventoryRow();
      const prevCount = inv[dbFieldMap[category]];
      let newCount = prevCount;

      if (action === 'add' || action === 'refilled' || action === 'received') {
        newCount = prevCount + qty;
      } else if (action === 'remove' || action === 'damaged' || action === 'dispatched') {
        if (prevCount - qty < 0) {
          return res.status(400).json({
            success: false,
            message: `Cannot reduce ${category} stock below zero. Current stock is ${prevCount}.`
          });
        }
        newCount = prevCount - qty;
      } else {
        newCount = qty; // Direct set
      }

      const patch = {
        [dbFieldMap[category]]: newCount,
        total_cans:
          (category === 'full' ? newCount : inv.full_cans_ready) +
          (category === 'empty' ? newCount : inv.empty_cans_refill) +
          (category === 'staff' ? newCount : inv.with_delivery_staff) +
          (category === 'damaged' ? newCount : inv.damaged_unavailable)
      };

      const { data, error } = await supabase
        .from('inventory')
        .update(patch)
        .eq('id', 1)
        .select()
        .single();
      throwIfError(error);

      // Keep the audit trail inside the allowed movement enum; arbitrary
      // actions fall back to "adjustment" so the movement insert cannot fail
      // after the stock row was already updated.
      const allowedMovements = [
        'received',
        'refilled',
        'dispatched',
        'returned',
        'damaged',
        'adjustment',
        'add',
        'remove'
      ];
      const movementAction = allowedMovements.includes(action) ? action : 'adjustment';

      const { error: movementError } = await supabase.from('stock_movements').insert({
        movement_id: `MOV-${Date.now()}`,
        category,
        action: movementAction,
        quantity: qty,
        previous_count: prevCount,
        new_count: newCount,
        notes: notes || '',
        performed_by: req.user ? req.user.name : 'Admin Owner'
      });
      throwIfError(movementError);

      return res.status(200).json({
        success: true,
        message: 'Inventory updated successfully',
        data: mapRow(data)
      });
    }

    // Memory fallback
    const prevCount = memState.inventory[targetField];
    let newCount = prevCount;

    if (action === 'add' || action === 'refilled' || action === 'received') {
      newCount = prevCount + qty;
    } else if (action === 'remove' || action === 'damaged' || action === 'dispatched') {
      if (prevCount - qty < 0) {
        return res.status(400).json({
          success: false,
          message: `Cannot reduce ${category} stock below zero. Current stock is ${prevCount}.`
        });
      }
      newCount = prevCount - qty;
    } else {
      newCount = qty;
    }

    memState.inventory[targetField] = newCount;
    memState.inventory.totalCans =
      memState.inventory.fullCansReady +
      memState.inventory.emptyCansRefill +
      memState.inventory.withDeliveryStaff +
      memState.inventory.damagedUnavailable;

    memState.movements.unshift({
      movementId: `MOV-${Date.now()}`,
      category,
      action: action || 'adjustment',
      quantity: qty,
      previousCount: prevCount,
      newCount,
      notes: notes || '',
      performedBy: req.user ? req.user.name : 'Admin Owner',
      createdAt: new Date().toISOString()
    });

    res.status(200).json({
      success: true,
      message: 'Inventory updated successfully',
      data: memState.inventory
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get stock movement logs
// @route   GET /api/inventory/movements
// @access  Private
exports.getStockMovements = async (req, res, next) => {
  try {
    if (isDbReady()) {
      const { data, error } = await supabase
        .from('stock_movements')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      throwIfError(error);

      return res.status(200).json({ success: true, data: mapRows(data) });
    }

    res.status(200).json({ success: true, data: memState.movements });
  } catch (error) {
    next(error);
  }
};
