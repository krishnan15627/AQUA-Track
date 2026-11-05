/**
 * AquaTrack Main Application Controller
 * Handles SPA navigation, real-time rendering, forms, modals, Chart.js, and portals
 */

// State variables
let currentView = 'dashboard';
let currentUser = null;
let dashboardChart = null;
let salesTrendChart = null;
let paymentDonutChart = null;
let userLocation = null;

// Replace these with your real depot / refill locations. Distances are
// calculated in the browser; coordinates are never sent to the server.
const WATER_CAN_CENTERS = [
  {
    name: 'AquaTrack Anna Nagar Hub',
    area: 'Anna Nagar',
    address: '2nd Avenue, Anna Nagar West, Chennai',
    phone: '9000000001',
    hours: '7:00 AM – 9:00 PM',
    lat: 13.0878,
    lng: 80.2085
  },
  {
    name: 'AquaTrack Adyar Refill Point',
    area: 'Adyar',
    address: 'Lattice Bridge Road, Adyar, Chennai',
    phone: '9000000002',
    hours: '7:00 AM – 8:30 PM',
    lat: 13.0055,
    lng: 80.2570
  },
  {
    name: 'AquaTrack T. Nagar Center',
    area: 'T. Nagar',
    address: 'Usman Road, T. Nagar, Chennai',
    phone: '9000000003',
    hours: '8:00 AM – 9:00 PM',
    lat: 13.0418,
    lng: 80.2341
  },
  {
    name: 'AquaTrack Velachery Depot',
    area: 'Velachery',
    address: '100 Feet Road, Velachery, Chennai',
    phone: '9000000004',
    hours: '7:00 AM – 9:00 PM',
    lat: 12.9791,
    lng: 80.2210
  },
  {
    name: 'AquaTrack Pallavaram Point',
    area: 'Pallavaram',
    address: 'GST Road, Pallavaram, Chennai',
    phone: '9000000005',
    hours: '7:30 AM – 8:30 PM',
    lat: 12.9675,
    lng: 80.1502
  }
];

// Views each role is allowed to open. The API enforces the same rules; this
// map only controls what the UI exposes.
const NAV_VIEWS = {
  owner: [
    'dashboard',
    'customers',
    'orders',
    'delivery',
    'inventory',
    'payments',
    'reports',
    'staff-portal'
  ],
  staff: ['staff-portal'],
  customer: ['customer-portal', 'orders', 'payments']
};

function defaultViewForRole(role) {
  if (role === 'staff') return 'staff-portal';
  if (role === 'customer') return 'customer-portal';
  return 'dashboard';
}

document.addEventListener('DOMContentLoaded', async () => {
  // Check user session
  let initialView = 'dashboard';
  try {
    const user = await api.fetchCurrentUser();
    if (!user) {
      window.location.href = '/login';
      return;
    }
    currentUser = user;
    setupUserInfo(user);
    applyRoleUI(user);
    initialView = defaultViewForRole(user.role);
  } catch (err) {
    window.location.href = '/login?sessionExpired=true';
    return;
  }

  // Setup Date Badge
  const today = new Date();
  const dateOptions = { day: 'numeric', month: 'short', year: 'numeric' };
  const dateStr = `Today, ${today.toLocaleDateString('en-GB', dateOptions)}`;
  document.querySelectorAll('.current-date-text').forEach(el => el.textContent = dateStr);

  // Initialize Navigation
  setupNavigation();

  // Load the role-appropriate landing view
  switchView(initialView);

  // Bind Modals & Actions
  setupModalHandlers();
});

// Setup current user profile in sidebar
function setupUserInfo(user) {
  const avatar = document.getElementById('userAvatar');
  const name = document.getElementById('userName');
  const role = document.getElementById('userRole');

  if (avatar) avatar.textContent = (user.name || 'A').charAt(0).toUpperCase();
  if (name) name.textContent = user.name || 'Account';
  if (role) {
    role.textContent = user.role
      ? user.role.charAt(0).toUpperCase() + user.role.slice(1)
      : 'Owner';
  }
}

// Hide navigation and controls a role must not use
function applyRoleUI(user) {
  const allowed = NAV_VIEWS[user.role] || [];

  document.querySelectorAll('.sidebar-nav li').forEach((li) => {
    const btn = li.querySelector('button[data-view]');
    if (!btn) return;
    const view = btn.getAttribute('data-view');
    li.style.display = allowed.includes(view) ? '' : 'none';
  });

  document.body.classList.add(`role-${user.role}`);

  const addDriverBtn = document.getElementById('addDriverBtn');
  if (addDriverBtn) {
    addDriverBtn.style.display = user.role === 'owner' ? '' : 'none';
  }

  if (user.role === 'customer') {
    const customersCard = document.getElementById('payTotalCustomersCard');
    if (customersCard) customersCard.style.display = 'none';
  }
}

// SPA View Switcher
function setupNavigation() {
  const navBtns = document.querySelectorAll('.nav-btn');
  navBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const view = btn.getAttribute('data-view');
      if (view) {
        switchView(view);
      }
    });
  });

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => api.logout());
  }
}

function switchView(viewName) {
  if (currentUser) {
    const allowed = NAV_VIEWS[currentUser.role] || [];
    if (!allowed.includes(viewName)) {
      viewName = defaultViewForRole(currentUser.role);
    }
  }

  currentView = viewName;

  // Update navigation active state
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    if (btn.getAttribute('data-view') === viewName) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Toggle View Containers
  document.querySelectorAll('.page-view').forEach((view) => {
    view.classList.remove('active');
  });

  const activeContainer = document.getElementById(`view-${viewName}`);
  if (activeContainer) {
    activeContainer.classList.add('active');
  }

  // Set Topbar Title
  const titleEl = document.getElementById('pageTitle');
  const titleMap = {
    'dashboard': 'Dashboard',
    'customers': 'Customer Management',
    'orders': 'Orders',
    'delivery': 'Delivery Management',
    'inventory': 'Stock Overview',
    'payments': 'Payments',
    'reports': 'Reports & Analytics',
    'staff-portal': 'Delivery Staff Portal',
    'customer-portal': 'Customer Portal'
  };
  if (titleEl) {
    titleEl.textContent = titleMap[viewName] || 'Dashboard';
  }

  // Load Data for specific view
  if (viewName === 'dashboard') loadDashboardData();
  else if (viewName === 'customers') loadCustomersData();
  else if (viewName === 'orders') loadOrdersData();
  else if (viewName === 'delivery') loadDeliveryData();
  else if (viewName === 'inventory') loadInventoryData();
  else if (viewName === 'payments') loadPaymentsData();
  else if (viewName === 'reports') loadReportsData();
  else if (viewName === 'staff-portal') loadStaffPortalData();
  else if (viewName === 'customer-portal') loadCustomerPortalData();
}

// -------------------------------------------------------------
// 1. DASHBOARD VIEW (Card 2)
// -------------------------------------------------------------
async function loadDashboardData() {
  try {
    const res = await api.getDashboardMetrics();
    if (!res.success) return;

    const { totalOrders, delivered, pendingDelivery, emptyCansPending, weeklyDeliveries, recentOrders } = res.data;

    // Stat cards
    document.getElementById('dashTotalOrders').textContent = totalOrders;
    document.getElementById('dashDelivered').textContent = delivered;
    document.getElementById('dashPending').textContent = pendingDelivery;
    document.getElementById('dashEmptyPending').textContent = emptyCansPending;

    // Chart.js Deliveries Bar Chart
    renderDashboardChart(weeklyDeliveries || []);

    // Recent Orders Table
    renderRecentOrders(recentOrders || []);
  } catch (err) {
    console.error('Error loading dashboard:', err);
  }
}

function renderDashboardChart(dataPoints) {
  const ctx = document.getElementById('deliveryChart');
  if (!ctx) return;

  if (dashboardChart) {
    dashboardChart.destroy();
  }

  dashboardChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      datasets: [
        {
          label: 'Deliveries',
          data: dataPoints,
          backgroundColor: '#3b82f6',
          borderRadius: 6,
          barThickness: 28
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: '#f1f5f9' },
          ticks: { color: '#64748b' }
        },
        x: {
          grid: { display: false },
          ticks: { color: '#64748b' }
        }
      }
    }
  });
}

function renderRecentOrders(orders) {
  const tbody = document.getElementById('recentOrdersBody');
  if (!tbody) return;

  if (orders.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#94a3b8; padding:20px;">No orders found</td></tr>';
    return;
  }

  tbody.innerHTML = orders.map(o => `
    <tr>
      <td><strong>${esc(o.orderId)}</strong></td>
      <td>${esc(o.customerName)}</td>
      <td>${esc(o.deliveryDate)}, ${esc(o.deliveryTimeSlot)}</td>
      <td>${esc(o.cansOrdered)}</td>
      <td><span class="badge ${getStatusBadgeClass(o.status)}">${esc(o.status)}</span></td>
    </tr>
  `).join('');
}

// -------------------------------------------------------------
// 2. CUSTOMERS VIEW (Card 3)
// -------------------------------------------------------------
async function loadCustomersData() {
  const search = document.getElementById('customerSearchInput')?.value || '';
  const status = document.querySelector('.customer-tab.active')?.getAttribute('data-status') || 'All';

  try {
    const res = await api.getCustomers({ search, status });
    const tbody = document.getElementById('customersTableBody');
    if (!tbody) return;

    if (!res.data || res.data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:30px; color:#94a3b8;">No customers matching filter</td></tr>';
      return;
    }

    tbody.innerHTML = res.data.map(c => `
      <tr>
        <td><strong>${esc(c.customerId)}</strong></td>
        <td>
          <div style="font-weight:600; color:#0f172a;">${esc(c.name)}</div>
          <div style="font-size:0.8rem; color:#64748b;">${esc(c.deliveryInstructions || 'Standard')}</div>
        </td>
        <td>${esc(c.phone)}</td>
        <td>${esc(c.area)}</td>
        <td>
          <span style="font-weight:700; color:${c.unreturnedCans > 0 ? '#ea580c' : '#16a34a'}">
            ${esc(c.unreturnedCans || 0)} Cans
          </span>
        </td>
        <td>
          <span class="badge ${c.status === 'Active' ? 'badge-active' : 'badge-inactive'}">
            ${esc(c.status)}
          </span>
        </td>
        <td>
          <div class="row-actions">
            <button class="action-icon-btn" title="Edit Customer" onclick="openEditCustomerModal('${esc(c.customerId)}')">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
            <button class="action-icon-btn" title="Toggle Status" onclick="toggleCustomer('${esc(c.customerId)}')">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error fetching customers:', err);
  }
}

// -------------------------------------------------------------
// 3. ORDERS VIEW (Card 4)
// -------------------------------------------------------------
async function loadOrdersData() {
  const search = document.getElementById('orderSearchInput')?.value || '';
  const status = document.querySelector('.order-tab.active')?.getAttribute('data-status') || 'All';

  try {
    const res = await api.getOrders({ search, status });
    const tbody = document.getElementById('ordersTableBody');
    if (!tbody) return;

    if (!res.data || res.data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:30px; color:#94a3b8;">No orders found</td></tr>';
      return;
    }

    tbody.innerHTML = res.data.map(o => `
      <tr>
        <td><strong>${esc(o.orderId)}</strong></td>
        <td>
          <div style="font-weight:600;">${esc(o.customerName)}</div>
          <div style="font-size:0.8rem; color:#64748b;">${esc(o.area)}</div>
        </td>
        <td>${esc(o.deliveryDate)}, ${esc(o.deliveryTimeSlot)}</td>
        <td><strong>${esc(o.cansOrdered)}</strong></td>
        <td>
          <span class="badge ${getStatusBadgeClass(o.status)}">${esc(o.status)}</span>
        </td>
        <td>${esc(o.staffName || '-')}</td>
        <td>
          <div class="row-actions">
            ${currentUser?.role === 'customer'
              ? (o.status === 'Scheduled'
                  ? `<button class="action-icon-btn" title="Cancel Order" onclick="cancelOrder('${esc(o.orderId)}')">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2.5">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    </button>`
                  : `<span style="color:#94a3b8; font-size:0.8rem;">—</span>`)
              : `<button class="action-icon-btn" title="Update Status" onclick="promptUpdateOrderStatus('${esc(o.orderId)}')">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 20h9"></path>
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                  </svg>
                </button>`}
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error fetching orders:', err);
  }
}

// -------------------------------------------------------------
// 4. DELIVERY VIEW (Card 5)
// -------------------------------------------------------------
async function loadDeliveryData() {
  const search = document.getElementById('deliverySearchInput')?.value || '';

  try {
    const res = await api.getDeliveries({ search });
    const tbody = document.getElementById('deliveryTableBody');
    if (!tbody) return;

    if (!res.data || res.data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:30px; color:#94a3b8;">No deliveries found</td></tr>';
      return;
    }

    tbody.innerHTML = res.data.map(d => `
      <tr>
        <td><strong>${esc(d.deliveryId)}</strong></td>
        <td>${esc(d.customerName)}</td>
        <td>${esc(d.area)}</td>
        <td><strong>${esc(d.cansToDeliver)}</strong></td>
        <td>
          <span class="badge ${getStatusBadgeClass(d.status)}">${esc(d.status)}</span>
        </td>
        <td>
          <span style="font-weight:600; color:#1e293b;">${esc(d.deliveryPerson || '-')}</span>
        </td>
        <td>
          <div class="row-actions">
            ${d.status !== 'Delivered' ? `
              <button class="action-icon-btn" title="Complete Delivery" onclick="openCompleteDeliveryModal('${esc(d.deliveryId)}', ${esc(d.cansToDeliver)})">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.5">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </button>
              <button class="action-icon-btn" title="Assign Staff" onclick="openAssignStaffModal('${esc(d.deliveryId)}')">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                  <circle cx="8.5" cy="7" r="4"></circle>
                  <polyline points="17 11 19 13 23 9"></polyline>
                </svg>
              </button>
            ` : `<span style="color:#16a34a; font-size:0.85rem; font-weight:600;">✓ Done</span>`}
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error fetching deliveries:', err);
  }
}

// -------------------------------------------------------------
// 5. INVENTORY VIEW (Card 6)
// -------------------------------------------------------------
async function loadInventoryData() {
  try {
    const res = await api.getInventory();
    if (!res.success) return;

    const inv = res.data;

    document.getElementById('invFullCans').textContent = inv.fullCansReady;
    document.getElementById('invEmptyCans').textContent = inv.emptyCansRefill;
    document.getElementById('invStaffCans').textContent = inv.withDeliveryStaff;
    document.getElementById('invDamagedCans').textContent = inv.damagedUnavailable;
    document.getElementById('invTotalCans').textContent = inv.totalCans;

    // Stock details table
    const tbody = document.getElementById('stockTableBody');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td><strong>Full Cans</strong> (Ready for delivery)</td>
          <td><strong>${inv.fullCansReady}</strong></td>
          <td><span class="badge badge-good">Good</span></td>
        </tr>
        <tr>
          <td><strong>Empty Cans</strong> (Waiting for refill)</td>
          <td><strong>${inv.emptyCansRefill}</strong></td>
          <td><span class="badge badge-refill-needed">Refill needed</span></td>
        </tr>
        <tr>
          <td><strong>With Delivery Staff</strong></td>
          <td><strong>${inv.withDeliveryStaff}</strong></td>
          <td><span class="badge badge-in-transit">In transit</span></td>
        </tr>
        <tr>
          <td><strong>Damaged / Unavailable</strong></td>
          <td><strong>${inv.damagedUnavailable}</strong></td>
          <td><span class="badge badge-check">Check</span></td>
        </tr>
      `;
    }
  } catch (err) {
    console.error('Error loading inventory:', err);
  }
}

// -------------------------------------------------------------
// 6. PAYMENTS VIEW (Card 7)
// -------------------------------------------------------------
async function loadPaymentsData() {
  const search = document.getElementById('paymentSearchInput')?.value || '';
  const status = document.querySelector('.payment-tab.active')?.getAttribute('data-status') || 'All';

  try {
    const res = await api.getPayments({ search, status });
    const tbody = document.getElementById('paymentsTableBody');
    if (!tbody) return;

    // Summary totals
    if (res.summary) {
      document.getElementById('payTotalCollected').textContent = `₹ ${res.summary.totalCollected.toLocaleString()}`;
      document.getElementById('payTotalPending').textContent = `₹ ${res.summary.totalPending.toLocaleString()}`;
      document.getElementById('payTotalCustomers').textContent = res.summary.totalCustomers;
    }

    if (!res.data || res.data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:30px; color:#94a3b8;">No payments found</td></tr>';
      return;
    }

    tbody.innerHTML = res.data.map(p => `
      <tr>
        <td><strong>${esc(p.customerId)}</strong></td>
        <td>${esc(p.customerName)}</td>
        <td>₹${esc(p.totalDue)}</td>
        <td>₹${esc(p.amountPaid)}</td>
        <td style="font-weight:700; color:${p.remainingBalance > 0 ? '#dc2626' : '#16a34a'}">
          ₹${esc(p.remainingBalance)}
        </td>
        <td>
          <span class="badge ${p.status === 'Paid' ? 'badge-paid' : 'badge-pending'}">${esc(p.status)}</span>
        </td>
        <td>
          ${currentUser?.role === 'owner'
            ? `<button class="action-icon-btn" title="Collect Payment" onclick="openPaymentModal('${esc(p.customerId)}', ${esc(p.remainingBalance)})">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect>
                  <line x1="1" y1="10" x2="23" y2="10"></line>
                </svg>
              </button>`
            : '<span style="color:#94a3b8; font-size:0.8rem;">—</span>'}
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error loading payments:', err);
  }
}

// -------------------------------------------------------------
// 7. REPORTS VIEW (Card 8)
// -------------------------------------------------------------
async function loadReportsData() {
  try {
    const res = await api.getAnalytics();
    if (!res.success) return;

    const { totalOrders, totalSales, totalPayments, outstanding, salesTrend, paymentStatusBreakdown } = res.data;

    document.getElementById('repTotalOrders').textContent = totalOrders;
    document.getElementById('repTotalSales').textContent = `₹ ${totalSales.toLocaleString()}`;
    document.getElementById('repTotalPayments').textContent = `₹ ${totalPayments.toLocaleString()}`;
    document.getElementById('repOutstanding').textContent = `₹ ${outstanding.toLocaleString()}`;

    // Render Sales Trend Chart
    renderSalesTrendChart(salesTrend);

    // Render Payment Doughnut Chart
    renderPaymentDonutChart(paymentStatusBreakdown);
  } catch (err) {
    console.error('Error loading reports:', err);
  }
}

function renderSalesTrendChart(trendData) {
  const ctx = document.getElementById('salesTrendChart');
  if (!ctx) return;

  if (salesTrendChart) salesTrendChart.destroy();

  salesTrendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: trendData.map(t => t.date),
      datasets: [
        {
          label: 'Sales (₹)',
          data: trendData.map(t => t.amount),
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.08)',
          fill: true,
          tension: 0.35,
          borderWidth: 2.5
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          grid: { color: '#f1f5f9' },
          ticks: {
            callback: value => (value >= 1000 ? `₹${value / 1000}k` : `₹${value}`),
            color: '#64748b'
          }
        },
        x: {
          grid: { display: false },
          ticks: { color: '#64748b' }
        }
      }
    }
  });
}

function renderPaymentDonutChart(breakdown) {
  const ctx = document.getElementById('paymentDonutChart');
  if (!ctx) return;

  if (paymentDonutChart) paymentDonutChart.destroy();

  paymentDonutChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Paid', 'Pending'],
      datasets: [
        {
          data: [breakdown.paidPercentage, breakdown.pendingPercentage],
          backgroundColor: ['#2563eb', '#f97316'],
          borderWidth: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '72%',
      plugins: {
        legend: {
          position: 'right',
          labels: { boxWidth: 12, color: '#475569' }
        }
      }
    }
  });
}

// -------------------------------------------------------------
// 8. DELIVERY STAFF PORTAL (Card 10 & 11)
// -------------------------------------------------------------
async function loadStaffPortalData() {
  try {
    const res = await api.getDeliveries();
    const container = document.getElementById('staffDeliveriesList');
    if (!container) return;

    const deliveries = res.data || [];

    const nameEl = document.getElementById('staffPortalName');
    if (nameEl) {
      nameEl.textContent =
        currentUser?.role === 'owner'
          ? 'All Delivery Routes'
          : currentUser?.name || 'Delivery Staff';
    }
    const countEl = document.getElementById('staffPortalCount');
    if (countEl) {
      const activeCount = deliveries.filter(d => d.status !== 'Delivered').length;
      countEl.textContent = `🚚 Active Deliveries: ${activeCount} Assigned`;
    }

    if (deliveries.length === 0) {
      container.innerHTML = '<div style="text-align:center; padding:20px; color:#94a3b8;">No assigned deliveries for today.</div>';
      return;
    }

    container.innerHTML = deliveries.map(d => `
      <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:18px; margin-bottom:12px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <strong style="font-size:1.05rem; color:#0f172a;">${esc(d.customerName)}</strong>
          <span class="badge ${getStatusBadgeClass(d.status)}">${esc(d.status)}</span>
        </div>
        <div style="font-size:0.9rem; color:#475569; margin-bottom:6px;">📍 ${esc(d.deliveryAddress || d.area)}</div>
        <div style="font-size:0.9rem; color:#1d4ed8; font-weight:600; margin-bottom:14px;">💧 ${esc(d.cansToDeliver)} Water Cans Ordered</div>
        ${d.status !== 'Delivered' ? `
          <div style="display:flex; gap:10px;">
            <button class="btn btn-primary" style="flex:1; padding:8px;" onclick="openCompleteDeliveryModal('${esc(d.deliveryId)}', ${esc(d.cansToDeliver)})">
              ✓ Mark Delivered
            </button>
            <button class="btn btn-secondary" style="padding:8px 14px; color:#dc2626;" onclick="promptFailDelivery('${esc(d.deliveryId)}')">
              ✕ Issue
            </button>
          </div>
        ` : `
          <div style="font-size:0.85rem; color:#16a34a; font-weight:600;">✓ Completed (Delivered: ${esc(d.actualCansDelivered)}, Empty: ${esc(d.emptyCansCollected)})</div>
        `}
      </div>
    `).join('');
  } catch (err) {
    console.error('Error loading staff portal:', err);
  }
}

// -------------------------------------------------------------
// 9. CUSTOMER PORTAL (Card 9)
// -------------------------------------------------------------
async function loadCustomerPortalData() {
  try {
    const custRes = await api.getCustomers();
    const customer = custRes.data && custRes.data[0] ? custRes.data[0] : null;

    if (customer) {
      document.getElementById('custPortalName').textContent = customer.name;
      document.getElementById('custPortalId').textContent = `Customer ID: ${customer.customerId}`;
      document.getElementById('custPortalUnreturned').textContent = `${customer.unreturnedCans || 0} Cans`;
      const due = Number(customer.outstandingBalance || 0);
      document.getElementById('custPortalDue').textContent = `₹ ${due}`;
      const banner = document.getElementById('customerPayBanner');
      const bannerDue = document.getElementById('custPayBannerDue');
      if (bannerDue) bannerDue.textContent = `₹ ${due}`;
      if (banner) banner.style.display = 'flex';

      const nextEl = document.getElementById('custPortalNext');
      if (nextEl) {
        const ordersRes = await api.getOrders();
        const upcoming = (ordersRes.data || []).find(
          (o) => !['Delivered', 'Cancelled', 'Missed'].includes(o.status)
        );
        nextEl.textContent = upcoming
          ? `${upcoming.deliveryDate}, ${upcoming.deliveryTimeSlot} • ${upcoming.cansOrdered} Cans`
          : 'No scheduled delivery';
      }
    } else {
      document.getElementById('custPortalName').textContent = currentUser?.name || 'Customer';
      document.getElementById('custPortalId').textContent = 'Customer ID: —';
      document.getElementById('custPortalUnreturned').textContent = '—';
      document.getElementById('custPortalDue').textContent = '—';
      document.getElementById('custPortalNext').textContent = 'No customer profile linked';
    }
    renderNearbyCenters();
    initAquaMap();
  } catch (err) {
    console.error('Error loading customer portal:', err);
  }
}

// -------------------------------------------------------------
// 9b. NEARBY WATER CAN CENTERS
// -------------------------------------------------------------
function distanceKm(from, to) {
  const R = 6371;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

window.renderNearbyCenters = function () {
  const list = document.getElementById('nearbyCentersList');
  if (!list) return;

  const q = (document.getElementById('nearbySearchInput')?.value || '').trim().toLowerCase();
  const centers = WATER_CAN_CENTERS
    .filter((c) => !q || `${c.name} ${c.area} ${c.address}`.toLowerCase().includes(q))
    .map((c) => ({ ...c, distance: userLocation ? distanceKm(userLocation, c) : null }))
    .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));

  if (centers.length === 0) {
    list.innerHTML = '<div class="nearby-empty">No centers match your search.</div>';
    return;
  }

  list.innerHTML = centers.map((c) => {
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      `${c.name}, ${c.address}`
    )}`;
    return `
      <div class="nearby-item">
        <div>
          <h4>${esc(c.name)}</h4>
          <div class="meta">${esc(c.address)}<br>${esc(c.hours)}</div>
          <div class="nearby-actions">
            <a class="nearby-link" href="${mapsUrl}" target="_blank" rel="noopener noreferrer">Get directions</a>
            <a class="nearby-link" href="tel:${esc(c.phone)}">Call ${esc(c.phone)}</a>
          </div>
        </div>
        <span class="nearby-distance">${c.distance === null ? esc(c.area) : `${c.distance.toFixed(1)} km`}</span>
      </div>
    `;
  }).join('');

  // Clicking a shop name flies the map to that marker (when the map is enabled)
  const items = list.querySelectorAll('.nearby-item');
  centers.forEach((c, i) => {
    const title = items[i] && items[i].querySelector('h4');
    if (title) {
      title.classList.add('nearby-item-title');
      title.title = 'Show on map';
      title.addEventListener('click', () => focusShopOnMap(c));
    }
  });
};

window.locateNearbyCenters = function (onLocated) {
  const notice = document.getElementById('nearbyLocationNotice');
  const btn = document.getElementById('nearbyLocateBtn');
  const label = btn ? btn.querySelector('span') : null;

  if (!navigator.geolocation) {
    if (notice) {
      notice.textContent = 'Location is not supported by this browser. Showing all centers.';
      notice.style.display = 'block';
    }
    return;
  }

  if (btn) btn.disabled = true;
  if (label) label.textContent = 'Locating...';

  navigator.geolocation.getCurrentPosition(
    (position) => {
      userLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };
      if (notice) {
        notice.textContent = 'Showing centers sorted by distance from your current location.';
        notice.style.display = 'block';
      }
      if (btn) btn.disabled = false;
      if (label) label.textContent = 'Update location';
      renderNearbyCenters();
      if (typeof onLocated === 'function') onLocated(userLocation);
    },
    () => {
      if (notice) {
        notice.textContent =
          'Location permission was denied. Showing all centers — allow location access to see distances.';
        notice.style.display = 'block';
      }
      if (btn) btn.disabled = false;
      if (label) label.textContent = 'Use my location';
      if (typeof onLocated === 'function') onLocated(null);
    },
    { timeout: 8000, maximumAge: 300000 }
  );
};

// -------------------------------------------------------------
// 9d. GOOGLE MAPS — NEARBY AQUA SHOPS
// -------------------------------------------------------------
let aquaMap = null;
let aquaMapMarkers = [];
let mapsLoaderPromise = null;

function loadGoogleMapsApi() {
  if (mapsLoaderPromise) return mapsLoaderPromise;
  mapsLoaderPromise = fetch('/api/config')
    .then((r) => r.json())
    .then((cfg) => {
      if (!cfg.mapsBrowserKey) throw new Error('maps-key-missing');
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(cfg.mapsBrowserKey)}&loading=async`;
        script.async = true;
        script.onload = resolve;
        script.onerror = () => reject(new Error('maps-script-failed'));
        document.head.appendChild(script);
      });
    })
    .catch((err) => {
      mapsLoaderPromise = null; // allow a retry on the next open
      throw err;
    });
  return mapsLoaderPromise;
}

function setAquaMapNotice(message, isError) {
  const notice = document.getElementById('aquaMapNotice');
  if (!notice) return;
  notice.textContent = message || '';
  notice.style.display = message ? 'block' : 'none';
  notice.style.color = isError ? '#b91c1c' : '#64748b';
}

async function initAquaMap() {
  const mapEl = document.getElementById('aquaMap');
  const fallback = document.getElementById('aquaMapFallback');
  if (!mapEl) return;

  try {
    await loadGoogleMapsApi();
  } catch (err) {
    mapEl.style.display = 'none';
    if (fallback) fallback.style.display = 'flex';
    setAquaMapNotice(
      err.message === 'maps-script-failed'
        ? 'Google Maps could not be loaded. Check that MAPS_BROWSER_KEY is valid and the Maps JavaScript API is enabled for it.'
        : '',
      err.message === 'maps-script-failed'
    );
    return;
  }

  if (fallback) fallback.style.display = 'none';
  mapEl.style.display = '';
  renderAquaMap();
}

function renderAquaMap() {
  if (typeof google === 'undefined' || typeof google.maps === 'undefined') return;
  const mapEl = document.getElementById('aquaMap');
  if (!mapEl) return;

  const startCenter = userLocation || { lat: WATER_CAN_CENTERS[0].lat, lng: WATER_CAN_CENTERS[0].lng };
  if (!aquaMap) {
    aquaMap = new google.maps.Map(mapEl, {
      center: startCenter,
      zoom: 11,
      mapTypeControl: false,
      streetViewControl: false
    });
  }

  aquaMapMarkers.forEach((m) => m.setMap(null));
  aquaMapMarkers = [];
  const bounds = new google.maps.LatLngBounds();

  WATER_CAN_CENTERS.forEach((shop) => {
    const distance = userLocation ? distanceKm(userLocation, shop) : null;
    const marker = new google.maps.Marker({
      position: { lat: shop.lat, lng: shop.lng },
      map: aquaMap,
      title: shop.name
    });
    const info = new google.maps.InfoWindow({
      content: `
        <div class="aqua-shop-info">
          <h4>${esc(shop.name)}</h4>
          ${distance !== null ? `<span class="aqua-shop-distance">${distance.toFixed(1)} km away</span>` : ''}
          <div class="meta">${esc(shop.address)}<br>${esc(shop.hours)}</div>
          <div class="nearby-actions">
            <a class="nearby-link" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${shop.name}, ${shop.address}`)}" target="_blank" rel="noopener noreferrer">Directions</a>
            <a class="nearby-link" href="tel:${esc(shop.phone)}">Call ${esc(shop.phone)}</a>
          </div>
        </div>
      `
    });
    marker.addListener('click', () => info.open(aquaMap, marker));
    aquaMapMarkers.push(marker);
    bounds.extend(marker.getPosition());
  });

  if (userLocation) {
    const youMarker = new google.maps.Marker({
      position: userLocation,
      map: aquaMap,
      title: 'You are here',
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 9,
        fillColor: '#2563eb',
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 3
      }
    });
    aquaMapMarkers.push(youMarker);
    bounds.extend(youMarker.getPosition());
    aquaMap.fitBounds(bounds);
    setAquaMapNotice('Showing shops near your exact location.', false);
  } else {
    aquaMap.setCenter(startCenter);
    aquaMap.setZoom(11);
    setAquaMapNotice('Showing all pickup points. Tap "Use my exact location" to find the closest shops.', false);
  }
}

window.focusShopOnMap = function (shop) {
  if (!aquaMap || !shop) return;
  aquaMap.setCenter({ lat: shop.lat, lng: shop.lng });
  aquaMap.setZoom(14);
};

window.locateForMap = function () {
  locateNearbyCenters(() => {
    if (aquaMap) renderAquaMap();
  });
};

// -------------------------------------------------------------
// 9c. CUSTOMER PAY BILL (FRONTEND PREVIEW ONLY)
// -------------------------------------------------------------
function customerDueAmount() {
  const portalDue = document.getElementById('custPortalDue')?.textContent || '';
  const bannerDue = document.getElementById('custPayBannerDue')?.textContent || '';
  return Number((portalDue || bannerDue).replace(/[^0-9.]/g, '')) || 0;
}

window.openCustomerPaymentModal = function () {
  const due = customerDueAmount();
  if (due <= 0) {
    alert('You have no pending balance right now.');
    return;
  }

  document.getElementById('custPayDue').textContent = `₹ ${due.toLocaleString('en-IN')}`;
  const amountInput = document.getElementById('custPayAmount');
  amountInput.value = due;
  amountInput.max = due;

  const status = document.getElementById('custPayStatus');
  status.style.display = 'none';
  status.textContent = '';

  openModal('customerPayModal');
};
function setupModalHandlers() {
  // Add Customer Form Submit
  const addCustForm = document.getElementById('addCustomerForm');
  if (addCustForm) {
    addCustForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const editId = document.getElementById('custEditId').value;
      const payload = {
        name: document.getElementById('custName').value,
        phone: document.getElementById('custPhone').value,
        area: document.getElementById('custArea').value,
        address: document.getElementById('custAddress').value,
        deliveryInstructions: document.getElementById('custInstructions').value,
        regularQuantity: document.getElementById('custQty').value
      };
      try {
        if (editId) {
          await api.updateCustomer(editId, payload);
        } else {
          await api.createCustomer(payload);
        }
        closeModal('addCustomerModal');
        addCustForm.reset();
        setCustomerModalMode('add');
        loadCustomersData();
        loadOrdersData();
        loadDeliveryData();
        loadDashboardData();
        alert(editId ? 'Customer updated successfully!' : 'Customer added successfully!');
      } catch (err) {
        alert(err.message);
      }
    });
  }

  // Create Order Form Submit
  const newOrderForm = document.getElementById('newOrderForm');
  if (newOrderForm) {
    newOrderForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const staffSelect = document.getElementById('orderStaff');
      const staffValue = staffSelect ? staffSelect.value : 'Unassigned';
      const staffName =
        staffValue && staffValue !== 'Unassigned'
          ? staffSelect.options[staffSelect.selectedIndex].textContent
          : 'Unassigned';

      const payload = {
        customerId: document.getElementById('orderCustomerId').value || undefined,
        cansOrdered: document.getElementById('orderCans').value,
        expectedEmptyReturns: document.getElementById('orderExpectedEmpty').value,
        deliveryDate: document.getElementById('orderDate').value || todayLabel(),
        deliveryTimeSlot: document.getElementById('orderTime').value || '9:00 AM',
        staffId: staffValue && staffValue !== 'Unassigned' ? staffValue : null,
        staffName,
        notes: document.getElementById('orderNotes').value
      };
      try {
        await api.createOrder(payload);
        closeModal('newOrderModal');
        newOrderForm.reset();
        loadOrdersData();
        if (currentUser && currentUser.role === 'owner') {
          loadDeliveryData();
          loadDashboardData();
        }
        if (currentView === 'customer-portal') loadCustomerPortalData();
        alert('Order created successfully!');
      } catch (err) {
        alert(err.message);
      }
    });
  }

  // Complete Delivery Form Submit
  const completeDelForm = document.getElementById('completeDeliveryForm');
  if (completeDelForm) {
    completeDelForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const delId = document.getElementById('completeDelId').value;
      const delivered = document.getElementById('actualDeliveredCans').value;
      const returned = document.getElementById('collectedEmptyCans').value;

      try {
        await api.completeDelivery(delId, delivered, returned);
        closeModal('completeDeliveryModal');
        loadDeliveryData();
        loadInventoryData();
        loadDashboardData();
        if (currentView === 'staff-portal') loadStaffPortalData();
        alert('Delivery completed! Empty can balances and inventory updated.');
      } catch (err) {
        alert(err.message);
      }
    });
  }

  // Adjust Stock Form Submit
  const adjustStockForm = document.getElementById('adjustStockForm');
  if (adjustStockForm) {
    adjustStockForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const category = document.getElementById('stockCategory').value;
      const action = document.getElementById('stockAction').value;
      const qty = document.getElementById('stockQty').value;
      const notes = document.getElementById('stockNotes').value;

      try {
        await api.adjustStock(category, action, qty, notes);
        closeModal('adjustStockModal');
        loadInventoryData();
        loadDashboardData();
        alert('Stock updated successfully!');
      } catch (err) {
        alert(err.message);
      }
    });
  }

  // Record Payment Form Submit
  const paymentForm = document.getElementById('recordPaymentForm');
  if (paymentForm) {
    paymentForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const customerId = document.getElementById('payCustomerId').value;
      const amount = document.getElementById('payAmount').value;
      const paymentMethod = document.getElementById('payMethod').value;

      try {
        await api.recordPayment({ customerId, amount, paymentMethod });
        closeModal('recordPaymentModal');
        paymentForm.reset();
        loadPaymentsData();
        loadDashboardData();
        alert('Payment recorded successfully!');
      } catch (err) {
        alert(err.message);
      }
    });
  }

  // Customer Pay Bill Preview Submit
  const customerPayForm = document.getElementById('customerPayForm');
  if (customerPayForm) {
    customerPayForm.addEventListener('submit', (e) => {
      e.preventDefault();

      const status = document.getElementById('custPayStatus');
      const amount = Number(document.getElementById('custPayAmount').value);
      const method =
        document.querySelector('input[name="custPayMethod"]:checked')?.value || 'UPI';
      const due = customerDueAmount();

      const showStatus = (message, type) => {
        status.className = `alert-box alert-${type}`;
        status.textContent = message;
        status.style.display = 'flex';
      };

      if (!amount || amount <= 0) {
        showStatus('Enter a valid amount to continue.', 'danger');
        return;
      }
      if (amount > due) {
        showStatus(`Amount cannot be more than your due balance of ₹${due.toLocaleString('en-IN')}.`, 'danger');
        return;
      }

      showStatus(
        `Preview complete: a ${method} payment of ₹${amount.toLocaleString('en-IN')} would open the secure gateway here. No money was charged and your balance is unchanged.`,
        'success'
      );
    });
  }

  // Assign Delivery Staff Form Submit
  const assignStaffForm = document.getElementById('assignStaffForm');
  if (assignStaffForm) {
    assignStaffForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const deliveryId = document.getElementById('assignDeliveryId').value;
      const select = document.getElementById('assignStaffSelect');
      const staffId = select.value;
      const staffName = select.options[select.selectedIndex]
        ? select.options[select.selectedIndex].textContent
        : '';

      if (!staffId) {
        alert('Please select a delivery person.');
        return;
      }

      try {
        await api.assignDelivery(deliveryId, staffId, staffName);
        closeModal('assignStaffModal');
        loadDeliveryData();
        loadStaffPortalData();
        alert('Delivery assigned successfully!');
      } catch (err) {
        alert(err.message);
      }
    });
  }

  // Add Driver Form Submit
  const addDriverForm = document.getElementById('addDriverForm');
  if (addDriverForm) {
    addDriverForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        name: document.getElementById('driverName').value.trim(),
        email: document.getElementById('driverEmail').value.trim(),
        phone: document.getElementById('driverPhone').value.trim(),
        password: document.getElementById('driverPassword').value
      };

      try {
        await api.createStaff(payload);
        closeModal('addDriverModal');
        addDriverForm.reset();
        loadStaffPortalData();
        alert('Driver account created. They can sign in with their email and password.');
      } catch (err) {
        alert(err.message);
      }
    });
  }

  // Customer Filter Tabs
  document.querySelectorAll('.customer-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.customer-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      loadCustomersData();
    });
  });

  // Order Filter Tabs
  document.querySelectorAll('.order-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.order-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      loadOrdersData();
    });
  });

  // Payment Filter Tabs
  document.querySelectorAll('.payment-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.payment-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      loadPaymentsData();
    });
  });
}

// Modal helper functions
window.openModal = function (id) {
  const m = document.getElementById(id);
  if (m) m.style.display = 'flex';
};

window.closeModal = function (id) {
  const m = document.getElementById(id);
  if (m) m.style.display = 'none';
};

function setCustomerModalMode(mode, customer) {
  document.getElementById('customerModalTitle').textContent =
    mode === 'edit' ? 'Edit Customer' : 'Add New Customer';
  document.getElementById('customerModalSubmit').textContent =
    mode === 'edit' ? 'Save Changes' : 'Save Customer';
  document.getElementById('custEditId').value = mode === 'edit' ? customer.customerId : '';

  const fill = (id, value) => { document.getElementById(id).value = value ?? ''; };
  if (mode === 'edit') {
    fill('custName', customer.name);
    fill('custPhone', customer.phone);
    fill('custArea', customer.area);
    fill('custAddress', customer.address);
    fill('custInstructions', customer.deliveryInstructions);
    fill('custQty', customer.regularQuantity || 2);
  }
}

// Quick action callers
window.openAddCustomerModal = function () {
  const form = document.getElementById('addCustomerForm');
  if (form) form.reset();
  setCustomerModalMode('add');
  openModal('addCustomerModal');
};

window.openEditCustomerModal = async function (customerId) {
  try {
    const res = await api.getCustomer(customerId);
    if (!res.data) {
      alert('Customer not found');
      return;
    }
    setCustomerModalMode('edit', res.data);
    openModal('addCustomerModal');
  } catch (err) {
    alert(err.message);
  }
};

window.openNewOrderModal = async function () {
  const dateInput = document.getElementById('orderDate');
  if (dateInput) dateInput.value = todayLabel();

  const customerGroup = document.getElementById('orderCustomerGroup');
  const staffGroup = document.getElementById('orderStaffGroup');
  const customerSelect = document.getElementById('orderCustomerId');
  const staffSelect = document.getElementById('orderStaff');
  const isCustomer = currentUser?.role === 'customer';

  try {
    if (isCustomer) {
      if (customerGroup) customerGroup.style.display = 'none';
      if (staffGroup) staffGroup.style.display = 'none';
      if (staffSelect) staffSelect.innerHTML = '<option value="Unassigned">Unassigned</option>';

      const res = await api.getCustomers();
      const me = res.data && res.data[0];
      if (!me) {
        alert('Your customer profile could not be loaded.');
        return;
      }
      if (customerSelect) {
        customerSelect.innerHTML = `<option value="${esc(me.customerId)}">${esc(me.name)} (${esc(me.customerId)})</option>`;
      }
    } else {
      if (customerGroup) customerGroup.style.display = '';
      if (staffGroup) staffGroup.style.display = '';

      const res = await api.getCustomers();
      if (!res.data || res.data.length === 0) {
        alert('Add a customer first, then create an order.');
        return;
      }
      if (customerSelect) {
        customerSelect.innerHTML = res.data.map(c => `
          <option value="${esc(c.customerId)}">${esc(c.name)} (${esc(c.customerId)}) — ${esc(c.area)}</option>
        `).join('');
      }

      const staffRes = await api.getStaff();
      if (staffSelect) {
        const options = ['<option value="Unassigned">Unassigned</option>'];
        (staffRes.data || []).forEach(s => {
          options.push(`<option value="${esc(s.id)}">${esc(s.name)}</option>`);
        });
        staffSelect.innerHTML = options.join('');
      }
    }

    openModal('newOrderModal');
  } catch (err) {
    alert(err.message);
  }
};

window.openCompleteDeliveryModal = function (deliveryId, defaultCans) {
  document.getElementById('completeDelId').value = deliveryId;
  document.getElementById('actualDeliveredCans').value = defaultCans || 2;
  document.getElementById('collectedEmptyCans').value = defaultCans || 2;
  openModal('completeDeliveryModal');
};

window.openAssignStaffModal = async function (deliveryId) {
  const select = document.getElementById('assignStaffSelect');
  const hint = document.getElementById('assignStaffHint');
  const submitBtn = document.querySelector('#assignStaffForm button[type="submit"]');
  document.getElementById('assignDeliveryId').value = deliveryId;

  try {
    const res = await api.getStaff();
    const staff = res.data || [];

    if (staff.length === 0) {
      if (select) {
        select.innerHTML = '';
        const group = select.closest('.form-group');
        if (group) group.style.display = 'none';
      }
      if (hint) {
        hint.style.display = 'flex';
        hint.innerHTML = `
          <span>No drivers yet — add one first, then come back to assign this delivery.</span>
          <button type="button" class="btn btn-primary" style="white-space: nowrap; padding: 6px 12px; font-size: 0.8rem;"
            onclick="closeModal('assignStaffModal'); openAddDriverModal();">+ Add Driver</button>
        `;
      }
      if (submitBtn) submitBtn.disabled = true;
    } else {
      if (select) {
        const group = select.closest('.form-group');
        if (group) group.style.display = '';
        select.innerHTML = staff.map(s => `
          <option value="${esc(s.id)}">${esc(s.name)}</option>
        `).join('');
      }
      if (hint) hint.style.display = 'none';
      if (submitBtn) submitBtn.disabled = false;
    }

    openModal('assignStaffModal');
  } catch (err) {
    alert(err.message);
  }
};

window.openAddDriverModal = function () {
  const form = document.getElementById('addDriverForm');
  if (form) form.reset();
  openModal('addDriverModal');
};

window.cancelOrder = async function (orderId) {
  if (!window.confirm(`Cancel order ${orderId}?`)) return;
  try {
    await api.updateOrderStatus(orderId, 'Cancelled');
    loadOrdersData();
    if (currentView === 'customer-portal') loadCustomerPortalData();
    alert('Order cancelled.');
  } catch (err) {
    alert(err.message);
  }
};

window.openPaymentModal = function (customerId, dueAmount) {
  document.getElementById('payCustomerId').value = customerId;
  document.getElementById('payAmount').value = dueAmount || 100;
  openModal('recordPaymentModal');
};

window.openAddStockModal = function () {
  openModal('adjustStockModal');
};

window.promptUpdateOrderStatus = function (orderId) {
  const newStatus = prompt('Enter new status (Scheduled, Out for Delivery, Delivered, Missed, Cancelled):', 'Delivered');
  if (newStatus) {
    api.updateOrderStatus(orderId, newStatus).then(() => {
      loadOrdersData();
      loadDashboardData();
    }).catch(err => alert(err.message));
  }
};

window.promptFailDelivery = function (deliveryId) {
  const reason = prompt('Reason for failure (e.g. Gate locked / Customer not home):', 'Customer unavailable');
  if (reason) {
    api.failDelivery(deliveryId, reason).then(() => {
      loadStaffPortalData();
      loadDeliveryData();
      alert('Delivery marked as failed.');
    }).catch(err => alert(err.message));
  }
};

window.toggleCustomer = async function (id) {
  try {
    await api.toggleCustomerStatus(id);
    loadCustomersData();
  } catch (err) {
    alert(err.message);
  }
};

// Export CSV
window.exportReportsCSV = async function () {
  try {
    const [analyticsRes, inventoryRes] = await Promise.all([
      api.getAnalytics(),
      api.getInventory()
    ]);
    const a = analyticsRes.data || {};
    const inv = inventoryRes.data || {};

    const rows = [
      ['Metric', 'Value'],
      ['Total Orders', a.totalOrders ?? 0],
      ['Total Sales', a.totalSales ?? 0],
      ['Total Payments', a.totalPayments ?? 0],
      ['Outstanding', a.outstanding ?? 0],
      ['Full Cans Ready', inv.fullCansReady ?? 0],
      ['Empty Cans Awaiting Refill', inv.emptyCansRefill ?? 0],
      ['With Delivery Staff', inv.withDeliveryStaff ?? 0],
      ['Damaged Cans', inv.damagedUnavailable ?? 0],
      ['Total Cans', inv.totalCans ?? 0]
    ];

    const csv = rows.map((r) => r.join(',')).join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv));
    link.setAttribute('download', 'aquatrack_report_summary.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (err) {
    alert(err.message);
  }
};

// Escape user-provided text before inserting it into HTML templates
function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function todayLabel() {
  return new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

// Badge helper
function getStatusBadgeClass(status) {
  if (!status) return 'badge-scheduled';
  const s = status.toLowerCase();
  if (s === 'delivered' || s === 'active' || s === 'paid' || s === 'good') return 'badge-delivered';
  if (s === 'out for delivery' || s === 'in transit' || s === 'pending') return 'badge-out-for-delivery';
  if (s === 'scheduled') return 'badge-scheduled';
  return 'badge-missed';
}
