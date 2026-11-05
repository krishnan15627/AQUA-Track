/**
 * AquaTrack Frontend API Client
 * Complete full-stack REST interface
 */
const API_BASE = '/api';

const api = {
  // Session storage
  setSession(token, user) {
    if (token) localStorage.setItem('aquatrack_token', token);
    if (user) localStorage.setItem('aquatrack_user', JSON.stringify(user));
  },

  getToken() {
    return localStorage.getItem('aquatrack_token');
  },

  getUser() {
    const str = localStorage.getItem('aquatrack_user');
    if (!str) return null;
    try {
      return JSON.parse(str);
    } catch (e) {
      return null;
    }
  },

  clearSession() {
    localStorage.removeItem('aquatrack_token');
    localStorage.removeItem('aquatrack_user');
  },

  isAuthenticated() {
    return !!this.getToken();
  },

  async request(endpoint, options = {}) {
    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
    const token = this.getToken();

    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'same-origin'
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (response.status === 401) {
        this.clearSession();
        if (!window.location.pathname.includes('/login')) {
          window.location.href = '/login?sessionExpired=true';
        }
      }
      throw new Error(data.message || `Request failed (${response.status})`);
    }

    return data;
  },

  // Auth API
  async login(identifier, password) {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password })
    });
    if (data.success && data.token) {
      this.setSession(data.token, data.user);
    }
    return data;
  },

  async register(customerData) {
    const data = await this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(customerData)
    });
    if (data.success && data.token) {
      this.setSession(data.token, data.user);
    }
    return data;
  },

  async logout() {
    try {
      await this.request('/auth/logout', { method: 'POST' });
    } catch (e) {
      console.warn('Logout notice:', e.message);
    } finally {
      this.clearSession();
      window.location.href = '/login';
    }
  },

  async fetchCurrentUser() {
    const data = await this.request('/auth/me');
    if (data.success && data.user) {
      this.setSession(null, data.user);
    }
    return data.user;
  },

  // Customer API
  async getCustomers(params = {}) {
    const q = new URLSearchParams(params).toString();
    return await this.request(`/customers${q ? `?${q}` : ''}`);
  },

  async getCustomer(id) {
    return await this.request(`/customers/${id}`);
  },

  async createCustomer(customerData) {
    return await this.request('/customers', {
      method: 'POST',
      body: JSON.stringify(customerData)
    });
  },

  async updateCustomer(id, updates) {
    return await this.request(`/customers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    });
  },

  async toggleCustomerStatus(id) {
    return await this.request(`/customers/${id}/toggle-status`, {
      method: 'PATCH'
    });
  },

  // Order API
  async getOrders(params = {}) {
    const q = new URLSearchParams(params).toString();
    return await this.request(`/orders${q ? `?${q}` : ''}`);
  },

  async createOrder(orderData) {
    return await this.request('/orders', {
      method: 'POST',
      body: JSON.stringify(orderData)
    });
  },

  async updateOrderStatus(id, status) {
    return await this.request(`/orders/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
  },

  // Delivery API
  async getDeliveries(params = {}) {
    const q = new URLSearchParams(params).toString();
    return await this.request(`/deliveries${q ? `?${q}` : ''}`);
  },

  async assignDelivery(id, staffId, deliveryPerson) {
    return await this.request(`/deliveries/${id}/assign`, {
      method: 'PATCH',
      body: JSON.stringify({ staffId, deliveryPerson })
    });
  },

  async completeDelivery(id, actualCansDelivered, emptyCansCollected) {
    return await this.request(`/deliveries/${id}/complete`, {
      method: 'POST',
      body: JSON.stringify({ actualCansDelivered, emptyCansCollected })
    });
  },

  async failDelivery(id, failureReason) {
    return await this.request(`/deliveries/${id}/fail`, {
      method: 'POST',
      body: JSON.stringify({ failureReason })
    });
  },

  // Inventory API
  async getInventory() {
    return await this.request('/inventory');
  },

  async adjustStock(category, action, quantity, notes) {
    return await this.request('/inventory/adjust', {
      method: 'POST',
      body: JSON.stringify({ category, action, quantity, notes })
    });
  },

  async getStockMovements() {
    return await this.request('/inventory/movements');
  },

  // Payments API
  async getPayments(params = {}) {
    const q = new URLSearchParams(params).toString();
    return await this.request(`/payments${q ? `?${q}` : ''}`);
  },

  async recordPayment(paymentData) {
    return await this.request('/payments', {
      method: 'POST',
      body: JSON.stringify(paymentData)
    });
  },

  // Reports API
  async getDashboardMetrics() {
    return await this.request('/reports/dashboard');
  },

  async getAnalytics() {
    return await this.request('/reports/analytics');
  },

  // Staff account API (owner only)
  async getStaff() {
    return await this.request('/users/staff');
  },

  async createStaff(staffData) {
    return await this.request('/users/staff', {
      method: 'POST',
      body: JSON.stringify(staffData)
    });
  }
};

window.api = api;
