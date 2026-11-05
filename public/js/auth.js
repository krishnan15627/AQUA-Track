/**
 * AquaTrack Login / Signup Form Controller
 */
document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const loginForm = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');
  const identifierInput = document.getElementById('identifier');
  const passwordInput = document.getElementById('password');
  const togglePasswordBtn = document.getElementById('togglePassword');
  const submitBtn = document.getElementById('submitBtn');
  const signupBtn = document.getElementById('signupBtn');
  const alertBox = document.getElementById('alertBox');
  const authHeading = document.getElementById('authHeading');
  const authSubheading = document.getElementById('authSubheading');
  const authFooter = document.getElementById('authFooter');

  // If already authenticated and token exists, check session and redirect
  const token = api.getToken();
  if (token) {
    api.fetchCurrentUser()
      .then(() => {
        window.location.href = '/dashboard';
      })
      .catch(() => {
        api.clearSession();
      });
  }

  // Check URL query parameters for session expired notice
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('sessionExpired')) {
    showAlert('Your session has expired. Please log in again.', 'danger');
  }

  // Toggle Password Visibility
  const EYE_ICON = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
      <circle cx="12" cy="12" r="3"></circle>
    </svg>
  `;
  const EYE_OFF_ICON = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
      <line x1="1" y1="1" x2="23" y2="23"></line>
    </svg>
  `;
  function bindPasswordToggle(button, input) {
    if (!button || !input) return;
    button.addEventListener('click', () => {
      const show = input.getAttribute('type') === 'password';
      input.setAttribute('type', show ? 'text' : 'password');
      button.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      button.innerHTML = show ? EYE_OFF_ICON : EYE_ICON;
    });
  }
  bindPasswordToggle(togglePasswordBtn, passwordInput);
  bindPasswordToggle(
    document.getElementById('toggleSignupPassword'),
    document.getElementById('signupPassword')
  );
  bindPasswordToggle(
    document.getElementById('toggleSignupConfirm'),
    document.getElementById('signupConfirm')
  );

  // Switch between Sign In / Create Account
  function setMode(mode) {
    const isSignup = mode === 'signup';
    document.querySelectorAll('.auth-tab').forEach((tab) => {
      const active = tab.getAttribute('data-form') === mode;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    if (loginForm) loginForm.style.display = isSignup ? 'none' : 'block';
    if (signupForm) signupForm.style.display = isSignup ? 'block' : 'none';
    if (authHeading) authHeading.textContent = isSignup ? 'Create Your Account' : 'Welcome Back!';
    if (authSubheading) {
      authSubheading.textContent = isSignup
        ? 'Sign up to order water and track your deliveries'
        : 'Login to your account to continue';
    }
    if (authFooter) {
      authFooter.innerHTML = isSignup
        ? 'Already have an account? <a href="#" id="showLoginLink">Sign In</a>'
        : 'Don\'t have an account? <a href="#" id="showSignupLink">Sign Up</a>';
      bindFooterLink();
    }
    document.querySelector('.auth-card')?.classList.toggle('signup-mode', isSignup);

    hideAlert();
    const focusTarget = isSignup
      ? document.getElementById('signupName')
      : identifierInput;
    if (focusTarget) focusTarget.focus();
  }

  function bindFooterLink() {
    const showSignup = document.getElementById('showSignupLink');
    const showLogin = document.getElementById('showLoginLink');
    if (showSignup) {
      showSignup.addEventListener('click', (e) => {
        e.preventDefault();
        setMode('signup');
      });
    }
    if (showLogin) {
      showLogin.addEventListener('click', (e) => {
        e.preventDefault();
        setMode('login');
      });
    }
  }

  document.querySelectorAll('.auth-tab').forEach((tab) => {
    tab.addEventListener('click', () => setMode(tab.getAttribute('data-form')));
  });
  bindFooterLink();

  // Signup supports customers and delivery partners; address fields apply to customers only
  const roleSelect = document.getElementById('signupRole');
  const customerOnlyFields = document.getElementById('customerOnlyFields');
  const addressInput = document.getElementById('signupAddress');
  const areaInput = document.getElementById('signupArea');

  function syncSignupRole() {
    const isStaff = roleSelect.value === 'staff';
    if (customerOnlyFields) customerOnlyFields.style.display = isStaff ? 'none' : '';
    if (addressInput) addressInput.required = !isStaff;
    if (areaInput) areaInput.required = !isStaff;
  }
  if (roleSelect) roleSelect.addEventListener('change', syncSignupRole);

  // Handle Login Submission
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideAlert();

      const identifier = identifierInput.value.trim();
      const password = passwordInput.value;

      if (!identifier) {
        showAlert('Please enter your email address or phone number', 'danger');
        identifierInput.focus();
        return;
      }

      if (!password) {
        showAlert('Please enter your password', 'danger');
        passwordInput.focus();
        return;
      }

      submitBtn.disabled = true;
      const originalText = submitBtn.innerHTML;
      submitBtn.innerHTML = loadingMarkup('Logging in...');

      try {
        const response = await api.login(identifier, password);
        if (response.success) {
          showAlert('Login successful! Redirecting...', 'success');
          setTimeout(() => {
            window.location.href = '/dashboard';
          }, 600);
        } else {
          showAlert(response.message || 'Login failed', 'danger');
          submitBtn.disabled = false;
          submitBtn.innerHTML = originalText;
        }
      } catch (err) {
        showAlert(err.message || 'Invalid credentials or server unavailable', 'danger');
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
      }
    });
  }

  // Handle Signup Submission (customer or delivery partner)
  if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideAlert();

      const name = document.getElementById('signupName').value.trim();
      const email = document.getElementById('signupEmail').value.trim();
      const phone = document.getElementById('signupPhone').value.trim();
      const address = addressInput.value.trim();
      const area = areaInput.value.trim();
      const password = document.getElementById('signupPassword').value;
      const confirm = document.getElementById('signupConfirm').value;
      const role = roleSelect ? roleSelect.value : 'customer';
      const isCustomer = role === 'customer';

      if (!name || !email || !phone || !password || (isCustomer && (!address || !area))) {
        showAlert('Please fill in every field to create your account', 'danger');
        return;
      }
      if (!/^\d{10}$/.test(phone)) {
        showAlert('Please enter a valid 10-digit phone number', 'danger');
        document.getElementById('signupPhone').focus();
        return;
      }
      if (password.length < 8) {
        showAlert('Password must be at least 8 characters long', 'danger');
        document.getElementById('signupPassword').focus();
        return;
      }
      if (password !== confirm) {
        showAlert('Passwords do not match', 'danger');
        document.getElementById('signupConfirm').focus();
        return;
      }

      signupBtn.disabled = true;
      const originalText = signupBtn.innerHTML;
      signupBtn.innerHTML = loadingMarkup('Creating account...');

      try {
        const response = await api.register(
          isCustomer
            ? { name, email, phone, address, area, password, role }
            : { name, email, phone, password, role }
        );
        if (response.success) {
          showAlert('Account created! Redirecting to your portal...', 'success');
          setTimeout(() => {
            window.location.href = '/dashboard';
          }, 700);
        } else {
          showAlert(response.message || 'Signup failed', 'danger');
          signupBtn.disabled = false;
          signupBtn.innerHTML = originalText;
        }
      } catch (err) {
        showAlert(err.message || 'Could not create your account', 'danger');
        signupBtn.disabled = false;
        signupBtn.innerHTML = originalText;
      }
    });
  }

  function loadingMarkup(label) {
    return `
      <svg class="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
        <path d="M12 2a10 10 0 0 1 10 10"></path>
      </svg>
      ${label}
    `;
  }

  // Helper alert functions
  function showAlert(msg, type = 'danger') {
    if (!alertBox) return;
    alertBox.textContent = msg;
    alertBox.className = `alert-box alert-${type}`;
    alertBox.style.display = 'flex';
  }

  function hideAlert() {
    if (!alertBox) return;
    alertBox.style.display = 'none';
  }
});
