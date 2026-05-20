/**
 * 宋染 · 非遗数字设计系统 — 身份认证模块
 * ============================================================
 * 纯前端认证方案：localStorage 存储用户、sessionStorage 管理会话，
 * Web Crypto API 进行 SHA-256 密码哈希。
 *
 * 公共接口挂载于 window.AuthSystem：
 *   init()                           — 初始化认证系统
 *   login(username, password)        — 用户登录
 *   logout()                         — 注销登录
 *   changePassword(oldPwd, newPwd)   — 修改当前用户密码
 *   isAdmin()                        — 当前用户是否为管理员
 *   getCurrentUser()                 — 获取当前登录用户信息
 *   addUser(data)                    — 新增用户（管理员权限）
 *   deleteUser(username)             — 删除用户（管理员权限）
 *   resetPassword(username, newPwd)  — 重置用户密码（管理员权限）
 *   getAllUsers()                    — 获取所有用户列表
 */
;(function () {
  'use strict';

  /* ═══════════════════════════════════════════
     常量与配置
     ═══════════════════════════════════════════ */

  const STORAGE_KEY  = 'songdye_users';          // localStorage 用户数据键
  const SESSION_KEY  = 'songdye_session';         // sessionStorage 会话键
  const ATTEMPTS_KEY = 'songdye_login_attempts'; // 登录失败次数记录键
  const LOCKOUT_KEY  = 'songdye_lockout_until';  // 锁定截止时间键
  const INACTIVITY_TIMEOUT = 30 * 60 * 1000;     // 30 分钟无操作自动注销
  const MAX_FAILED_ATTEMPTS = 5;                 // 最大失败尝试次数
  const LOCKOUT_DURATION    = 60 * 1000;         // 锁定冷却 60 秒
  const MIN_PASSWORD_LENGTH = 6;                 // 密码最短长度

  // 默认管理员账户
  const DEFAULT_ADMIN = {
    username: 'admin',
    password: 'songdye2026',
    role: 'admin',
    realName: '系统管理员'
  };

  // 会话有效时长（与 INACTIVITY_TIMEOUT 联动）
  const SESSION_MAX_AGE = INACTIVITY_TIMEOUT;

  /* ═══════════════════════════════════════════
     工具函数
     ═══════════════════════════════════════════ */

  /** SHA-256 哈希 — 优先使用 crypto.subtle.digestSync（现代浏览器），
   *  若不可用则降级为纯 JS 实现 */
  async function sha256(message) {
    const encoder = new TextEncoder();
    const data = encoder.encode(message);

    // 优先使用同步 API（Chrome ≥ 130）
    if (typeof crypto.subtle !== 'undefined' && typeof crypto.subtle.digestSync === 'function') {
      const hashBuffer = crypto.subtle.digestSync('SHA-256', data);
      return bufferToHex(hashBuffer);
    }

    // 回退到异步 API
    if (typeof crypto.subtle !== 'undefined') {
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      return bufferToHex(hashBuffer);
    }

    // 最终降级：简易哈希函数
    return fallbackHash(message);
  }

  /** ArrayBuffer → 十六进制字符串 */
  function bufferToHex(buffer) {
    return Array.from(new Uint8Array(buffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /** 降级哈希（djb2 + 混淆，仅用于 crypto.subtle 不可用的场景） */
  function fallbackHash(str) {
    let h1 = 5381;
    let h2 = 52711;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = ((h1 << 5) + h1 + ch) & 0x7fffffff;
      h2 = ((h2 << 5) + h2 + ch) & 0x7fffffff;
    }
    return ((h1 << 16) | h2).toString(16).padStart(16, '0');
  }

  /* ═══════════════════════════════════════════
     数据持久层（localStorage）
     ═══════════════════════════════════════════ */

  /** 读取用户列表 */
  function getUsers() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  /** 写入用户列表 */
  function saveUsers(users) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
  }

  /** 按用户名查找用户 */
  function findUser(username) {
    return getUsers().find(u => u.username === username) || null;
  }

  /** 首次运行时初始化默认管理员 */
  async function ensureDefaultAdmin() {
    if (getUsers().length === 0) {
      const hash = await sha256(DEFAULT_ADMIN.password);
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

  /** 创建会话 */
  function createSession(user) {
    const session = {
      username: user.username,
      role: user.role,
      realName: user.realName,
      loginAt: Date.now()
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }

  /** 读取会话 */
  function getSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw);
      // 检查会话是否过期
      if (Date.now() - session.loginAt > SESSION_MAX_AGE) {
        sessionStorage.removeItem(SESSION_KEY);
        return null;
      }
      return session;
    } catch {
      return null;
    }
  }

  /** 销毁会话 */
  function destroySession() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  /* ═══════════════════════════════════════════
     登录频率限制
     ═══════════════════════════════════════════ */

  function getFailedAttempts() {
    return parseInt(sessionStorage.getItem(ATTEMPTS_KEY) || '0', 10);
  }

  function setFailedAttempts(n) {
    sessionStorage.setItem(ATTEMPTS_KEY, String(n));
  }

  function getLockoutUntil() {
    const val = sessionStorage.getItem(LOCKOUT_KEY);
    return val ? parseInt(val, 10) : 0;
  }

  function setLockoutUntil(timestamp) {
    sessionStorage.setItem(LOCKOUT_KEY, String(timestamp));
  }

  /** 检查是否被锁定，返回剩余秒数；0 表示未锁定 */
  function getLockoutRemaining() {
    const until = getLockoutUntil();
    if (until <= 0) return 0;
    const remaining = Math.ceil((until - Date.now()) / 1000);
    return remaining > 0 ? remaining : 0;
  }

  /** 登录成功，清除限制计数 */
  function resetRateLimit() {
    setFailedAttempts(0);
    setLockoutUntil(0);
  }

  /** 登录失败，累加计数；达到阈值则锁定 */
  function recordFailedAttempt() {
    const attempts = getFailedAttempts() + 1;
    setFailedAttempts(attempts);
    if (attempts >= MAX_FAILED_ATTEMPTS) {
      setLockoutUntil(Date.now() + LOCKOUT_DURATION);
    }
  }

  /* ═══════════════════════════════════════════
     无操作自动注销计时器
     ═══════════════════════════════════════════ */

  let inactivityTimer = null;

  /** 重置无操作计时器 */
  function resetInactivityTimer() {
    clearInactivityTimer();
    inactivityTimer = setTimeout(function () {
      // 会话超时，自动注销
      doLogout('由于长时间未操作，会话已过期，请重新登录。');
    }, INACTIVITY_TIMEOUT);
  }

  /** 清除无操作计时器 */
  function clearInactivityTimer() {
    if (inactivityTimer) {
      clearTimeout(inactivityTimer);
      inactivityTimer = null;
    }
  }

  /** 绑定用户活动事件以重置计时器 */
  function bindActivityListeners() {
    var events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    events.forEach(function (evt) {
      document.addEventListener(evt, resetInactivityTimer, { passive: true });
    });
  }

  /* ═══════════════════════════════════════════
     UI 辅助
     ═══════════════════════════════════════════ */

  /** 设置登录错误信息 */
  function showLoginError(msg) {
    var el = document.getElementById('auth-login-error');
    if (el) {
      el.textContent = msg;
      el.style.display = msg ? 'block' : 'none';
    }
  }

  /** 显示登录遮罩层，隐藏主应用 */
  function showLoginOverlay() {
    var overlay = document.getElementById('auth-login-overlay');
    if (overlay) overlay.style.display = 'flex';

    var main = document.getElementById('app-main');
    if (main) main.style.display = 'none';
  }

  /** 隐藏登录遮罩层，显示主应用 */
  function hideLoginOverlay() {
    var overlay = document.getElementById('auth-login-overlay');
    if (overlay) overlay.style.display = 'none';

    var main = document.getElementById('app-main');
    if (main) main.style.display = '';
  }

  /** 更新头部用户信息 */
  function updateHeaderUI(session) {
    var userInfo = document.getElementById('auth-user-info');
    var logoutBtn = document.getElementById('auth-logout-btn');
    var changePwdBtn = document.getElementById('auth-change-pwd-btn');
    var adminBtn = document.getElementById('auth-admin-btn');

    if (userInfo) {
      userInfo.textContent = (session.realName || session.username) + '（' + (session.role === 'admin' ? '管理员' : '用户') + '）';
      userInfo.style.display = '';
    }
    if (logoutBtn) logoutBtn.style.display = '';
    if (changePwdBtn) changePwdBtn.style.display = '';
    if (adminBtn) {
      adminBtn.style.display = session.role === 'admin' ? '' : 'none';
    }
  }

  /** 隐藏头部用户信息 */
  function hideHeaderUI() {
    var userInfo = document.getElementById('auth-user-info');
    var logoutBtn = document.getElementById('auth-logout-btn');
    var changePwdBtn = document.getElementById('auth-change-pwd-btn');
    var adminBtn = document.getElementById('auth-admin-btn');

    if (userInfo) userInfo.style.display = 'none';
    if (logoutBtn) logoutBtn.style.display = 'none';
    if (changePwdBtn) changePwdBtn.style.display = 'none';
    if (adminBtn) adminBtn.style.display = 'none';
  }

  /* ═══════════════════════════════════════════
     修改密码弹窗
     ═══════════════════════════════════════════ */

  /** 弹出修改密码对话框（使用 prompt 系列，内联 DOM） */
  function showChangePasswordDialog() {
    // 若已有弹窗则不重复
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
    var oldInput = document.getElementById('auth-cp-old');
    var newInput = document.getElementById('auth-cp-new');
    var confirmInput = document.getElementById('auth-cp-confirm');

    function close() {
      dialog.remove();
    }

    document.getElementById('auth-cp-cancel').addEventListener('click', close);

    document.getElementById('auth-cp-ok').addEventListener('click', function () {
      var oldPwd = oldInput.value.trim();
      var newPwd = newInput.value.trim();
      var confirmPwd = confirmInput.value.trim();

      if (!oldPwd || !newPwd || !confirmPwd) {
        errEl.textContent = '请填写所有字段';
        return;
      }
      if (newPwd.length < MIN_PASSWORD_LENGTH) {
        errEl.textContent = '新密码长度不能少于 ' + MIN_PASSWORD_LENGTH + ' 位';
        return;
      }
      if (newPwd !== confirmPwd) {
        errEl.textContent = '两次输入的新密码不一致';
        return;
      }

      // 调用公共 API 完成修改
      window.AuthSystem.changePassword(oldPwd, newPwd).then(function (ok) {
        if (ok) {
          close();
          // 使用内联提示代替 alert
          showInlineMessage('密码修改成功');
        } else {
          errEl.textContent = '当前密码不正确';
        }
      });
    });
  }

  /** 内联消息提示（替代 alert） */
  function showInlineMessage(text) {
    var msg = document.createElement('div');
    msg.textContent = text;
    msg.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:20000;background:#4a6741;color:#fff;padding:10px 24px;border-radius:6px;font-size:0.95rem;box-shadow:0 2px 12px rgba(0,0,0,0.15);transition:opacity 0.3s;';
    document.body.appendChild(msg);
    setTimeout(function () {
      msg.style.opacity = '0';
      setTimeout(function () { msg.remove(); }, 300);
    }, 2000);
  }

  /* ═══════════════════════════════════════════
     管理员面板
     ═══════════════════════════════════════════ */

  /** 渲染管理员面板内容 */
  function renderAdminPanel() {
    var container = document.getElementById('admin-users-list');
    if (!container) return;

    var users = getUsers();

    if (users.length === 0) {
      container.innerHTML = '<p style="color:#888;">暂无用户数据</p>';
      return;
    }

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
      var isDefaultAdmin = u.username === 'admin';
      var lastLogin = u.lastLogin ? new Date(u.lastLogin).toLocaleString('zh-CN') : '从未登录';

      html += '<tr style="border-bottom:1px solid #eee;">' +
        '<td style="padding:8px 4px;">' + escapeHtml(u.username) + '</td>' +
        '<td style="padding:8px 4px;">' + escapeHtml(u.realName || '-') + '</td>' +
        '<td style="padding:8px 4px;">' + (u.role === 'admin' ? '管理员' : '普通用户') + '</td>' +
        '<td style="padding:8px 4px;color:#888;font-size:0.8rem;">' + lastLogin + '</td>' +
        '<td style="padding:8px 4px;text-align:right;">';

      // 重置密码按钮
      if (!isSelf) {
        html += '<button class="admin-reset-pwd-btn" data-username="' + escapeHtml(u.username) + '" ' +
          'style="margin-left:4px;padding:3px 8px;font-size:0.8rem;border:1px solid #e67e22;color:#e67e22;background:#fff;border-radius:3px;cursor:pointer;">重置密码</button>';
      }

      // 删除按钮（管理员账户和自身不可删除）
      if (!isDefaultAdmin && !isSelf) {
        html += '<button class="admin-delete-user-btn" data-username="' + escapeHtml(u.username) + '" ' +
          'style="margin-left:4px;padding:3px 8px;font-size:0.8rem;border:1px solid #c0392b;color:#c0392b;background:#fff;border-radius:3px;cursor:pointer;">删除</button>';
      }

      html += '</td></tr>';
    });

    html += '</tbody></table>';
    container.innerHTML = html;

    // 绑定重置密码按钮
    container.querySelectorAll('.admin-reset-pwd-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var username = this.getAttribute('data-username');
        showResetPasswordDialog(username);
      });
    });

    // 绑定删除按钮
    container.querySelectorAll('.admin-delete-user-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var username = this.getAttribute('data-username');
        showDeleteConfirmDialog(username);
      });
    });
  }

  /** HTML 转义 */
  function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  /** 显示 / 隐藏管理员面板 */
  function showAdminPanel() {
    var overlay = document.getElementById('admin-panel-overlay');
    if (overlay) {
      overlay.style.display = 'flex';
      renderAdminPanel();
    }
  }

  function hideAdminPanel() {
    var overlay = document.getElementById('admin-panel-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  /** 新增用户表单提交处理 */
  function handleAddUser(e) {
    e.preventDefault();

    var usernameEl = document.getElementById('admin-new-username');
    var realNameEl = document.getElementById('admin-new-realname');
    var passwordEl = document.getElementById('admin-new-password');
    var roleEl = document.getElementById('admin-new-role');
    var errorEl = document.getElementById('admin-add-error');

    var username = usernameEl ? usernameEl.value.trim() : '';
    var realName = realNameEl ? realNameEl.value.trim() : '';
    var password = passwordEl ? passwordEl.value.trim() : '';
    var role = roleEl ? roleEl.value : 'user';

    if (!username || !realName || !password) {
      if (errorEl) errorEl.textContent = '请填写所有字段';
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      if (errorEl) errorEl.textContent = '密码长度不能少于 ' + MIN_PASSWORD_LENGTH + ' 位';
      return;
    }

    var result = window.AuthSystem.addUser({ username: username, realName: realName, password: password, role: role });
    if (result === true) {
      // 清空表单
      if (usernameEl) usernameEl.value = '';
      if (realNameEl) realNameEl.value = '';
      if (passwordEl) passwordEl.value = '';
      if (roleEl) roleEl.value = 'user';
      if (errorEl) errorEl.textContent = '';
      renderAdminPanel();
      showInlineMessage('用户 "' + username + '" 添加成功');
    } else {
      if (errorEl) errorEl.textContent = result; // result 是错误信息
    }
  }

  /** 重置密码弹窗 */
  function showResetPasswordDialog(username) {
    var dialog = document.createElement('div');
    dialog.style.cssText = 'position:fixed;inset:0;z-index:10001;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);';

    var user = findUser(username);
    var displayName = user ? (user.realName || user.username) : username;

    dialog.innerHTML =
      '<div style="background:#fff;padding:2rem;border-radius:8px;width:360px;max-width:90vw;">' +
        '<h3 style="margin:0 0 1rem;font-size:1.1rem;">重置密码 — ' + escapeHtml(displayName) + '</h3>' +
        '<div id="auth-reset-pwd-error" style="color:#c0392b;font-size:0.85rem;margin-bottom:0.5rem;min-height:1.2em;"></div>' +
        '<label style="display:block;margin-bottom:1rem;font-size:0.9rem;">新密码（至少 6 位）<input type="password" id="auth-rp-new" style="display:block;width:100%;margin-top:4px;padding:6px 8px;box-sizing:border-box;border:1px solid #ccc;border-radius:4px;"></label>' +
        '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
          '<button id="auth-rp-cancel" style="padding:6px 16px;border:1px solid #ccc;border-radius:4px;background:#fff;cursor:pointer;">取消</button>' +
          '<button id="auth-rp-ok" style="padding:6px 16px;border:none;border-radius:4px;background:#e67e22;color:#fff;cursor:pointer;">确认重置</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(dialog);

    var errEl = document.getElementById('auth-reset-pwd-error');

    function close() { dialog.remove(); }

    document.getElementById('auth-rp-cancel').addEventListener('click', close);

    document.getElementById('auth-rp-ok').addEventListener('click', function () {
      var newPwd = document.getElementById('auth-rp-new').value.trim();
      if (newPwd.length < MIN_PASSWORD_LENGTH) {
        errEl.textContent = '密码长度不能少于 ' + MIN_PASSWORD_LENGTH + ' 位';
        return;
      }

      window.AuthSystem.resetPassword(username, newPwd).then(function (result) {
        if (result === true) {
          close();
          showInlineMessage('已重置 "' + username + '" 的密码');
        } else {
          errEl.textContent = result || '操作失败';
        }
      });
    });
  }

  /** 删除确认弹窗 */
  function showDeleteConfirmDialog(username) {
    var dialog = document.createElement('div');
    dialog.style.cssText = 'position:fixed;inset:0;z-index:10001;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);';

    var user = findUser(username);
    var displayName = user ? (user.realName || user.username) : username;

    dialog.innerHTML =
      '<div style="background:#fff;padding:2rem;border-radius:8px;width:340px;max-width:90vw;text-align:center;">' +
        '<p style="font-size:1rem;margin:0 0 1.5rem;">确定要删除用户 <strong>' + escapeHtml(displayName) + '</strong> 吗？<br><span style="color:#888;font-size:0.85rem;">此操作不可撤销</span></p>' +
        '<div style="display:flex;gap:8px;justify-content:center;">' +
          '<button id="auth-del-cancel" style="padding:6px 20px;border:1px solid #ccc;border-radius:4px;background:#fff;cursor:pointer;">取消</button>' +
          '<button id="auth-del-ok" style="padding:6px 20px;border:none;border-radius:4px;background:#c0392b;color:#fff;cursor:pointer;">确认删除</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(dialog);

    document.getElementById('auth-del-cancel').addEventListener('click', function () { dialog.remove(); });

    document.getElementById('auth-del-ok').addEventListener('click', function () {
      var result = window.AuthSystem.deleteUser(username);
      dialog.remove();
      if (result === true) {
        renderAdminPanel();
        showInlineMessage('已删除用户 "' + username + '"');
      } else {
        showInlineMessage(result || '删除失败');
      }
    });
  }

  /* ═══════════════════════════════════════════
     核心业务逻辑
     ═══════════════════════════════════════════ */

  /** 登录 */
  async function login(username, password) {
    // 频率限制检查
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

    var inputHash = await sha256(password);
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

    // 创建会话
    var session = createSession(user);
    return { success: true, session: session };
  }

  /** 注销 */
  function doLogout(reason) {
    destroySession();
    clearInactivityTimer();
    hideHeaderUI();
    showLoginOverlay();
    showLoginError(reason || '');
  }

  /** 修改密码 */
  async function changePassword(oldPwd, newPwd) {
    var session = getSession();
    if (!session) return false;

    if (newPwd.length < MIN_PASSWORD_LENGTH) return false;

    var user = findUser(session.username);
    if (!user) return false;

    var oldHash = await sha256(oldPwd);
    if (oldHash !== user.passwordHash) return false;

    var newHash = await sha256(newPwd);
    var users = getUsers();
    var idx = users.findIndex(function (u) { return u.username === session.username; });
    if (idx === -1) return false;

    users[idx].passwordHash = newHash;
    saveUsers(users);
    return true;
  }

  /** 新增用户（管理员权限） */
  async function addUser(data) {
    var session = getSession();
    if (!session || session.role !== 'admin') {
      return '权限不足';
    }

    var username = (data.username || '').trim();
    var realName = (data.realName || '').trim();
    var password = (data.password || '').trim();
    var role = data.role === 'admin' ? 'admin' : 'user';

    if (!username || !realName || !password) {
      return '请填写所有字段';
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return '密码长度不能少于 ' + MIN_PASSWORD_LENGTH + ' 位';
    }
    if (findUser(username)) {
      return '用户名 "' + username + '" 已存在';
    }

    var hash = await sha256(password);
    var users = getUsers();
    users.push({
      username: username,
      passwordHash: hash,
      role: role,
      realName: realName,
      createdAt: new Date().toISOString(),
      lastLogin: null
    });
    saveUsers(users);
    return true;
  }

  /** 删除用户（管理员权限） */
  function deleteUser(username) {
    var session = getSession();
    if (!session || session.role !== 'admin') {
      return '权限不足';
    }

    if (username === 'admin') {
      return '不能删除管理员账户';
    }
    if (username === session.username) {
      return '不能删除当前登录的用户';
    }

    var users = getUsers();
    var idx = users.findIndex(function (u) { return u.username === username; });
    if (idx === -1) {
      return '用户不存在';
    }

    users.splice(idx, 1);
    saveUsers(users);
    return true;
  }

  /** 重置用户密码（管理员权限） */
  async function resetPassword(username, newPwd) {
    var session = getSession();
    if (!session || session.role !== 'admin') {
      return '权限不足';
    }

    if (newPwd.length < MIN_PASSWORD_LENGTH) {
      return '密码长度不能少于 ' + MIN_PASSWORD_LENGTH + ' 位';
    }

    var users = getUsers();
    var idx = users.findIndex(function (u) { return u.username === username; });
    if (idx === -1) {
      return '用户不存在';
    }

    var hash = await sha256(newPwd);
    users[idx].passwordHash = hash;
    saveUsers(users);
    return true;
  }

  /** 获取所有用户列表（管理员权限） */
  function getAllUsers() {
    var session = getSession();
    if (!session || session.role !== 'admin') {
      return null;
    }

    // 返回不含密码哈希的用户信息
    return getUsers().map(function (u) {
      return {
        username: u.username,
        role: u.role,
        realName: u.realName,
        createdAt: u.createdAt,
        lastLogin: u.lastLogin
      };
    });
  }

  /* ═══════════════════════════════════════════
     事件绑定
     ═══════════════════════════════════════════ */

  function bindEvents() {
    // 登录表单提交拦截（防止页面刷新）
    var loginForm = document.getElementById('auth-login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', function (e) {
        e.preventDefault();
        handleLoginClick();
      });
    }

    // 登录按钮（备用，处理非表单触发场景）
    var loginBtn = document.getElementById('auth-login-btn');
    if (loginBtn) {
      loginBtn.addEventListener('click', function (e) {
        e.preventDefault();
        handleLoginClick();
      });
    }

    // 登录框回车提交
    var passwordInput = document.getElementById('auth-password');
    if (passwordInput) {
      passwordInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') handleLoginClick();
      });
    }
    var usernameInput = document.getElementById('auth-username');
    if (usernameInput) {
      usernameInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') handleLoginClick();
      });
    }

    // 注销按钮
    var logoutBtn = document.getElementById('auth-logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function () {
        doLogout();
      });
    }

    // 修改密码按钮
    var changePwdBtn = document.getElementById('auth-change-pwd-btn');
    if (changePwdBtn) {
      changePwdBtn.addEventListener('click', function () {
        showChangePasswordDialog();
      });
    }

    // 管理员面板按钮
    var adminBtn = document.getElementById('auth-admin-btn');
    if (adminBtn) {
      adminBtn.addEventListener('click', showAdminPanel);
    }

    // 管理员面板关闭按钮
    var adminClose = document.getElementById('admin-panel-close');
    if (adminClose) {
      adminClose.addEventListener('click', hideAdminPanel);
    }

    // 新增用户表单
    var addForm = document.getElementById('admin-add-form');
    if (addForm) {
      addForm.addEventListener('submit', handleAddUser);
    }
  }

  /** 处理登录按钮点击 */
  async function handleLoginClick() {
    var usernameEl = document.getElementById('auth-username');
    var passwordEl = document.getElementById('auth-password');
    if (!usernameEl || !passwordEl) return;

    var username = usernameEl.value.trim();
    var password = passwordEl.value;

    // 禁用按钮防止重复提交
    var loginBtn = document.getElementById('auth-login-btn');
    if (loginBtn) loginBtn.disabled = true;

    var result = await login(username, password);

    if (loginBtn) loginBtn.disabled = false;

    if (result.success) {
      showLoginError('');
      if (usernameEl) usernameEl.value = '';
      if (passwordEl) passwordEl.value = '';
      hideLoginOverlay();
      updateHeaderUI(result.session);
      resetInactivityTimer();
    } else {
      showLoginError(result.message);
    }
  }

  /* ═══════════════════════════════════════════
     初始化
     ═══════════════════════════════════════════ */

  async function init() {
    // 1. 确保默认管理员存在
    await ensureDefaultAdmin();

    // 2. 检查是否有活跃会话
    var session = getSession();
    if (session) {
      // 会话有效，直接进入主应用
      hideLoginOverlay();
      updateHeaderUI(session);
      resetInactivityTimer();
    } else {
      // 无会话，显示登录界面
      showLoginOverlay();
      hideHeaderUI();
    }

    // 3. 绑定事件
    bindEvents();

    // 4. 启动无操作监听
    bindActivityListeners();
  }

  /* ═══════════════════════════════════════════
     公共接口 — 挂载到 window.AuthSystem
     ═══════════════════════════════════════════ */

  window.AuthSystem = {
    /** 初始化认证系统（页面加载后调用） */
    init: init,

    /**
     * 用户登录
     * @param {string} username
     * @param {string} password
     * @returns {Promise<{success: boolean, message?: string, session?: object}>}
     */
    login: login,

    /** 注销当前用户 */
    logout: function () { doLogout(); },

    /**
     * 修改当前用户密码
     * @param {string} oldPwd  当前密码
     * @param {string} newPwd  新密码
     * @returns {Promise<boolean>}  是否修改成功
     */
    changePassword: changePassword,

    /** 当前用户是否为管理员 */
    isAdmin: function () {
      var session = getSession();
      return session && session.role === 'admin';
    },

    /** 获取当前登录用户信息 */
    getCurrentUser: function () {
      var session = getSession();
      if (!session) return null;
      return {
        username: session.username,
        role: session.role,
        realName: session.realName
      };
    },

    /**
     * 新增用户（管理员权限）
     * @param {{ username: string, realName: string, password: string, role?: string }} data
     * @returns {Promise<true|string>}  成功返回 true，失败返回错误信息
     */
    addUser: addUser,

    /**
     * 删除用户（管理员权限）
     * @param {string} username
     * @returns {true|string}  成功返回 true，失败返回错误信息
     */
    deleteUser: deleteUser,

    /**
     * 重置用户密码（管理员权限）
     * @param {string} username
     * @param {string} newPwd
     * @returns {Promise<true|string>}  成功返回 true，失败返回错误信息
     */
    resetPassword: resetPassword,

    /**
     * 获取所有用户列表（管理员权限，不含密码哈希）
     * @returns {Array<object>|null}  管理员返回用户列表，否则返回 null
     */
    getAllUsers: getAllUsers
  };

})();
