/**
 * 宋染 · 非遗数字设计系统 — 身份认证模块
 * ============================================================
 * 纯前端认证方案：localStorage 存储用户、sessionStorage 管理会话，
 * SHA-256 密码哈希（同步实现，兼容所有浏览器）。
 *
 * 公共接口挂载于 window.AuthSystem
 */
;(function () {
  'use strict';

  /* ═══════════════════════════════════════════
     常量与配置
     ═══════════════════════════════════════════ */

  var STORAGE_KEY  = 'songdye_users';
  var SESSION_KEY  = 'songdye_session';
  var ATTEMPTS_KEY = 'songdye_login_attempts';
  var LOCKOUT_KEY  = 'songdye_lockout_until';
  var INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 分钟
  var MAX_FAILED_ATTEMPTS = 5;
  var LOCKOUT_DURATION    = 60 * 1000;      // 60 秒
  var MIN_PASSWORD_LENGTH = 6;

  // 默认管理员账户
  var DEFAULT_ADMIN = {
    username: 'admin',
    password: 'songdye2026',
    role: 'admin',
    realName: '系统管理员'
  };

  /* ═══════════════════════════════════════════
     SHA-256 同步哈希（纯 JS 实现）
     ═══════════════════════════════════════════ */

  var K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
    0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
    0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
    0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
    0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
    0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  function rightRotate(value, amount) {
    return (value >>> amount) | (value << (32 - amount));
  }

  /**
   * 纯 JS SHA-256 实现（同步，无任何外部依赖）
   * 与标准 crypto.subtle.digest('SHA-256') 输出一致
   */
  function sha256(message) {
    // UTF-8 编码
    var bytes = [];
    for (var i = 0; i < message.length; i++) {
      var code = message.charCodeAt(i);
      if (code < 0x80) {
        bytes.push(code);
      } else if (code < 0x800) {
        bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
      } else if (code < 0xd800 || code >= 0xe000) {
        bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
      } else {
        i++;
        code = ((code & 0x3ff) << 10) | (message.charCodeAt(i) & 0x3ff);
        bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
      }
    }

    var msgLen = bytes.length;
    bytes.push(0x80);
    while ((bytes.length % 64) !== 56) bytes.push(0);
    var bitLen = msgLen * 8;
    bytes.push(0, 0, 0, 0);
    bytes.push((bitLen >>> 24) & 0xff, (bitLen >>> 16) & 0xff, (bitLen >>> 8) & 0xff, bitLen & 0xff);

    var h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
    var h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

    for (var offset = 0; offset < bytes.length; offset += 64) {
      var w = new Array(64);
      for (var j = 0; j < 16; j++) {
        w[j] = (bytes[offset + j * 4] << 24) | (bytes[offset + j * 4 + 1] << 16) |
               (bytes[offset + j * 4 + 2] << 8) | bytes[offset + j * 4 + 3];
      }
      for (j = 16; j < 64; j++) {
        var s0 = rightRotate(w[j - 15], 7) ^ rightRotate(w[j - 15], 18) ^ (w[j - 15] >>> 3);
        var s1 = rightRotate(w[j - 2], 17) ^ rightRotate(w[j - 2], 19) ^ (w[j - 2] >>> 10);
        w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
      }

      var a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
      for (j = 0; j < 64; j++) {
        var S1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
        var ch = (e & f) ^ (~e & g);
        var temp1 = (h + S1 + ch + K[j] + w[j]) | 0;
        var S0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var temp2 = (S0 + maj) | 0;

        h = g; g = f; f = e; e = (d + temp1) | 0;
        d = c; c = b; b = a; a = (temp1 + temp2) | 0;
      }

      h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
      h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
    }

    var hex = '';
    [h0, h1, h2, h3, h4, h5, h6, h7].forEach(function(h) {
      hex += ('00000000' + (h >>> 0).toString(16)).slice(-8);
    });
    return hex;
  }

  /* ═══════════════════════════════════════════
     数据持久层（localStorage）
     ═══════════════════════════════════════════ */

  function getUsers() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveUsers(users) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
  }

  function findUser(username) {
    return getUsers().find(function (u) { return u.username === username; }) || null;
  }

  /** 首次运行时初始化默认管理员（同步） */
  function ensureDefaultAdmin() {
    if (getUsers().length === 0) {
      var hash = sha256(DEFAULT_ADMIN.password);
      saveUsers([{
        username: DEFAULT_ADMIN.username,
        passwordHash: hash,
        role: DEFAULT_ADMIN.role,
        realName: DEFAULT_ADMIN.realName,
        createdAt: new Date().toISOString(),
        lastLogin: null
      }]);
    }
  }

  /* ═══════════════════════════════════════════
     会话管理（sessionStorage）
     ═══════════════════════════════════════════ */

  function createSession(user) {
    var session = {
      username: user.username,
      role: user.role,
      realName: user.realName,
      loginAt: Date.now()
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }

  function getSession() {
    try {
      var raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      var session = JSON.parse(raw);
      if (Date.now() - session.loginAt > INACTIVITY_TIMEOUT) {
        sessionStorage.removeItem(SESSION_KEY);
        return null;
      }
      return session;
    } catch (e) {
      return null;
    }
  }

  function destroySession() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  /* ═══════════════════════════════════════════
     登录频率限制
     ═══════════════════════════════════════════ */

  function getFailedAttempts() {
    return parseInt(sessionStorage.getItem(ATTEMPTS_KEY) || '0', 10);
  }

  function getLockoutRemaining() {
    var val = sessionStorage.getItem(LOCKOUT_KEY);
    if (!val) return 0;
    var remaining = Math.ceil((parseInt(val, 10) - Date.now()) / 1000);
    return remaining > 0 ? remaining : 0;
  }

  function resetRateLimit() {
    sessionStorage.setItem(ATTEMPTS_KEY, '0');
    sessionStorage.removeItem(LOCKOUT_KEY);
  }

  function recordFailedAttempt() {
    var attempts = getFailedAttempts() + 1;
    sessionStorage.setItem(ATTEMPTS_KEY, String(attempts));
    if (attempts >= MAX_FAILED_ATTEMPTS) {
      sessionStorage.setItem(LOCKOUT_KEY, String(Date.now() + LOCKOUT_DURATION));
    }
  }

  /* ═══════════════════════════════════════════
     无操作自动注销
     ═══════════════════════════════════════════ */

  var inactivityTimer = null;

  function resetInactivityTimer() {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(function () {
      doLogout('由于长时间未操作，会话已过期，请重新登录。');
    }, INACTIVITY_TIMEOUT);
  }

  function bindActivityListeners() {
    ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'].forEach(function (evt) {
      document.addEventListener(evt, resetInactivityTimer, { passive: true });
    });
  }

  /* ═══════════════════════════════════════════
     UI 辅助
     ═══════════════════════════════════════════ */

  function showLoginError(msg) {
    var el = document.getElementById('auth-login-error');
    if (el) {
      el.textContent = msg;
      el.style.display = msg ? 'block' : 'none';
    }
  }

  function showLoginOverlay() {
    var overlay = document.getElementById('auth-login-overlay');
    if (overlay) overlay.style.display = 'flex';
    var main = document.getElementById('app-main');
    if (main) main.style.display = 'none';
    var headerBar = document.getElementById('auth-user-bar');
    if (headerBar) headerBar.style.display = 'none';
  }

  function hideLoginOverlay() {
    var overlay = document.getElementById('auth-login-overlay');
    if (overlay) overlay.style.display = 'none';
    var main = document.getElementById('app-main');
    if (main) main.style.display = '';
    var headerBar = document.getElementById('auth-user-bar');
    if (headerBar) headerBar.style.display = '';
  }

  function updateHeaderUI(session) {
    var userInfo = document.getElementById('auth-user-info');
    if (userInfo) {
      userInfo.textContent = (session.realName || session.username) + '（' + (session.role === 'admin' ? '管理员' : '用户') + '）';
    }
    var adminBtn = document.getElementById('auth-admin-btn');
    if (adminBtn) adminBtn.style.display = session.role === 'admin' ? '' : 'none';
  }

  function showInlineMessage(text) {
    var msg = document.createElement('div');
    msg.textContent = text;
    msg.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:20000;background:#4a6741;color:#fff;padding:10px 24px;border-radius:6px;font-size:0.95rem;box-shadow:0 2px 12px rgba(0,0,0,0.15);transition:opacity 0.3s;';
    document.body.appendChild(msg);
    setTimeout(function () { msg.style.opacity = '0'; }, 1800);
    setTimeout(function () { msg.remove(); }, 2200);
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  /* ═══════════════════════════════════════════
     核心业务逻辑（全部同步）
     ═══════════════════════════════════════════ */

  /** 登录（同步） */
  function doLogin(username, password) {
    // 频率限制
    var lockRemaining = getLockoutRemaining();
    if (lockRemaining > 0) {
      return { success: false, message: '登录失败次数过多，请 ' + lockRemaining + ' 秒后重试' };
    }

    if (!username || !password) {
      return { success: false, message: '请输入用户名和密码' };
    }

    var user = findUser(username);
    if (!user) {
      recordFailedAttempt();
      return { success: false, message: '用户名或密码错误' };
    }

    var inputHash = sha256(password);
    if (inputHash !== user.passwordHash) {
      recordFailedAttempt();
      return { success: false, message: '用户名或密码错误' };
    }

    // 登录成功
    resetRateLimit();

    // 更新 lastLogin
    var users = getUsers();
    var idx = users.findIndex(function (u) { return u.username === username; });
    if (idx !== -1) {
      users[idx].lastLogin = new Date().toISOString();
      saveUsers(users);
    }

    var session = createSession(user);
    return { success: true, session: session };
  }

  function doLogout(reason) {
    destroySession();
    if (inactivityTimer) clearTimeout(inactivityTimer);
    showLoginOverlay();
    showLoginError(reason || '');
  }

  function doChangePassword(oldPwd, newPwd) {
    var session = getSession();
    if (!session) return false;
    if (newPwd.length < MIN_PASSWORD_LENGTH) return false;

    var user = findUser(session.username);
    if (!user) return false;

    if (sha256(oldPwd) !== user.passwordHash) return false;

    var users = getUsers();
    var idx = users.findIndex(function (u) { return u.username === session.username; });
    if (idx === -1) return false;

    users[idx].passwordHash = sha256(newPwd);
    saveUsers(users);
    return true;
  }

  function doAddUser(data) {
    var session = getSession();
    if (!session || session.role !== 'admin') return '权限不足';

    var username = (data.username || '').trim();
    var realName = (data.realName || '').trim();
    var password = (data.password || '').trim();
    var role = data.role === 'admin' ? 'admin' : 'user';

    if (!username || !realName || !password) return '请填写所有字段';
    if (password.length < MIN_PASSWORD_LENGTH) return '密码长度不能少于 ' + MIN_PASSWORD_LENGTH + ' 位';
    if (findUser(username)) return '用户名 "' + username + '" 已存在';

    var users = getUsers();
    users.push({
      username: username,
      passwordHash: sha256(password),
      role: role,
      realName: realName,
      createdAt: new Date().toISOString(),
      lastLogin: null
    });
    saveUsers(users);
    return true;
  }

  function doDeleteUser(username) {
    var session = getSession();
    if (!session || session.role !== 'admin') return '权限不足';
    if (username === 'admin') return '不能删除管理员账户';
    if (username === session.username) return '不能删除当前登录的用户';

    var users = getUsers();
    var idx = users.findIndex(function (u) { return u.username === username; });
    if (idx === -1) return '用户不存在';

    users.splice(idx, 1);
    saveUsers(users);
    return true;
  }

  function doResetPassword(username, newPwd) {
    var session = getSession();
    if (!session || session.role !== 'admin') return '权限不足';
    if (newPwd.length < MIN_PASSWORD_LENGTH) return '密码长度不能少于 ' + MIN_PASSWORD_LENGTH + ' 位';

    var users = getUsers();
    var idx = users.findIndex(function (u) { return u.username === username; });
    if (idx === -1) return '用户不存在';

    users[idx].passwordHash = sha256(newPwd);
    saveUsers(users);
    return true;
  }

  function doGetAllUsers() {
    var session = getSession();
    if (!session || session.role !== 'admin') return null;
    return getUsers().map(function (u) {
      return { username: u.username, role: u.role, realName: u.realName, createdAt: u.createdAt, lastLogin: u.lastLogin };
    });
  }

  /* ═══════════════════════════════════════════
     登录按钮处理（同步，无 async 问题）
     ═══════════════════════════════════════════ */

  var isLoginSubmitting = false;

  function handleLogin() {
    if (isLoginSubmitting) return;
    isLoginSubmitting = true;

    var usernameEl = document.getElementById('auth-username');
    var passwordEl = document.getElementById('auth-password');
    if (!usernameEl || !passwordEl) { isLoginSubmitting = false; return; }

    var username = usernameEl.value.trim();
    var password = passwordEl.value;

    var result = doLogin(username, password);

    if (result.success) {
      showLoginError('');
      usernameEl.value = '';
      passwordEl.value = '';
      hideLoginOverlay();
      updateHeaderUI(result.session);
      resetInactivityTimer();
    } else {
      showLoginError(result.message);
    }

    isLoginSubmitting = false;
  }

  /* ═══════════════════════════════════════════
     修改密码弹窗
     ═══════════════════════════════════════════ */

  function showChangePasswordDialog() {
    if (document.getElementById('auth-change-pwd-dialog')) return;

    var dialog = document.createElement('div');
    dialog.id = 'auth-change-pwd-dialog';
    dialog.style.cssText = 'position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);';
    dialog.innerHTML =
      '<div style="background:#fff;padding:2rem;border-radius:8px;width:380px;max-width:90vw;">' +
        '<h3 style="margin:0 0 1rem;font-size:1.1rem;">修改密码</h3>' +
        '<div id="auth-change-pwd-error" style="color:#c0392b;font-size:0.85rem;margin-bottom:0.5rem;min-height:1.2em;"></div>' +
        '<label style="display:block;margin-bottom:0.5rem;font-size:0.9rem;">当前密码<input type="password" id="auth-cp-old" style="display:block;width:100%;margin-top:4px;padding:6px 8px;box-sizing:border-box;border:1px solid #ccc;border-radius:4px;"></label>' +
        '<label style="display:block;margin-bottom:0.5rem;font-size:0.9rem;">新密码（至少 6 位）<input type="password" id="auth-cp-new" style="display:block;width:100%;margin-top:4px;padding:6px 8px;box-sizing:border-box;border:1px solid #ccc;border-radius:4px;"></label>' +
        '<label style="display:block;margin-bottom:1rem;font-size:0.9rem;">确认新密码<input type="password" id="auth-cp-confirm" style="display:block;width:100%;margin-top:4px;padding:6px 8px;box-sizing:border-box;border:1px solid #ccc;border-radius:4px;"></label>' +
        '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
          '<button id="auth-cp-cancel" style="padding:6px 16px;border:1px solid #ccc;border-radius:4px;background:#fff;cursor:pointer;">取消</button>' +
          '<button id="auth-cp-ok" style="padding:6px 16px;border:none;border-radius:4px;background:#4a6741;color:#fff;cursor:pointer;">确认修改</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(dialog);

    var errEl = document.getElementById('auth-change-pwd-error');

    dialog.querySelector('#auth-cp-cancel').addEventListener('click', function () { dialog.remove(); });

    dialog.querySelector('#auth-cp-ok').addEventListener('click', function () {
      var oldPwd = document.getElementById('auth-cp-old').value.trim();
      var newPwd = document.getElementById('auth-cp-new').value.trim();
      var confirmPwd = document.getElementById('auth-cp-confirm').value.trim();

      if (!oldPwd || !newPwd || !confirmPwd) { errEl.textContent = '请填写所有字段'; return; }
      if (newPwd.length < MIN_PASSWORD_LENGTH) { errEl.textContent = '新密码长度不能少于 ' + MIN_PASSWORD_LENGTH + ' 位'; return; }
      if (newPwd !== confirmPwd) { errEl.textContent = '两次输入的新密码不一致'; return; }

      if (doChangePassword(oldPwd, newPwd)) {
        dialog.remove();
        showInlineMessage('密码修改成功');
      } else {
        errEl.textContent = '当前密码不正确';
      }
    });
  }

  /* ═══════════════════════════════════════════
     管理员面板
     ═══════════════════════════════════════════ */

  function renderAdminPanel() {
    var container = document.getElementById('admin-users-list');
    if (!container) return;

    var users = getUsers();
    if (users.length === 0) { container.innerHTML = '<p style="color:#888;">暂无用户数据</p>'; return; }

    var currentSession = getSession();
    var html = '<table style="width:100%;border-collapse:collapse;font-size:0.9rem;">';
    html += '<thead><tr style="border-bottom:2px solid #4a6741;color:#4a6741;">' +
      '<th style="text-align:left;padding:8px 4px;">用户名</th>' +
      '<th style="text-align:left;padding:8px 4px;">姓名</th>' +
      '<th style="text-align:left;padding:8px 4px;">角色</th>' +
      '<th style="text-align:left;padding:8px 4px;">上次登录</th>' +
      '<th style="text-align:right;padding:8px 4px;">操作</th>' +
      '</tr></thead><tbody>';

    users.forEach(function (u) {
      var isSelf = currentSession && currentSession.username === u.username;
      var lastLogin = u.lastLogin ? new Date(u.lastLogin).toLocaleString('zh-CN') : '从未登录';
      html += '<tr style="border-bottom:1px solid #eee;">' +
        '<td style="padding:8px 4px;">' + escapeHtml(u.username) + '</td>' +
        '<td style="padding:8px 4px;">' + escapeHtml(u.realName || '-') + '</td>' +
        '<td style="padding:8px 4px;">' + (u.role === 'admin' ? '管理员' : '普通用户') + '</td>' +
        '<td style="padding:8px 4px;color:#888;font-size:0.8rem;">' + lastLogin + '</td>' +
        '<td style="padding:8px 4px;text-align:right;">';

      if (!isSelf) {
        html += '<button class="admin-reset-pwd-btn" data-username="' + escapeHtml(u.username) + '" ' +
          'style="margin-left:4px;padding:3px 8px;font-size:0.8rem;border:1px solid #e67e22;color:#e67e22;background:#fff;border-radius:3px;cursor:pointer;">重置密码</button>';
      }
      if (u.username !== 'admin' && !isSelf) {
        html += '<button class="admin-delete-user-btn" data-username="' + escapeHtml(u.username) + '" ' +
          'style="margin-left:4px;padding:3px 8px;font-size:0.8rem;border:1px solid #c0392b;color:#c0392b;background:#fff;border-radius:3px;cursor:pointer;">删除</button>';
      }
      html += '</td></tr>';
    });

    html += '</tbody></table>';
    container.innerHTML = html;

    container.querySelectorAll('.admin-reset-pwd-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { showResetPasswordDialog(this.getAttribute('data-username')); });
    });
    container.querySelectorAll('.admin-delete-user-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { showDeleteConfirmDialog(this.getAttribute('data-username')); });
    });
  }

  function showAdminPanel() {
    var overlay = document.getElementById('admin-panel-overlay');
    if (overlay) { overlay.style.display = 'flex'; renderAdminPanel(); }
  }

  function hideAdminPanel() {
    var overlay = document.getElementById('admin-panel-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  function handleAddUser(e) {
    e.preventDefault();
    var usernameEl = document.getElementById('admin-new-username');
    var realNameEl = document.getElementById('admin-new-realname');
    var passwordEl = document.getElementById('admin-new-password');
    var roleEl = document.getElementById('admin-new-role');
    var errorEl = document.getElementById('admin-add-error');

    var result = doAddUser({
      username: usernameEl ? usernameEl.value.trim() : '',
      realName: realNameEl ? realNameEl.value.trim() : '',
      password: passwordEl ? passwordEl.value.trim() : '',
      role: roleEl ? roleEl.value : 'user'
    });

    if (result === true) {
      if (usernameEl) usernameEl.value = '';
      if (realNameEl) realNameEl.value = '';
      if (passwordEl) passwordEl.value = '';
      if (roleEl) roleEl.value = 'user';
      if (errorEl) errorEl.textContent = '';
      renderAdminPanel();
      showInlineMessage('用户添加成功');
    } else {
      if (errorEl) errorEl.textContent = result;
    }
  }

  function showResetPasswordDialog(username) {
    var dialog = document.createElement('div');
    dialog.style.cssText = 'position:fixed;inset:0;z-index:10001;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);';
    var user = findUser(username);
    dialog.innerHTML =
      '<div style="background:#fff;padding:2rem;border-radius:8px;width:360px;max-width:90vw;">' +
        '<h3 style="margin:0 0 1rem;font-size:1.1rem;">重置密码 — ' + escapeHtml(user ? (user.realName || user.username) : username) + '</h3>' +
        '<div id="auth-reset-pwd-error" style="color:#c0392b;font-size:0.85rem;margin-bottom:0.5rem;min-height:1.2em;"></div>' +
        '<label style="display:block;margin-bottom:1rem;font-size:0.9rem;">新密码（至少 6 位）<input type="password" id="auth-rp-new" style="display:block;width:100%;margin-top:4px;padding:6px 8px;box-sizing:border-box;border:1px solid #ccc;border-radius:4px;"></label>' +
        '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
          '<button id="auth-rp-cancel" style="padding:6px 16px;border:1px solid #ccc;border-radius:4px;background:#fff;cursor:pointer;">取消</button>' +
          '<button id="auth-rp-ok" style="padding:6px 16px;border:none;border-radius:4px;background:#e67e22;color:#fff;cursor:pointer;">确认重置</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(dialog);
    var errEl = document.getElementById('auth-reset-pwd-error');
    dialog.querySelector('#auth-rp-cancel').addEventListener('click', function () { dialog.remove(); });
    dialog.querySelector('#auth-rp-ok').addEventListener('click', function () {
      var newPwd = document.getElementById('auth-rp-new').value.trim();
      if (newPwd.length < MIN_PASSWORD_LENGTH) { errEl.textContent = '密码长度不能少于 ' + MIN_PASSWORD_LENGTH + ' 位'; return; }
      var result = doResetPassword(username, newPwd);
      if (result === true) { dialog.remove(); showInlineMessage('已重置 "' + username + '" 的密码'); }
      else { errEl.textContent = result || '操作失败'; }
    });
  }

  function showDeleteConfirmDialog(username) {
    var dialog = document.createElement('div');
    dialog.style.cssText = 'position:fixed;inset:0;z-index:10001;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);';
    var user = findUser(username);
    dialog.innerHTML =
      '<div style="background:#fff;padding:2rem;border-radius:8px;width:340px;max-width:90vw;text-align:center;">' +
        '<p style="font-size:1rem;margin:0 0 1.5rem;">确定要删除用户 <strong>' + escapeHtml(user ? (user.realName || user.username) : username) + '</strong> 吗？<br><span style="color:#888;font-size:0.85rem;">此操作不可撤销</span></p>' +
        '<div style="display:flex;gap:8px;justify-content:center;">' +
          '<button id="auth-del-cancel" style="padding:6px 20px;border:1px solid #ccc;border-radius:4px;background:#fff;cursor:pointer;">取消</button>' +
          '<button id="auth-del-ok" style="padding:6px 20px;border:none;border-radius:4px;background:#c0392b;color:#fff;cursor:pointer;">确认删除</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(dialog);
    dialog.querySelector('#auth-del-cancel').addEventListener('click', function () { dialog.remove(); });
    dialog.querySelector('#auth-del-ok').addEventListener('click', function () {
      var result = doDeleteUser(username);
      dialog.remove();
      if (result === true) { renderAdminPanel(); showInlineMessage('已删除用户 "' + username + '"'); }
      else { showInlineMessage(result || '删除失败'); }
    });
  }

  /* ═══════════════════════════════════════════
     事件绑定
     ═══════════════════════════════════════════ */

  function bindEvents() {
    // 登录表单 — 仅绑定 submit 事件
    var loginForm = document.getElementById('auth-login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', function (e) {
        e.preventDefault();
        e.stopPropagation();
        handleLogin();
      });
    }

    // 注销
    var logoutBtn = document.getElementById('auth-logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', function () { doLogout(); });

    // 修改密码
    var changePwdBtn = document.getElementById('auth-change-pwd-btn');
    if (changePwdBtn) changePwdBtn.addEventListener('click', showChangePasswordDialog);

    // 管理员面板
    var adminBtn = document.getElementById('auth-admin-btn');
    if (adminBtn) adminBtn.addEventListener('click', showAdminPanel);

    var adminClose = document.getElementById('admin-panel-close');
    if (adminClose) adminClose.addEventListener('click', hideAdminPanel);

    // 新增用户表单
    var addForm = document.getElementById('admin-add-form');
    if (addForm) addForm.addEventListener('submit', handleAddUser);
  }

  /* ═══════════════════════════════════════════
     初始化（同步）
     ═══════════════════════════════════════════ */

  function init() {
    // 1. 确保默认管理员存在（同步）
    ensureDefaultAdmin();

    // 2. 清除可能存在的旧锁定状态（防止用户刷新后仍被锁定）
    sessionStorage.removeItem(ATTEMPTS_KEY);
    sessionStorage.removeItem(LOCKOUT_KEY);

    // 3. 检查是否有活跃会话
    var session = getSession();
    if (session) {
      hideLoginOverlay();
      updateHeaderUI(session);
      resetInactivityTimer();
    } else {
      showLoginOverlay();
    }

    // 4. 绑定事件
    bindEvents();

    // 5. 启动无操作监听
    bindActivityListeners();
  }

  /* ═══════════════════════════════════════════
     公共接口
     ═══════════════════════════════════════════ */

  window.AuthSystem = {
    init: init,
    login: function (u, p) { return doLogin(u, p); },
    logout: function () { doLogout(); },
    changePassword: function (oldP, newP) { return doChangePassword(oldP, newP); },
    isAdmin: function () { var s = getSession(); return s && s.role === 'admin'; },
    getCurrentUser: function () {
      var s = getSession();
      return s ? { username: s.username, role: s.role, realName: s.realName } : null;
    },
    addUser: function (data) { return doAddUser(data); },
    deleteUser: function (u) { return doDeleteUser(u); },
    resetPassword: function (u, p) { return doResetPassword(u, p); },
    getAllUsers: function () { return doGetAllUsers(); }
  };

  // ═══ 自动初始化 ═══
  // DOM 加载完成后立即初始化认证系统
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
