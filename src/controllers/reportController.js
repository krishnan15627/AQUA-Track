const { supabase, isDbReady } = require('../config/supabase');
const { memState } = require('../utils/dataStore');
const { mapRows, throwIfError } = require('../utils/supabaseHelpers');

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const weekdayIndex = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return (d.getDay() + 6) % 7;
};

const buildWeeklyDeliveries = (deliveries) => {
  const buckets = new Array(7).fill(0);
  deliveries.forEach((d) => {
    const idx = weekdayIndex(d.deliveryDate || d.delivery_date);
    if (idx !== null) buckets[idx] += 1;
  });
  return { labels: WEEKDAYS, data: buckets };
};

const buildSalesTrend = (orders, days = 7) => {
  const buckets = new Map();
  const today = new Date();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    buckets.set(key, {
      date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      amount: 0
    });
  }

  orders.forEach((o) => {
    const createdAt = o.createdAt || o.created_at;
    if (!createdAt) return;
    const key = new Date(createdAt).toISOString().slice(0, 10);
    if (buckets.has(key)) {
      buckets.get(key).amount += Number(o.totalAmount ?? o.total_amount ?? 0);
    }
  });

  return [...buckets.values()];
};

const summarizePayments = (payments) => {
  const collected = payments.reduce(
    (sum, p) => sum + Number(p.amountPaid ?? p.amount_paid ?? 0),
    0
  );
  const pending = payments.reduce(
    (sum, p) => sum + Number(p.remainingBalance ?? p.remaining_balance ?? 0),
    0
  );
  const total = collected + pending;
  const paidPercentage = total > 0 ? Math.round((collected / total) * 100) : 0;
  return { collected, pending, paidPercentage, pendingPercentage: total > 0 ? 100 - paidPercentage : 0 };
};

// @desc    Get live metrics for Main Owner Dashboard (Card 2)
// @route   GET /api/reports/dashboard
// @access  Private
exports.getDashboardMetrics = async (req, res, next) => {
  try {
    if (isDbReady()) {
      const [
        { count: totalOrdersCount, error: ordersError },
        { data: deliveryRows, error: deliveriesError },
        { data: customers, error: customersError },
        { data: inv, error: inventoryError },
        { data: recentOrders, error: recentError }
      ] = await Promise.all([
        supabase.from('orders').select('*', { count: 'exact', head: true }),
        supabase.from('deliveries').select('status, delivery_date'),
        supabase.from('customers').select('unreturned_cans'),
        supabase.from('inventory').select('*').eq('id', 1).maybeSingle(),
        supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(5)
      ]);
      throwIfError(ordersError);
      throwIfError(deliveriesError);
      throwIfError(customersError);
      throwIfError(inventoryError);
      throwIfError(recentError);

      const deliveries = deliveryRows || [];
      const deliveredCount = deliveries.filter((d) => d.status === 'Delivered').length;
      const pendingCount = deliveries.filter(
        (d) => d.status === 'Pending' || d.status === 'Out for Delivery'
      ).length;

      const emptyCansPending = (customers || []).reduce(
        (sum, c) => sum + (c.unreturned_cans || 0),
        0
      );

      const weekly = buildWeeklyDeliveries(deliveries);

      return res.status(200).json({
        success: true,
        data: {
          totalOrders: totalOrdersCount || 0,
          delivered: deliveredCount,
          pendingDelivery: pendingCount,
          emptyCansPending,
          inventory: {
            fullCansReady: inv ? inv.full_cans_ready : 0,
            emptyCansRefill: inv ? inv.empty_cans_refill : 0,
            totalCans: inv ? inv.total_cans : 0
          },
          weeklyDeliveries: weekly.data,
          weeklyLabels: weekly.labels,
          recentOrders: mapRows(recentOrders)
        }
      });
    }

    // Memory calculation
    const totalOrdersCount = memState.orders.length;
    const deliveredCount = memState.deliveries.filter((d) => d.status === 'Delivered').length;
    const pendingCount = memState.deliveries.filter(
      (d) => d.status === 'Pending' || d.status === 'Out for Delivery'
    ).length;

    const emptyCansPending = memState.customers.reduce(
      (sum, c) => sum + (c.unreturnedCans || 0),
      0
    );

    const weekly = buildWeeklyDeliveries(memState.deliveries);

    res.status(200).json({
      success: true,
      data: {
        totalOrders: totalOrdersCount,
        delivered: deliveredCount,
        pendingDelivery: pendingCount,
        emptyCansPending,
        inventory: {
          fullCansReady: memState.inventory.fullCansReady,
          emptyCansRefill: memState.inventory.emptyCansRefill,
          totalCans: memState.inventory.totalCans
        },
        weeklyDeliveries: weekly.data,
        weeklyLabels: weekly.labels,
        recentOrders: memState.orders.slice(0, 5)
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get detailed Reports & Analytics (Card 8)
// @route   GET /api/reports/analytics
// @access  Private
exports.getAnalytics = async (req, res, next) => {
  try {
    if (isDbReady()) {
      const [
        { data: orderRows, error: ordersError },
        { data: paymentRows, error: paymentsError },
        { data: customerRows, error: customersError }
      ] = await Promise.all([
        supabase.from('orders').select('total_amount, status, created_at'),
        supabase.from('payments').select('amount_paid, remaining_balance'),
        supabase.from('customers').select('outstanding_balance')
      ]);
      throwIfError(ordersError);
      throwIfError(paymentsError);
      throwIfError(customersError);

      const orders = mapRows(orderRows) || [];
      const payments = mapRows(paymentRows) || [];

      const totalSales = orders
        .filter((o) => o.status !== 'Cancelled')
        .reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
      const summary = summarizePayments(payments);
      const outstanding = (customerRows || []).reduce(
        (sum, c) => sum + Number(c.outstanding_balance || 0),
        0
      );

      return res.status(200).json({
        success: true,
        data: {
          totalOrders: orders.length,
          totalSales,
          totalPayments: summary.collected,
          outstanding,
          salesTrend: buildSalesTrend(orders),
          paymentStatusBreakdown: {
            paidPercentage: summary.paidPercentage,
            pendingPercentage: summary.pendingPercentage
          }
        }
      });
    }

    // Memory calculation
    const orders = memState.orders;
    const totalSales = orders
      .filter((o) => o.status !== 'Cancelled')
      .reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
    const summary = summarizePayments(memState.payments);
    const outstanding = memState.customers.reduce(
      (sum, c) => sum + Number(c.outstandingBalance || 0),
      0
    );

    res.status(200).json({
      success: true,
      data: {
        totalOrders: orders.length,
        totalSales,
        totalPayments: summary.collected,
        outstanding,
        salesTrend: buildSalesTrend(orders),
        paymentStatusBreakdown: {
          paidPercentage: summary.paidPercentage,
          pendingPercentage: summary.pendingPercentage
        }
      }
    });
  } catch (error) {
    next(error);
  }
};
