const jwt = require('jsonwebtoken');
const { supabase, isDbReady } = require('../config/supabase');
const { mapRow } = require('../utils/supabaseHelpers');
const { getMemoryUserById } = require('../controllers/authController');
const { findLinkedCustomer } = require('../utils/customerLink');

// Protect routes: verify JWT token from Authorization header or cookie
exports.protect = async (req, res, next) => {
  let token;

  // Check Bearer token in headers
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer ')
  ) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies && req.cookies.token) {
    // Check httpOnly cookie
    token = req.cookies.token;
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized to access this resource. Please log in.'
    });
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'aquatrack_default_secret_key'
    );

    let user = null;

    if (isDbReady()) {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, email, phone, role, is_active, last_login, created_at')
        .eq('id', decoded.id)
        .maybeSingle();

      if (!error && data) {
        user = mapRow(data);
      }
    } else {
      user = getMemoryUserById(decoded.id);
      if (!user) {
        // Fallback user reconstruct from token payload
        user = {
          _id: decoded.id,
          name: decoded.name || 'Admin Owner',
          email: decoded.email || 'admin@aquatrack.com',
          phone: '9876543210',
          role: decoded.role || 'owner',
          isActive: true
        };
      }
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'The user belonging to this token no longer exists.'
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact the administrator.'
      });
    }

    if (user.role === 'customer') {
      user.customerRef = decoded.customerRef || null;
      if (!user.customerRef) {
        const linked = await findLinkedCustomer(user);
        user.customerRef = linked ? linked.id || linked._id : null;
      }
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired session. Please log in again.'
    });
  }
};

// Restrict access by roles
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: Role '${req.user ? req.user.role : 'guest'}' does not have permission to access this resource.`
      });
    }
    next();
  };
};
