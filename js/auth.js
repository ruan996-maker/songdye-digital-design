/**
 * 宋染 · 非遗数字设计系统 — 身份认证模块 v2
 * ============================================================
 * 云端同步认证方案：
 * - 用户数据存储在 GitHub 仓库的 data/users.json 中
 * - 本地 localStorage 作为缓存层
 * - 管理员增删用户时同步到 GitHub
 * - 登录时优先从 GitHub 拉取最新数据
 * - SHA-256 密码哈希（纯 JS 同步实现）
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
  var SYNC_TIME_KEY = 'songdye_sync_time';
  var INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 分钟
  var MAX_FAILED_ATTEMPTS = 5;
  var LOCKOUT_DURATION    = 60 * 1000;      // 60 秒
  var MIN_PASSWORD_LENGTH = 6;
  var SYNC_INTERVAL = 60000; // 60 秒同步一次

  // GitHub API 配置（公开仓库，只需 token 写入）
  var GITHUB_API = 'https://api.github.com/repos/ruan996-maker/songdye-digital-design/contents/data/users.json';
  var GITHUB_TOKEN = ''; // 由外部设置
  var BRANCH = 'main';

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
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
  ];

  function rightRotate(value, amount) {
    return (value >>> amount) | (value << (32 - amount));
  }

  function sha256(message) {
    var bytes = [];
    for (var i = 0; i < message.length; i++) {
      var code = message.charCodeAt(i);
      if (code < 0x80) bytes.push(code);
      else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
      else if (code < 0xd800 || code >= 0xe000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
      else { i++; code = ((code & 0x3ff) << 10) | (message.charCodeAt(i) & 0x3ff); bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f)); }
    }
    var msgLen = bytes.length; bytes.push(0x80);
    while ((bytes.length % 64) !== 56) bytes.push(0);
    var bitLen = msgLen * 8; bytes.push(0, 0, 0, 0, (bitLen >>> 24) & 0xff, (bitLen >>> 16) & 0xff, (bitLen >>> 8) & 0xff, bitLen & 0xff);
    var h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
    var h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
    for (var offset = 0; offset < bytes.length; offset += 64) {
      var w = new Array(64);
      for (var j = 0; j < 16; j++) w[j] = (bytes[offset + j * 4] << 24) | (bytes[offset + j * 4 + 1] << 16) | (bytes[offset + j * 4 + 2] << 8) | bytes[offset + j * 4 + 3];
      for (j = 16; j < 64; j++) { var s0 = rightRotate(w[j-15],7) ^ rightRotate(w[j-15],18) ^ (w[j-15]>>>3); var s1 = rightRotate(w[j-2],17) ^ rightRotate(w[j-2],19) ^ (w[j-2]>>>10); w[j] = (w[j-16]+s0+w[j-7]+s1)|0; }
      var a=h0,b=h1,c=h2,d=h3,e=h4,f=h5,g=h6,h=h7;
      for (j=0;j<64;j++){var S1=rightRotate(e,6)^rightRotate(e,11)^rightRotate(e,25);var ch=(e&f)^(~e&g);var t1=(h+S1+ch+K[j]+w[j])|0;var S0=rightRotate(a,2)^rightRotate(a,13)^rightRotate(a,22);var maj=(a&b)^(a&c)^(b&c);var t2=(S0+maj)|0;h=g;g=f;f=e;e=(d+t1)|0;d=c;c=b;b=a;a=(t1+t2)|0;}
      h0=(h0+a)|0;h1=(h1+b)|0;h2=(h2+c)|0;h3=(h3+d)|0;h4=(h4+e)|0;h5=(h5+f)|0;h6=(h6+g)|0;h7=(h7+h)|0;
    }
    var hex = ''; [h0,h1,h2,h3,h4,h5,h6,h7].forEach(function(v) { hex += ('00000000' + (v >>> 0).toString(16)).slice(-8); });
    return hex;
  }

  /* ═══════════════════════════════════════════
     数据持久层（云端 + 本地缓存）
     ═══════════════════════════════════════════ */

  function getUsersLocal() {
    try { var raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : []; }
    catch (e) { return []; }
  }

  function saveUsersLocal(users) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
    localStorage.setItem(SYNC_TIME_KEY, String(Date.now()));
  }

  function findUserLocal(username) {
    return getUsersLocal().find(function (u) { return u.username === username; }) || null;
  }

  // 确保默认管理员存在
  function ensureDefaultAdmin() {
    var users = getUsersLocal();
    var adminExists = users.some(function (u) { return u.username === 'admin'; });
    if (!adminExists) {
      users.unshift({
        username: DEFAULT_ADMIN.username,
        passwordHash: sha256(DEFAULT_ADMIN.password),
        role: DEFAULT_ADMIN.role,
        realName: DEFAULT_ADMIN.realName,
        createdAt: new Date().toISOString(),
        lastLogin: null
      });
      saveUsersLocal(users);
    }
  }

  /* ═══════════════════════════════════════════
     GitHub 云端同步
     ═══════════════════════════════════════════ */

  var _cloudSyncLock = false;
  var _cloudUsers = null;  // 云端缓存
  var _cloudSha = null;    // 文件 SHA，用于更新

  /** 从 GitHub 拉取用户数据（用于登录验证，GET 请求无需 token） */
  function fetchCloudUsers() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', GITHUB_API + '?ref=' + BRANCH, true);
    xhr.setRequestHeader('Accept', 'application/vnd.github.v3+json');

    return new Promise(function (resolve, reject) {
      xhr.onload = function () {
        if (xhr.status === 200) {
          try {
            var resp = JSON.parse(xhr.responseText);
            _cloudSha = resp.sha;
            var content = atob(resp.content.replace(/\n/g, ''));
            _cloudUsers = JSON.parse(content);
            // 合并到本地（云端为准）
            mergeFromCloud(_cloudUsers);
            resolve(_cloudUsers);
          } catch (e) {
            resolve(null);
          }
        } else if (xhr.status === 404) {
          // 文件不存在，首次使用
          resolve(null);
        } else {
          resolve(null);
        }
      };
      xhr.onerror = function () { resolve(null); };
      xhr.timeout = 10000;
      xhr.ontimeout = function () { resolve(null); };
      xhr.send();
    });
  }

  /** 合并云端数据到本地 */
  function mergeFromCloud(cloudUsers) {
    if (!cloudUsers || !Array.isArray(cloudUsers)) return;
    var localUsers = getUsersLocal();
    var localMap = {};
    localUsers.forEach(function (u) { localMap[u.username] = u; });

    // 以云端为准，但保留本地有而云端没有的用户
    var merged = [];
    cloudUsers.forEach(function (cu) {
      merged.push(cu);
      delete localMap[cu.username];
    });
    // 保留本地独有的用户
    Object.keys(localMap).forEach(function (k) { merged.push(localMap[k]); });

    saveUsersLocal(merged);
  }

  /** 推送用户数据到 GitHub（需要 token） */
  function pushCloudUsers(users) {
    if (!GITHUB_TOKEN) return Promise.resolve(false);

    var data = JSON.stringify(users, null, 2);
    var payload = {
      message: 'update: 同步用户数据 [' + new Date().toLocaleString('zh-CN') + ']',
      content: btoa(unescape(encodeURIComponent(data))),
      branch: BRANCH
    };
    if (_cloudSha) payload.sha = _cloudSha;

    var xhr = new XMLHttpRequest();
    xhr.open('PUT', GITHUB_API, true);
    xhr.setRequestHeader('Authorization', 'token ' + GITHUB_TOKEN);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Accept', 'application/vnd.github.v3+json');

    return new Promise(function (resolve) {
      xhr.onload = function () {
        if (xhr.status === 200 || xhr.status === 201) {
          try {
            var resp = JSON.parse(xhr.responseText);
            _cloudSha = resp.content.sha;
            resolve(true);
          } catch (e) { resolve(false); }
        } else {
          // SHA 冲突，重新拉取再推送
          if (xhr.status === 409) {
            fetchCloudUsers().then(function () { return pushCloudUsers(getUsersLocal()); }).then(resolve);
          } else {
            resolve(false);
          }
        }
      };
      xhr.onerror = function () { resolve(false); };
      xhr.timeout = 15000;
      xhr.ontimeout = function () { resolve(false); };
      xhr.send(JSON.stringify(payload));
    });
  }

  /** 初始化时从云端同步用户数据 */
  function syncFromCloud() {
    fetchCloudUsers().then(function (users) {
      if (users) {
        console.log('[Auth] 已从云端同步 ' + users.length + ' 个用户');
      } else {
        console.log('[Auth] 云端同步失败或无数据，使用本地数据');
        // 如果云端没有数据，推送本地数据上去
        if (GITHUB_TOKEN) {
          pushCloudUsers(getUsersLocal()).then(function (ok) {
            if (ok) console.log('[Auth] 已将本地用户数据推送到云端');
          });
        }
      }
    });
  }

  /* ═══════════════════════════════════════════
     会话管理（sessionStorage）
     ═══════════════════════════════════════════ */

  function createSession(user) {
    var session = { username: user.username, role: user.role, realName: user.realName, loginAt: Date.now() };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }

  function getSession() {
    try {
      var raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (Date.now() - s.loginAt > INACTIVITY_TIMEOUT) { sessionStorage.removeItem(SESSION_KEY); return null; }
      return s;
    } catch (e) { return null; }
  }

  function destroySession() { sessionStorage.removeItem(SESSION_KEY); }

  /* ═══════════════════════════════════════════
     登录频率限制
     ═══════════════════════════════════════════ */

  function getFailedAttempts() { return parseInt(sessionStorage.getItem(ATTEMPTS_KEY) || '0', 10); }
  function getLockoutRemaining() { var v = sessionStorage.getItem(LOCKOUT_KEY); if (!v) return 0; var r = Math.ceil((parseInt(v, 10) - Date.now()) / 1000); return r > 0 ? r : 0; }
  function resetRateLimit() { sessionStorage.setItem(ATTEMPTS_KEY, '0'); sessionStorage.removeItem(LOCKOUT_KEY); }
  function recordFailedAttempt() { var a = getFailedAttempts() + 1; sessionStorage.setItem(ATTEMPTS_KEY, String(a)); if (a >= MAX_FAILED_ATTEMPTS) sessionStorage.setItem(LOCKOUT_KEY, String(Date.now() + LOCKOUT_DURATION)); }

  /* ═══════════════════════════════════════════
     无操作自动注销
     ═══════════════════════════════════════════ */

  var inactivityTimer = null;
  function resetInactivityTimer() { if (inactivityTimer) clearTimeout(inactivityTimer); inactivityTimer = setTimeout(function () { doLogout('由于长时间未操作，会话已过期，请重新登录。'); }, INACTIVITY_TIMEOUT); }
  function bindActivityListeners() { ['mousedown','mousemove','keydown','scroll','touchstart','click'].forEach(function (evt) { document.addEventListener(evt, resetInactivityTimer, { passive: true }); }); }

  /* ═══════════════════════════════════════════
     UI 辅助
     ═══════════════════════════════════════════ */

  function showLoginError(msg) { var el = document.getElementById('auth-login-error'); if (el) { el.textContent = msg; el.style.display = msg ? 'block' : 'none'; } }
  function showLoginOverlay() { var o = document.getElementById('auth-login-overlay'); if (o) o.style.display = 'flex'; var m = document.getElementById('app-main'); if (m) m.style.display = 'none'; var h = document.getElementById('auth-user-bar'); if (h) h.style.display = 'none'; }
  function hideLoginOverlay() { var o = document.getElementById('auth-login-overlay'); if (o) o.style.display = 'none'; var m = document.getElementById('app-main'); if (m) m.style.display = ''; var h = document.getElementById('auth-user-bar'); if (h) h.style.display = ''; }

  function updateHeaderUI(session) {
    var ui = document.getElementById('auth-user-info');
    if (ui) ui.textContent = (session.realName || session.username) + '（' + (session.role === 'admin' ? '管理员' : '用户') + '）';
    var ab = document.getElementById('auth-admin-btn');
    if (ab) ab.style.display = session.role === 'admin' ? '' : 'none';
  }

  function showInlineMessage(text) {
    var msg = document.createElement('div');
    msg.textContent = text;
    msg.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:20000;background:#4a6741;color:#fff;padding:10px 24px;border-radius:6px;font-size:0.95rem;box-shadow:0 2px 12px rgba(0,0,0,0.15);transition:opacity 0.3s;';
    document.body.appendChild(msg);
    setTimeout(function () { msg.style.opacity = '0'; }, 1800);
    setTimeout(function () { msg.remove(); }, 2200);
  }

  function escapeHtml(str) { var d = document.createElement('div'); d.appendChild(document.createTextNode(str)); return d.innerHTML; }

  function showSyncStatus(text) {
    var el = document.getElementById('auth-sync-status');
    if (el) { el.textContent = text; el.style.display = text ? 'block' : 'none'; }
  }

  /* ═══════════════════════════════════════════
     核心业务逻辑
     ═══════════════════════════════════════════ */

  function doLogin(username, password) {
    var lockRemaining = getLockoutRemaining();
    if (lockRemaining > 0) return { success: false, message: '登录失败次数过多，请 ' + lockRemaining + ' 秒后重试' };
    if (!username || !password) return { success: false, message: '请输入用户名和密码' };

    var users = getUsersLocal();
    var user = null;
    for (var i = 0; i < users.length; i++) { if (users[i].username === username) { user = users[i]; break; } }
    if (!user) { recordFailedAttempt(); return { success: false, message: '用户名或密码错误' }; }

    var inputHash = sha256(password);
    if (inputHash !== user.passwordHash) { recordFailedAttempt(); return { success: false, message: '用户名或密码错误' }; }

    resetRateLimit();

    // 更新 lastLogin
    for (i = 0; i < users.length; i++) { if (users[i].username === username) { users[i].lastLogin = new Date().toISOString(); break; } }
    saveUsersLocal(users);

    return { success: true, session: createSession(user) };
  }

  function doLogout(reason) { destroySession(); if (inactivityTimer) clearTimeout(inactivityTimer); showLoginOverlay(); showLoginError(reason || ''); }

  function doChangePassword(oldPwd, newPwd) {
    var session = getSession(); if (!session) return '未登录'; if (newPwd.length < MIN_PASSWORD_LENGTH) return '密码长度不能少于 ' + MIN_PASSWORD_LENGTH + ' 位';
    var users = getUsersLocal();
    var idx = -1; for (var i = 0; i < users.length; i++) { if (users[i].username === session.username) { idx = i; break; } }
    if (idx === -1) return '用户不存在';
    if (sha256(oldPwd) !== users[idx].passwordHash) return '当前密码不正确';
    users[idx].passwordHash = sha256(newPwd); saveUsersLocal(users);
    pushCloudUsers(users); // 同步到云端
    return true;
  }

  function doAddUser(data) {
    var session = getSession(); if (!session || session.role !== 'admin') return '权限不足';
    var username = (data.username || '').trim(); var realName = (data.realName || '').trim();
    var password = (data.password || '').trim(); var role = data.role === 'admin' ? 'admin' : 'user';
    if (!username || !realName || !password) return '请填写所有字段';
    if (password.length < MIN_PASSWORD_LENGTH) return '密码长度不能少于 ' + MIN_PASSWORD_LENGTH + ' 位';
    if (findUserLocal(username)) return '用户名 "' + username + '" 已存在';

    var users = getUsersLocal();
    users.push({ username: username, passwordHash: sha256(password), role: role, realName: realName, createdAt: new Date().toISOString(), lastLogin: null });
    saveUsersLocal(users);
    pushCloudUsers(users); // 同步到云端
    return true;
  }

  function doDeleteUser(username) {
    var session = getSession(); if (!session || session.role !== 'admin') return '权限不足';
    if (username === 'admin') return '不能删除管理员账户';
    if (username === session.username) return '不能删除当前登录的用户';
    var users = getUsersLocal();
    var idx = -1; for (var i = 0; i < users.length; i++) { if (users[i].username === username) { idx = i; break; } }
    if (idx === -1) return '用户不存在';
    users.splice(idx, 1); saveUsersLocal(users);
    pushCloudUsers(users); // 同步到云端
    return true;
  }

  function doResetPassword(username, newPwd) {
    var session = getSession(); if (!session || session.role !== 'admin') return '权限不足';
    if (newPwd.length < MIN_PASSWORD_LENGTH) return '密码长度不能少于 ' + MIN_PASSWORD_LENGTH + ' 位';
    var users = getUsersLocal();
    var idx = -1; for (var i = 0; i < users.length; i++) { if (users[i].username === username) { idx = i; break; } }
    if (idx === -1) return '用户不存在';
    users[idx].passwordHash = sha256(newPwd); saveUsersLocal(users);
    pushCloudUsers(users); // 同步到云端
    return true;
  }

  function doGetAllUsers() {
    var session = getSession(); if (!session || session.role !== 'admin') return null;
    return getUsersLocal().map(function (u) { return { username: u.username, role: u.role, realName: u.realName, createdAt: u.createdAt, lastLogin: u.lastLogin }; });
  }

  /* ═══════════════════════════════════════════
     登录处理（先同步云端再验证）
     ═══════════════════════════════════════════ */

  var isLoginSubmitting = false;
  var _isSyncing = false;

  function handleLogin() {
    if (isLoginSubmitting || _isSyncing) return;
    isLoginSubmitting = true;

    var usernameEl = document.getElementById('auth-username');
    var passwordEl = document.getElementById('auth-password');
    if (!usernameEl || !passwordEl) { isLoginSubmitting = false; return; }
    var username = usernameEl.value.trim();
    var password = passwordEl.value;

    // 先尝试从云端同步，再登录
    _isSyncing = true;
    showSyncStatus('正在验证，请稍候...');

    fetchCloudUsers().then(function () {
      _isSyncing = false;
      showSyncStatus('');

      var result = doLogin(username, password);
      if (result.success) {
        showLoginError('');
        usernameEl.value = ''; passwordEl.value = '';
        hideLoginOverlay(); updateHeaderUI(result.session); resetInactivityTimer();
      } else {
        showLoginError(result.message);
      }
      isLoginSubmitting = false;
    }).catch(function () {
      _isSyncing = false;
      showSyncStatus('');
      // 即使同步失败，也用本地数据登录
      var result = doLogin(username, password);
      if (result.success) {
        showLoginError('');
        usernameEl.value = ''; passwordEl.value = '';
        hideLoginOverlay(); updateHeaderUI(result.session); resetInactivityTimer();
      } else {
        showLoginError(result.message);
      }
      isLoginSubmitting = false;
    });
  }

  /* ═══════════════════════════════════════════
     修改密码弹窗
     ═══════════════════════════════════════════ */

  function showChangePasswordDialog() {
    if (document.getElementById('auth-change-pwd-dialog')) return;
    var dialog = document.createElement('div'); dialog.id = 'auth-change-pwd-dialog';
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
        '</div></div>';
    document.body.appendChild(dialog);
    var errEl = document.getElementById('auth-change-pwd-error');
    dialog.querySelector('#auth-cp-cancel').addEventListener('click', function () { dialog.remove(); });
    dialog.querySelector('#auth-cp-ok').addEventListener('click', function () {
      var o = document.getElementById('auth-cp-old').value.trim();
      var n = document.getElementById('auth-cp-new').value.trim();
      var c = document.getElementById('auth-cp-confirm').value.trim();
      if (!o||!n||!c) { errEl.textContent = '请填写所有字段'; return; }
      if (n.length < MIN_PASSWORD_LENGTH) { errEl.textContent = '新密码长度不能少于 ' + MIN_PASSWORD_LENGTH + ' 位'; return; }
      if (n !== c) { errEl.textContent = '两次输入的新密码不一致'; return; }
      var result = doChangePassword(o, n);
      if (result === true) { dialog.remove(); showInlineMessage('密码修改成功'); }
      else { errEl.textContent = result; }
    });
  }

  /* ═══════════════════════════════════════════
     管理员面板
     ═══════════════════════════════════════════ */

  function renderAdminPanel() {
    var container = document.getElementById('admin-users-list'); if (!container) return;
    var users = getUsersLocal();
    if (users.length === 0) { container.innerHTML = '<p style="color:#888;">暂无用户数据</p>'; return; }
    var currentSession = getSession();
    var html = '<table style="width:100%;border-collapse:collapse;font-size:0.9rem;">';
    html += '<thead><tr style="border-bottom:2px solid #4a6741;color:#4a6741;">' +
      '<th style="text-align:left;padding:8px 4px;">用户名</th><th style="text-align:left;padding:8px 4px;">姓名</th>' +
      '<th style="text-align:left;padding:8px 4px;">角色</th><th style="text-align:left;padding:8px 4px;">上次登录</th>' +
      '<th style="text-align:right;padding:8px 4px;">操作</th></tr></thead><tbody>';
    users.forEach(function (u) {
      var isSelf = currentSession && currentSession.username === u.username;
      var ll = u.lastLogin ? new Date(u.lastLogin).toLocaleString('zh-CN') : '从未登录';
      html += '<tr style="border-bottom:1px solid #eee;"><td style="padding:8px 4px;">' + escapeHtml(u.username) + '</td>' +
        '<td style="padding:8px 4px;">' + escapeHtml(u.realName || '-') + '</td>' +
        '<td style="padding:8px 4px;">' + (u.role === 'admin' ? '管理员' : '普通用户') + '</td>' +
        '<td style="padding:8px 4px;color:#888;font-size:0.8rem;">' + ll + '</td><td style="padding:8px 4px;text-align:right;">';
      if (!isSelf) html += '<button class="admin-reset-pwd-btn" data-username="' + escapeHtml(u.username) + '" style="margin-left:4px;padding:3px 8px;font-size:0.8rem;border:1px solid #e67e22;color:#e67e22;background:#fff;border-radius:3px;cursor:pointer;">重置密码</button>';
      if (u.username !== 'admin' && !isSelf) html += '<button class="admin-delete-user-btn" data-username="' + escapeHtml(u.username) + '" style="margin-left:4px;padding:3px 8px;font-size:0.8rem;border:1px solid #c0392b;color:#c0392b;background:#fff;border-radius:3px;cursor:pointer;">删除</button>';
      html += '</td></tr>';
    });
    html += '</tbody></table>';
    container.innerHTML = html;
    container.querySelectorAll('.admin-reset-pwd-btn').forEach(function (btn) { btn.addEventListener('click', function () { showResetPasswordDialog(this.getAttribute('data-username')); }); });
    container.querySelectorAll('.admin-delete-user-btn').forEach(function (btn) { btn.addEventListener('click', function () { showDeleteConfirmDialog(this.getAttribute('data-username')); }); });
  }

  function showAdminPanel() { var o = document.getElementById('admin-panel-overlay'); if (o) { o.style.display = 'flex'; renderAdminPanel(); } }
  function hideAdminPanel() { var o = document.getElementById('admin-panel-overlay'); if (o) o.style.display = 'none'; }

  function handleAddUser(e) {
    e.preventDefault();
    var result = doAddUser({
      username: (document.getElementById('admin-new-username') || {}).value || '',
      realName: (document.getElementById('admin-new-realname') || {}).value || '',
      password: (document.getElementById('admin-new-password') || {}).value || '',
      role: (document.getElementById('admin-new-role') || {}).value || 'user'
    });
    if (result === true) {
      var els = ['admin-new-username','admin-new-realname','admin-new-password'];
      els.forEach(function(id) { var el = document.getElementById(id); if (el) el.value = ''; });
      var r = document.getElementById('admin-new-role'); if (r) r.value = 'user';
      var err = document.getElementById('admin-add-error'); if (err) err.textContent = '';
      renderAdminPanel(); showInlineMessage('用户添加成功（已同步到云端）');
    } else {
      var err = document.getElementById('admin-add-error'); if (err) err.textContent = result;
    }
  }

  function showResetPasswordDialog(username) {
    var dialog = document.createElement('div');
    dialog.style.cssText = 'position:fixed;inset:0;z-index:10001;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);';
    var user = findUserLocal(username);
    dialog.innerHTML = '<div style="background:#fff;padding:2rem;border-radius:8px;width:360px;max-width:90vw;">' +
      '<h3 style="margin:0 0 1rem;font-size:1.1rem;">重置密码 — ' + escapeHtml(user ? (user.realName||user.username) : username) + '</h3>' +
      '<div id="auth-reset-pwd-error" style="color:#c0392b;font-size:0.85rem;margin-bottom:0.5rem;min-height:1.2em;"></div>' +
      '<label style="display:block;margin-bottom:1rem;font-size:0.9rem;">新密码（至少 6 位）<input type="password" id="auth-rp-new" style="display:block;width:100%;margin-top:4px;padding:6px 8px;box-sizing:border-box;border:1px solid #ccc;border-radius:4px;"></label>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
        '<button id="auth-rp-cancel" style="padding:6px 16px;border:1px solid #ccc;border-radius:4px;background:#fff;cursor:pointer;">取消</button>' +
        '<button id="auth-rp-ok" style="padding:6px 16px;border:none;border-radius:4px;background:#e67e22;color:#fff;cursor:pointer;">确认重置</button>' +
      '</div></div>';
    document.body.appendChild(dialog);
    var errEl = document.getElementById('auth-reset-pwd-error');
    dialog.querySelector('#auth-rp-cancel').addEventListener('click', function () { dialog.remove(); });
    dialog.querySelector('#auth-rp-ok').addEventListener('click', function () {
      var n = document.getElementById('auth-rp-new').value.trim();
      if (n.length < MIN_PASSWORD_LENGTH) { errEl.textContent = '密码长度不能少于 ' + MIN_PASSWORD_LENGTH + ' 位'; return; }
      var result = doResetPassword(username, n);
      if (result === true) { dialog.remove(); showInlineMessage('已重置 "' + username + '" 的密码（已同步）'); }
      else { errEl.textContent = result || '操作失败'; }
    });
  }

  function showDeleteConfirmDialog(username) {
    var dialog = document.createElement('div');
    dialog.style.cssText = 'position:fixed;inset:0;z-index:10001;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);';
    var user = findUserLocal(username);
    dialog.innerHTML = '<div style="background:#fff;padding:2rem;border-radius:8px;width:340px;max-width:90vw;text-align:center;">' +
      '<p style="font-size:1rem;margin:0 0 1.5rem;">确定要删除用户 <strong>' + escapeHtml(user?(user.realName||user.username):username) + '</strong> 吗？<br><span style="color:#888;font-size:0.85rem;">此操作不可撤销</span></p>' +
      '<div style="display:flex;gap:8px;justify-content:center;">' +
        '<button id="auth-del-cancel" style="padding:6px 20px;border:1px solid #ccc;border-radius:4px;background:#fff;cursor:pointer;">取消</button>' +
        '<button id="auth-del-ok" style="padding:6px 20px;border:none;border-radius:4px;background:#c0392b;color:#fff;cursor:pointer;">确认删除</button>' +
      '</div></div>';
    document.body.appendChild(dialog);
    dialog.querySelector('#auth-del-cancel').addEventListener('click', function () { dialog.remove(); });
    dialog.querySelector('#auth-del-ok').addEventListener('click', function () {
      var result = doDeleteUser(username); dialog.remove();
      if (result === true) { renderAdminPanel(); showInlineMessage('已删除用户 "' + username + '"（已同步）'); }
      else { showInlineMessage(result || '删除失败'); }
    });
  }

  /* ═══════════════════════════════════════════
     事件绑定
     ═══════════════════════════════════════════ */

  function bindEvents() {
    var loginForm = document.getElementById('auth-login-form');
    if (loginForm) loginForm.addEventListener('submit', function (e) { e.preventDefault(); e.stopPropagation(); handleLogin(); });

    var logoutBtn = document.getElementById('auth-logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', function () { doLogout(); });

    var changePwdBtn = document.getElementById('auth-change-pwd-btn');
    if (changePwdBtn) changePwdBtn.addEventListener('click', showChangePasswordDialog);

    var adminBtn = document.getElementById('auth-admin-btn');
    if (adminBtn) adminBtn.addEventListener('click', showAdminPanel);

    var adminClose = document.getElementById('admin-panel-close');
    if (adminClose) adminClose.addEventListener('click', hideAdminPanel);

    var addForm = document.getElementById('admin-add-form');
    if (addForm) addForm.addEventListener('submit', handleAddUser);
  }

  /* ═══════════════════════════════════════════
     初始化
     ═══════════════════════════════════════════ */

  function init() {
    ensureDefaultAdmin();

    // 清除旧锁定
    sessionStorage.removeItem(ATTEMPTS_KEY);
    sessionStorage.removeItem(LOCKOUT_KEY);

    // 设置 GitHub Token（用于管理员同步操作）
    // Token 通过 data-config.js 加载
    if (typeof window.SONGDYE_CONFIG !== 'undefined' && window.SONGDYE_CONFIG.githubToken) {
      GITHUB_TOKEN = window.SONGDYE_CONFIG.githubToken;
    }

    // 从云端同步用户数据
    syncFromCloud();

    // 检查会话
    var session = getSession();
    if (session) { hideLoginOverlay(); updateHeaderUI(session); resetInactivityTimer(); }
    else { showLoginOverlay(); }

    bindEvents();
    bindActivityListeners();
  }

  /* ═══════════════════════════════════════════
     公共接口
     ═══════════════════════════════════════════ */

  window.AuthSystem = {
    init: init,
    login: function (u, p) { return doLogin(u, p); },
    logout: function () { doLogout(); },
    changePassword: function (o, n) { return doChangePassword(o, n); },
    isAdmin: function () { var s = getSession(); return s && s.role === 'admin'; },
    getCurrentUser: function () { var s = getSession(); return s ? { username: s.username, role: s.role, realName: s.realName } : null; },
    addUser: function (d) { return doAddUser(d); },
    deleteUser: function (u) { return doDeleteUser(u); },
    resetPassword: function (u, p) { return doResetPassword(u, p); },
    getAllUsers: function () { return doGetAllUsers(); }
  };

  // 自动初始化
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); }
  else { init(); }

})();
