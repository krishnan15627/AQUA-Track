const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { supabase, isDbReady } = require('../config/supabase');
const { mapRow, throwIfError } = require('../utils/supabaseHelpers');
const { memState } = require('../utils/dataStore');
const { nextCustomerCode } = require('../utils/customerCodes');
const {
  findLinkedCustomer,
  normalizeEmail,
  normalizePhone
} = require('../utils/customerLink');

// Bootstrap account used only when Supabase is not configured. The seeded
// owner in Supabase is the only persistent account created by `npm run seed`.
let memoryUsers = null;

const initMemoryUsers = async () => {
  if (memoryUsers) return;
  const hash = await bcrypt.hash('Password@123', 10);
  memoryUsers = [
    {
      _id: '6720f1a23b4c8d0012345671',
      name: 'Admin Owner',
      email: 'admin@aquatrack.com',
      phone: '9876543210',
      password: hash,
      role: 'owner',
      isActive: true,
      lastLogin: new Date()
    }
  ];
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\d{10}$/;

const validateCustomerSignup = ({ name, email, phone, password }) => {
  if (!name || !email || !phone || !password) {
    return 'Please provide your name, email, phone number, and password';
  }
  if (!EMAIL_RE.test(normalizeEmail(email))) return 'Please enter a valid email address';
  if (!PHONE_RE.test(normalizePhone(phone))) return 'Please enter a valid 10-digit phone number';
  if (String(password).length < 8) return 'Password must be at least 8 characters long';
  return null;
};

// Self sign-up is for customers only. Owner and delivery partner accounts are
// created by the business owner from the dashboard, never self-registered.
const resolveSignupRole = (role) => {
  if (!role || role === 'customer') return { role: 'customer', error: null };
  return {
    role: null,
    error: 'Self sign-up is for customers only. Delivery partner and owner accounts are created by the business owner.'
  };
};

const sendTokenResponse = (user, statusCode, res, customer) => {
  const userId = user.id || user._id;
  const customerRef = customer
    ? customer.id || customer._id
    : user.customerRef || null;

  const token = jwt.sign(
    {
      id: userId,
      role: user.role,
      name: user.name,
      email: user.email,
      customerRef
    },
    process.env.JWT_SECRET || 'aquatrack_default_secret_key',
    { expiresIn: '7d' }
  );

  const cookieOptions = {
    expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  };

  res
    .status(statusCode)
    .cookie('token', token, cookieOptions)
    .json({
      success: true,
      token,
      user: {
        id: userId,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        customerRef,
        isActive: user.isActive,
        lastLogin: user.lastLogin
      }
    });
};

// @desc    Create a customer account (self signup)
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res, next) => {
  try {
    const {
      name,
      email,
      phone,
      password,
      address,
      area,
      deliveryInstructions,
      regularQuantity,
      role: requestedRole
    } = req.body;

    const validationError = validateCustomerSignup({ name, email, phone, password });
    if (validationError) {
      return res.status(400).json({ success: false, message: validationError });
    }

    const { role, error: roleError } = resolveSignupRole(requestedRole);
    if (roleError) {
      return res.status(403).json({ success: false, message: roleError });
    }

    const cleanName = String(name).trim();
    const cleanEmail = normalizeEmail(email);
    const cleanPhone = normalizePhone(phone);
    const cleanAddress = address ? String(address).trim() : '';
    const cleanArea = area ? String(area).trim() : '';
    const quantity = Math.max(1, parseInt(regularQuantity, 10) || 1);

    if (!cleanAddress || !cleanArea) {
      return res.status(400).json({
        success: false,
        message: 'Please provide your delivery address and delivery area'
      });
    }

    if (isDbReady()) {
      const { data: existingUser, error: findError } = await supabase
        .from('users')
        .select('id')
        .or(`email.eq.${cleanEmail},phone.eq.${cleanPhone}`)
        .limit(1);
      throwIfError(findError);

      if (existingUser && existingUser.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'An account with that email or phone number already exists'
        });
      }

      if (role === 'customer') {
        const { data: byEmail, error: emailError } = await supabase
          .from('customers')
          .select('id')
          .eq('email', cleanEmail)
          .limit(1)
          .maybeSingle();
        throwIfError(emailError);

        const { data: byPhone, error: phoneError } = await supabase
          .from('customers')
          .select('id')
          .eq('phone', cleanPhone)
          .limit(1)
          .maybeSingle();
        throwIfError(phoneError);

        if (byEmail || byPhone) {
          return res.status(400).json({
            success: false,
            message:
              'A customer record already uses that email or phone number. Please contact the business owner.'
          });
        }
      }

      const passwordHash = await bcrypt.hash(String(password), 10);

      const customerId = await nextCustomerCode();
      const { data: customerRow, error: customerError } = await supabase
        .from('customers')
        .insert({
          customer_id: customerId,
          name: cleanName,
          phone: cleanPhone,
          email: cleanEmail,
          address: cleanAddress,
          area: cleanArea,
          delivery_instructions: deliveryInstructions
            ? String(deliveryInstructions).trim()
            : '',
          regular_quantity: quantity,
          frequency: 'on_demand',
          status: 'Active'
        })
        .select()
        .single();
      throwIfError(customerError);

      const { data: userRow, error: userError } = await supabase
        .from('users')
        .insert({
          name: cleanName,
          email: cleanEmail,
          phone: cleanPhone,
          password_hash: passwordHash,
          role: 'customer',
          is_active: true
        })
        .select()
        .single();

      if (userError) {
        await supabase.from('customers').delete().eq('id', customerRow.id);
        throwIfError(userError);
      }

      return sendTokenResponse(mapRow(userRow), 201, res, customerRow);
    }

    // Memory fallback mode
    await initMemoryUsers();
    const existing = memoryUsers.find(
      (u) => u.email === cleanEmail || u.phone === cleanPhone
    );
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'An account with that email or phone number already exists'
      });
    }

    const duplicateCustomer = memState.customers.find(
      (c) =>
        normalizeEmail(c.email) === cleanEmail ||
        normalizePhone(c.phone) === cleanPhone
    );
    if (duplicateCustomer) {
      return res.status(400).json({
        success: false,
        message:
          'A customer record already uses that email or phone number. Please contact the business owner.'
      });
    }

    const hash = await bcrypt.hash(String(password), 10);

    const customerId = await nextCustomerCode();
    const newCustomer = {
      _id: `mem_c_${Date.now()}`,
      customerId,
      name: cleanName,
      phone: cleanPhone,
      email: cleanEmail,
      address: cleanAddress,
      area: cleanArea,
      deliveryInstructions: deliveryInstructions
        ? String(deliveryInstructions).trim()
        : '',
      regularQuantity: quantity,
      frequency: 'on_demand',
      status: 'Active',
      fullCansDelivered: 0,
      emptyCansReturned: 0,
      unreturnedCans: 0,
      totalCharges: 0,
      totalPaid: 0,
      outstandingBalance: 0,
      pricePerCan: 30,
      createdAt: new Date().toISOString()
    };
    memState.customers.unshift(newCustomer);

    const newUser = {
      _id: crypto.randomUUID(),
      name: cleanName,
      email: cleanEmail,
      phone: cleanPhone,
      password: hash,
      role: 'customer',
      customerRef: newCustomer._id,
      isActive: true,
      lastLogin: new Date()
    };
    memoryUsers.push(newUser);

    return sendTokenResponse(newUser, 201, res, newCustomer);
  } catch (error) {
    next(error);
  }
};

// @desc    Login user with email/phone & password
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res, next) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please enter your email address or phone number, and password'
      });
    }

    const cleanIdentifier = identifier.trim().toLowerCase();

    if (isDbReady()) {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .or(`email.eq.${cleanIdentifier},phone.eq.${cleanIdentifier}`)
        .maybeSingle();
      throwIfError(error);

      if (!data) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials. User not found.'
        });
      }

      if (!data.is_active) {
        return res.status(403).json({
          success: false,
          message: 'Your account has been deactivated. Please contact the administrator.'
        });
      }

      const isMatch = await bcrypt.compare(password, data.password_hash);
      if (!isMatch) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials. Password is incorrect.'
        });
      }

      const { data: updated, error: updateError } = await supabase
        .from('users')
        .update({ last_login: new Date().toISOString() })
        .eq('id', data.id)
        .select()
        .single();
      throwIfError(updateError);

      const customer =
        data.role === 'customer'
          ? await findLinkedCustomer({
              email: data.email,
              phone: data.phone,
              role: data.role
            })
          : null;

      return sendTokenResponse(mapRow(updated), 200, res, customer);
    }

    // Memory fallback mode
    await initMemoryUsers();
    const user = memoryUsers.find(
      (u) => u.email.toLowerCase() === cleanIdentifier || u.phone === cleanIdentifier
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials. User not found.'
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact the administrator.'
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials. Password is incorrect.'
      });
    }

    user.lastLogin = new Date();
    const customer =
      user.role === 'customer'
        ? await findLinkedCustomer({
            email: user.email,
            phone: user.phone,
            role: user.role,
            customerRef: user.customerRef
          })
        : null;

    return sendTokenResponse(user, 200, res, customer);
  } catch (error) {
    next(error);
  }
};

// @desc    Get currently logged in user profile
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res, next) => {
  try {
    res.status(200).json({
      success: true,
      user: req.user
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Log out user & clear cookie
// @route   POST /api/auth/logout
// @access  Public
exports.logout = async (req, res) => {
  res.cookie('token', 'none', {
    expires: new Date(Date.now() + 5 * 1000),
    httpOnly: true
  });

  res.status(200).json({
    success: true,
    message: 'User logged out successfully'
  });
};

// Helpers for authMiddleware / userController when running without Supabase
exports.getMemoryUserById = (id) => {
  if (!memoryUsers) return null;
  return memoryUsers.find((u) => u._id === id || u._id.toString() === id.toString());
};

exports.getMemoryUsers = () => memoryUsers || [];

exports.addMemoryUser = (user) => {
  if (!memoryUsers) memoryUsers = [];
  memoryUsers.push(user);
};

exports.initMemoryUsers = initMemoryUsers;
