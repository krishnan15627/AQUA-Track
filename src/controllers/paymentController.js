const { supabase, isDbReady } = require('../config/supabase');
const { memState } = require('../utils/dataStore');
const {
  isUuid,
  mapRow,
  mapRows,
  sanitizeSearch,
  throwIfError
} = require('../utils/supabaseHelpers');
const {
  findLinkedCustomer,
  getCustomerPk,
  getCustomerCode
} = require('../utils/customerLink');

const todayLabel = () =>
  new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });

const nextPaymentCode = async () => {
  const { data, error } = await supabase.from('payments').select('payment_id');
  throwIfError(error);
  const max = (data || []).reduce((acc, row) => {
    const n = parseInt(String(row.payment_id).replace(/\D/g, ''), 10);
    return Number.isNaN(n) ? acc : Math.max(acc, n);
  }, 0);
  return `PAY-${String(max + 1).padStart(3, '0')}`;
};

// @desc    Get payments ledger with filtering & summary totals
// @route   GET /api/payments
// @access  Private
exports.getPayments = async (req, res, next) => {
  try {
    const { status, search } = req.query;

    const isCustomer = req.user.role === 'customer';
    let linked = null;
    if (isCustomer) {
      linked = await findLinkedCustomer(req.user);
      if (!linked) {
        return res.status(403).json({
          success: false,
          message: 'No customer profile is linked to this account.'
        });
      }
    }

    if (isDbReady()) {
      let query = supabase.from('payments').select('*');

      if (isCustomer) {
        query = query.eq('customer_ref', getCustomerPk(linked));
      }

      if (status && status !== 'All') {
        query = query.eq('status', status);
      }
      if (search) {
        const q = sanitizeSearch(search);
        if (q) {
          query = query.or(
            `payment_id.ilike.%${q}%,customer_name.ilike.%${q}%,customer_id.ilike.%${q}%`
          );
        }
      }

      let summaryQuery = supabase.from('payments').select('amount_paid, remaining_balance');
      if (isCustomer) {
        summaryQuery = summaryQuery.eq('customer_ref', getCustomerPk(linked));
      }

      const [{ data, error }, { data: allPayments, error: summaryError }, customerCountResult] =
        await Promise.all([
          query.order('created_at', { ascending: false }),
          summaryQuery,
          isCustomer
            ? Promise.resolve({ count: 1, error: null })
            : supabase.from('customers').select('*', { count: 'exact', head: true })
        ]);
      throwIfError(error);
      throwIfError(summaryError);
      throwIfError(customerCountResult.error);

      const totalCustomers = customerCountResult.count || 0;

      const totalCollected = (allPayments || []).reduce(
        (acc, p) => acc + Number(p.amount_paid || 0),
        0
      );
      const totalPending = (allPayments || []).reduce(
        (acc, p) => acc + Number(p.remaining_balance || 0),
        0
      );

      const payments = mapRows(data);
      return res.status(200).json({
        success: true,
        count: payments.length,
        summary: {
          totalCollected,
          totalPending,
          totalCustomers
        },
        data: payments
      });
    }

    // Memory fallback
    let ownPayments = memState.payments;
    if (isCustomer) {
      ownPayments = ownPayments.filter(
        (p) =>
          p.customerId === getCustomerCode(linked) ||
          p.customerName === linked.name
      );
    }

    let results = [...ownPayments];
    if (status && status !== 'All') {
      results = results.filter((p) => p.status.toLowerCase() === status.toLowerCase());
    }
    if (search) {
      const q = search.toLowerCase();
      results = results.filter(
        (p) =>
          p.paymentId.toLowerCase().includes(q) ||
          p.customerName.toLowerCase().includes(q) ||
          p.customerId.toLowerCase().includes(q)
      );
    }

    const totalCollected = ownPayments.reduce((acc, p) => acc + (p.amountPaid || 0), 0);
    const totalPending = ownPayments.reduce((acc, p) => acc + (p.remainingBalance || 0), 0);
    const totalCustomers = isCustomer ? 1 : memState.customers.length;

    res.status(200).json({
      success: true,
      count: results.length,
      summary: {
        totalCollected,
        totalPending,
        totalCustomers
      },
      data: results
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Record a new payment or settlement
// @route   POST /api/payments
// @access  Private
exports.recordPayment = async (req, res, next) => {
  try {
    const { customerId, amount, paymentMethod, notes } = req.body;

    const paid = parseFloat(amount);
    if (isNaN(paid) || paid <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid payment amount'
      });
    }

    if (isDbReady()) {
      let query = supabase.from('customers').select('*');
      query = isUuid(customerId)
        ? query.or(`id.eq.${customerId},customer_id.eq.${customerId}`)
        : query.eq('customer_id', customerId);

      const { data: customer, error: customerError } = await query.maybeSingle();
      throwIfError(customerError);

      if (!customer) {
        return res.status(404).json({ success: false, message: 'Customer not found' });
      }

      const prevBalance = Number(customer.outstanding_balance || 0);
      const newBalance = Math.max(0, prevBalance - paid);

      const { error: customerUpdateError } = await supabase
        .from('customers')
        .update({
          total_paid: Number(customer.total_paid || 0) + paid,
          outstanding_balance: newBalance
        })
        .eq('id', customer.id);
      throwIfError(customerUpdateError);

      const paymentId = await nextPaymentCode();

      const { data: payment, error: paymentError } = await supabase
        .from('payments')
        .insert({
          payment_id: paymentId,
          customer_ref: customer.id,
          customer_id: customer.customer_id,
          customer_name: customer.name,
          total_due: prevBalance,
          amount_paid: paid,
          remaining_balance: newBalance,
          payment_method: paymentMethod || 'Cash',
          status: newBalance === 0 ? 'Paid' : 'Pending',
          payment_date: todayLabel(),
          notes: notes || ''
        })
        .select()
        .single();
      throwIfError(paymentError);

      return res.status(201).json({
        success: true,
        message: 'Payment recorded successfully',
        data: mapRow(payment)
      });
    }

    // Memory fallback
    const customer = memState.customers.find(
      (c) => c.customerId === customerId || c._id === customerId
    );

    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const prevBalance = customer.outstandingBalance || 0;
    const newBalance = Math.max(0, prevBalance - paid);

    customer.totalPaid = (customer.totalPaid || 0) + paid;
    customer.outstandingBalance = newBalance;

    const nextPayNum = memState.payments.length + 1;
    const paymentId = `PAY-${String(nextPayNum).padStart(3, '0')}`;

    const newPayment = {
      _id: `mem_pay_${Date.now()}`,
      paymentId,
      customerId: customer.customerId,
      customerName: customer.name,
      totalDue: prevBalance,
      amountPaid: paid,
      remainingBalance: newBalance,
      paymentMethod: paymentMethod || 'Cash',
      status: newBalance === 0 ? 'Paid' : 'Pending',
      paymentDate: todayLabel(),
      notes: notes || '',
      createdAt: new Date().toISOString()
    };

    memState.payments.unshift(newPayment);

    res.status(201).json({
      success: true,
      message: 'Payment recorded successfully',
      data: newPayment
    });
  } catch (error) {
    next(error);
  }
};
