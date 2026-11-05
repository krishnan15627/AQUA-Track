const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { supabase, isDbReady } = require('../config/supabase');
const {
  getMemoryUsers,
  addMemoryUser,
  initMemoryUsers
} = require('./authController');
const { mapRows, throwIfError } = require('../utils/supabaseHelpers');
const {
  normalizeEmail,
  normalizePhone
} = require('../utils/customerLink');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\d{10}$/;

// @desc    List delivery staff accounts
// @route   GET /api/users/staff
// @access  Private (Owner only)
exports.getStaff = async (req, res, next) => {
  try {
    if (isDbReady()) {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, email, phone, is_active, last_login, created_at')
        .eq('role', 'staff')
        .order('name', { ascending: true });
      throwIfError(error);

      return res.status(200).json({ success: true, data: mapRows(data) });
    }

    await initMemoryUsers();
    const staff = getMemoryUsers()
      .filter((u) => u.role === 'staff')
      .map((u) => ({
        id: u._id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        isActive: u.isActive,
        lastLogin: u.lastLogin
      }));

    res.status(200).json({ success: true, data: staff });
  } catch (error) {
    next(error);
  }
};

// @desc    Create a delivery staff account
// @route   POST /api/users/staff
// @access  Private (Owner only)
exports.createStaff = async (req, res, next) => {
  try {
    const { name, email, phone, password } = req.body;

    if (!name || !email || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide name, email, phone number, and password'
      });
    }

    const cleanName = String(name).trim();
    const cleanEmail = normalizeEmail(email);
    const cleanPhone = normalizePhone(phone);

    if (!EMAIL_RE.test(cleanEmail)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid email address' });
    }
    if (!PHONE_RE.test(cleanPhone)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid 10-digit phone number'
      });
    }
    if (String(password).length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long'
      });
    }

    if (isDbReady()) {
      const { data: existing, error: findError } = await supabase
        .from('users')
        .select('id')
        .or(`email.eq.${cleanEmail},phone.eq.${cleanPhone}`)
        .limit(1);
      throwIfError(findError);

      if (existing && existing.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'An account with that email or phone number already exists'
        });
      }

      const passwordHash = await bcrypt.hash(String(password), 10);
      const { data, error } = await supabase
        .from('users')
        .insert({
          name: cleanName,
          email: cleanEmail,
          phone: cleanPhone,
          password_hash: passwordHash,
          role: 'staff',
          is_active: true
        })
        .select('id, name, email, phone, is_active, created_at')
        .single();
      throwIfError(error);

      return res.status(201).json({
        success: true,
        message: 'Delivery staff account created',
        data: mapRows([data])[0]
      });
    }

    await initMemoryUsers();
    const existing = getMemoryUsers().find(
      (u) => u.email === cleanEmail || u.phone === cleanPhone
    );
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'An account with that email or phone number already exists'
      });
    }

    const hash = await bcrypt.hash(String(password), 10);
    const newUser = {
      _id: crypto.randomUUID(),
      name: cleanName,
      email: cleanEmail,
      phone: cleanPhone,
      password: hash,
      role: 'staff',
      isActive: true,
      lastLogin: null
    };
    addMemoryUser(newUser);

    res.status(201).json({
      success: true,
      message: 'Delivery staff account created',
      data: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        phone: newUser.phone,
        isActive: true
      }
    });
  } catch (error) {
    next(error);
  }
};
