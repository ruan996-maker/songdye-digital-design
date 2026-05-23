/**
 * 宋染 · 非遗数字设计系统 — 身份认证模块 v3 (Supabase)
 * ============================================================
 * Supabase BaaS 认证方案：
 * - 用户数据存储在 Supabase PostgreSQL 数据库
 * - 前端通过 Supabase JS SDK 直接操作数据库
 * - 所有设备实时同步，无需手动导出/上传
 * - 保留 SHA-256 密码哈希（纯 JS 实现），兼容旧数据
 *
 * 公共接口挂载于 window.AuthSystem（与 v2 完全兼容）
 *
 * 使用前请将下方 SUPABASE_URL 和 SUPABASE_ANON_KEY 替换为实际值
 */

;(function () {
  'use strict';

  /* ═══════════════════════════════════════════
     配置
     ═══════════════════════════════════════════ */

  var SUPABASE_URL = 'https://zrdghzoqzoucguntomcl.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_XekzKKriauePN_sb4OwvKg_STXhypDn';

  var SESSION_KEY = 'songdye_session';
  var ATTEMPTS_KEY = 'songdye_login_attempts';
  var LOCKOUT_KEY = 'songdye_lockout_until';
  var INACTIVITY_TIMEOUT = 30 * 60 * 1000;
  var MAX_FAILED_ATTEMPTS = 5;
  var LOCKOUT_DURATION = 60 * 1000;
  var MIN_PASSWORD_LENGTH = 6;

  // Supabase 客户端（延迟初始化）
  var _sb = null;

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
     Supabase 客户端初始化
     ═══════════════════════════════════════════ */

  function isSupabaseConfigured() {
    return SUPABASE_URL.indexOf('YOUR_PROJECT') === -1 && SUPABASE_ANON_KEY.indexOf('YOUR_ANON_KEY') === -1;
  }

  function getSupabase() {
    if (_sb) return _sb;
    if (!isSupabaseConfigured()) {
      console.warn('[Auth] Supabase 未配置，回退到本地模式');
      return null;
    }
    try {
      if (typeof supabase !== 'undefined' && supabase.createClient) {
        _sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('[Auth] Supabase 客户端已连接');
        return _sb;
      }
    } catch (e) {
      console.error('[Auth] Supabase 初始化失败:', e);
    }
    return null;
  }

  /* ═══════════════════════════════════════════
     数据层：Supabase + localStorage 双模式
     ═══════════════════════════════════════════ */

  // --- 本地模式（后备） ---
  var STORAGE_KEY = 'songdye_users';
  var DEFAULT_ADMIN = { username: 'admin', password: '123456', role: 'admin', realName: '系统管理员' };

  function getUsersLocal() {
    try { var raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : []; }
    catch (e) { return []; }
  }
  function saveUsersLocal(users) { localStorage.setItem(STORAGE_KEY, JSON.stringify(users)); }
  function findUserLocal(username) { return getUsersLocal().find(function (u) { return u.username === username; }) || null; }
  function ensureDefaultAdmin() {
    var users = getUsersLocal();
    if (!users.some(function (u) { return u.username === 'admin'; })) {
      users.unshift({ username: DEFAULT_ADMIN.username, passwordHash: sha256(DEFAULT_ADMIN.password), role: DEFAULT_ADMIN.role, realName: DEFAULT_ADMIN.realName, securityQuestion: '您的真实姓名是什么？', securityAnswerHash: sha256('系统管理员'), createdAt: new Date().toISOString(), lastLogin: null });
      saveUsersLocal(users);
    }
  }

  // --- Supabase 模式 ---
  function sbFetchUser(username) {
    var sb = getSupabase();
    if (!sb) return Promise.resolve(null);
    return sb.from('users').select('*').eq('username', username).single().then(function (res) {
      if (res.error) return null;
      return {
        username: res.data.username,
        passwordHash: res.data.password_hash,
        role: res.data.role,
        realName: res.data.real_name,
        importEnabled: !!res.data.import_enabled,
        securityQuestion: res.data.security_question || '',
        securityAnswerHash: res.data.security_answer_hash || '',
        createdAt: res.data.created_at,
        lastLogin: res.data.last_login
      };
    });
  }

  function sbUpdateLastLogin(username) {
    var sb = getSupabase();
    if (!sb) return Promise.resolve();
    return sb.from('users').update({ last_login: new Date().toISOString() }).eq('username', username).then(function (res) {
      if (res.error) console.error('[Auth] 更新登录时间失败:', res.error);
    });
  }

  function sbUpdatePassword(username, newHash) {
    var sb = getSupabase();
    if (!sb) return Promise.resolve(false);
    return sb.from('users').update({ password_hash: newHash }).eq('username', username).then(function (res) {
      return !res.error;
    });
  }

  function sbUpdateSecurityQA(username, question, answerHash) {
    var sb = getSupabase();
    if (!sb) return Promise.resolve(false);
    return sb.from('users').update({ security_question: question, security_answer_hash: answerHash }).eq('username', username).then(function (res) {
      return !res.error;
    });
  }

  function sbInsertUser(data) {
    var sb = getSupabase();
    if (!sb) return Promise.resolve({ ok: false, error: 'Supabase 未连接' });
    return sb.from('users').insert({
      username: data.username,
      password_hash: data.passwordHash,
      role: data.role,
      real_name: data.realName
    }).then(function (res) {
      if (res.error) return { ok: false, error: res.error.message };
      return { ok: true };
    });
  }

  function sbDeleteUser(username) {
    var sb = getSupabase();
    if (!sb) return Promise.resolve(false);
    return sb.from('users').delete().eq('username', username).then(function (res) {
      return !res.error;
    });
  }

  function sbFetchAllUsers() {
    var sb = getSupabase();
    if (!sb) return Promise.resolve([]);
    return sb.from('users').select('*').order('created_at', { ascending: true }).then(function (res) {
      if (res.error) return [];
      return res.data.map(function (r) {
        return { username: r.username, role: r.role, realName: r.real_name, importEnabled: !!r.import_enabled, createdAt: r.created_at, lastLogin: r.last_login };
      });
    });
  }

  /* ═══════════════════════════════════════════
     会话管理（sessionStorage）
     ═══════════════════════════════════════════ */

  function createSession(user) {
    var session = { username: user.username, role: user.role, realName: user.realName, importEnabled: !!user.importEnabled, loginAt: Date.now() };
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
     核心业务逻辑（Supabase 优先，本地后备）
     ═══════════════════════════════════════════ */

  function doLoginSync(username, password) {
    var lockRemaining = getLockoutRemaining();
    if (lockRemaining > 0) return Promise.resolve({ success: false, message: '登录失败次数过多，请 ' + lockRemaining + ' 秒后重试' });
    if (!username || !password) return Promise.resolve({ success: false, message: '请输入用户名和密码' });

    var inputHash = sha256(password);
    var sb = getSupabase();

    if (sb) {
      // Supabase 模式
      return sbFetchUser(username).then(function (user) {
        if (!user) { recordFailedAttempt(); return { success: false, message: '用户名或密码错误' }; }
        if (inputHash !== user.passwordHash) { recordFailedAttempt(); return { success: false, message: '用户名或密码错误' }; }
        resetRateLimit();
        sbUpdateLastLogin(username);
        return { success: true, session: createSession(user) };
      });
    } else {
      // 本地模式（后备）
      var users = getUsersLocal();
      var user = null;
      for (var i = 0; i < users.length; i++) { if (users[i].username === username) { user = users[i]; break; } }
      if (!user) { recordFailedAttempt(); return Promise.resolve({ success: false, message: '用户名或密码错误' }); }
      if (inputHash !== user.passwordHash) { recordFailedAttempt(); return Promise.resolve({ success: false, message: '用户名或密码错误' }); }
      resetRateLimit();
      for (i = 0; i < users.length; i++) { if (users[i].username === username) { users[i].lastLogin = new Date().toISOString(); break; } }
      saveUsersLocal(users);
      return Promise.resolve({ success: true, session: createSession(user) });
    }
  }

  function doLogout(reason) { destroySession(); if (inactivityTimer) clearTimeout(inactivityTimer); showLoginOverlay(); showLoginError(reason || ''); }

  function doChangePassword(oldPwd, newPwd) {
    var session = getSession(); if (!session) return Promise.resolve('未登录');
    if (newPwd.length < MIN_PASSWORD_LENGTH) return Promise.resolve('密码长度不能少于 ' + MIN_PASSWORD_LENGTH + ' 位');

    var oldHash = sha256(oldPwd);
    var newHash = sha256(newPwd);
    var sb = getSupabase();

    if (sb) {
      return sbFetchUser(session.username).then(function (user) {
        if (!user) return '用户不存在';
        if (oldHash !== user.passwordHash) return '当前密码不正确';
        return sbUpdatePassword(session.username, newHash).then(function (ok) {
          return ok ? true : '密码更新失败';
        });
      });
    } else {
      var users = getUsersLocal();
      var idx = -1; for (var i = 0; i < users.length; i++) { if (users[i].username === session.username) { idx = i; break; } }
      if (idx === -1) return Promise.resolve('用户不存在');
      if (oldHash !== users[idx].passwordHash) return Promise.resolve('当前密码不正确');
      users[idx].passwordHash = newHash; saveUsersLocal(users);
      return Promise.resolve(true);
    }
  }

  function doAddUser(data) {
    var session = getSession(); if (!session || session.role !== 'admin') return Promise.resolve('权限不足');
    var username = (data.username || '').trim();
    var realName = (data.realName || '').trim();
    var password = (data.password || '').trim();
    var role = data.role === 'admin' ? 'admin' : 'user';
    if (!username || !realName || !password) return Promise.resolve('请填写所有字段');
    if (password.length < MIN_PASSWORD_LENGTH) return Promise.resolve('密码长度不能少于 ' + MIN_PASSWORD_LENGTH + ' 位');

    var sb = getSupabase();
    if (sb) {
      return sbInsertUser({ username: username, passwordHash: sha256(password), role: role, realName: realName }).then(function (res) {
        if (!res.ok) {
          if (res.error.indexOf('duplicate') !== -1 || res.error.indexOf('unique') !== -1) return '用户名 "' + username + '" 已存在';
          return res.error;
        }
        return true;
      });
    } else {
      if (findUserLocal(username)) return Promise.resolve('用户名 "' + username + '" 已存在');
      var users = getUsersLocal();
      users.push({ username: username, passwordHash: sha256(password), role: role, realName: realName, createdAt: new Date().toISOString(), lastLogin: null });
      saveUsersLocal(users);
      return Promise.resolve(true);
    }
  }

  function doDeleteUser(username) {
    var session = getSession(); if (!session || session.role !== 'admin') return Promise.resolve('权限不足');
    if (username === 'admin') return Promise.resolve('不能删除管理员账户');
    if (username === session.username) return Promise.resolve('不能删除当前登录的用户');

    var sb = getSupabase();
    if (sb) {
      return sbDeleteUser(username).then(function (ok) {
        return ok ? true : '删除失败';
      });
    } else {
      var users = getUsersLocal();
      var idx = -1; for (var i = 0; i < users.length; i++) { if (users[i].username === username) { idx = i; break; } }
      if (idx === -1) return Promise.resolve('用户不存在');
      users.splice(idx, 1); saveUsersLocal(users);
      return Promise.resolve(true);
    }
  }

  function doResetPassword(username, newPwd) {
    var session = getSession(); if (!session || session.role !== 'admin') return Promise.resolve('权限不足');
    if (newPwd.length < MIN_PASSWORD_LENGTH) return Promise.resolve('密码长度不能少于 ' + MIN_PASSWORD_LENGTH + ' 位');
    var newHash = sha256(newPwd);
    var sb = getSupabase();
    if (sb) {
      return sbUpdatePassword(username, newHash).then(function (ok) {
        return ok ? true : '重置密码失败';
      });
    } else {
      var users = getUsersLocal();
      var idx = -1; for (var i = 0; i < users.length; i++) { if (users[i].username === username) { idx = i; break; } }
      if (idx === -1) return Promise.resolve('用户不存在');
      users[idx].passwordHash = newHash; saveUsersLocal(users);
      return Promise.resolve(true);
    }
  }

  /* ═══════════════════════════════════════════
     找回密码（安全问题验证）
     ═══════════════════════════════════════════ */

  var forgotState = { username: '', securityQuestion: '' };

  function doForgotStep1(username) {
    if (!username || !username.trim()) return Promise.resolve({ ok: false, error: '请输入账号' });
    username = username.trim();
    var sb = getSupabase();
    if (sb) {
      return sbFetchUser(username).then(function (user) {
        if (!user) return { ok: false, error: '该账号不存在' };
        if (!user.securityQuestion || !user.securityAnswerHash) return { ok: false, error: '该账号未设置安全问题，请联系管理员重置' };
        forgotState.username = username;
        forgotState.securityQuestion = user.securityQuestion;
        return { ok: true, question: user.securityQuestion };
      });
    } else {
      var users = getUsersLocal();
      var user = null;
      for (var i = 0; i < users.length; i++) { if (users[i].username === username) { user = users[i]; break; } }
      if (!user) return Promise.resolve({ ok: false, error: '该账号不存在' });
      if (!user.securityQuestion || !user.securityAnswerHash) return Promise.resolve({ ok: false, error: '该账号未设置安全问题，请联系管理员重置' });
      forgotState.username = username;
      forgotState.securityQuestion = user.securityQuestion;
      return Promise.resolve({ ok: true, question: user.securityQuestion });
    }
  }

  function doForgotStep2(answer, newPwd) {
    if (!answer || !answer.trim()) return Promise.resolve({ ok: false, error: '请输入安全问题的答案' });
    if (!newPwd || newPwd.length < MIN_PASSWORD_LENGTH) return Promise.resolve({ ok: false, error: '密码长度不能少于 ' + MIN_PASSWORD_LENGTH + ' 位' });
    var answerHash = sha256(answer.trim());
    var newHash = sha256(newPwd);
    var sb = getSupabase();
    if (sb) {
      return sbFetchUser(forgotState.username).then(function (user) {
        if (!user) return { ok: false, error: '用户不存在' };
        if (answerHash !== user.securityAnswerHash) return { ok: false, error: '安全问题答案不正确' };
        return sbUpdatePassword(user.username, newHash).then(function (ok) {
          if (ok) { forgotState.username = ''; forgotState.securityQuestion = ''; return { ok: true }; }
          return { ok: false, error: '密码重置失败，请稍后重试' };
        });
      });
    } else {
      var users = getUsersLocal();
      var idx = -1; for (var i = 0; i < users.length; i++) { if (users[i].username === forgotState.username) { idx = i; break; } }
      if (idx === -1) return Promise.resolve({ ok: false, error: '用户不存在' });
      if (answerHash !== users[idx].securityAnswerHash) return Promise.resolve({ ok: false, error: '安全问题答案不正确' });
      users[idx].passwordHash = newHash; saveUsersLocal(users);
      forgotState.username = ''; forgotState.securityQuestion = '';
      return Promise.resolve({ ok: true });
    }
  }

  function doUpdateSecurityQA(username, question, answer) {
    var session = getSession(); if (!session) return Promise.resolve('未登录');
    if (!question || !answer.trim()) return Promise.resolve('请填写安全问题和答案');
    var answerHash = sha256(answer.trim());
    var sb = getSupabase();
    if (sb) {
      return sbUpdateSecurityQA(username, question, answerHash).then(function (ok) {
        return ok ? true : '安全问题更新失败';
      });
    } else {
      var users = getUsersLocal();
      var idx = -1; for (var i = 0; i < users.length; i++) { if (users[i].username === username) { idx = i; break; } }
      if (idx === -1) return Promise.resolve('用户不存在');
      users[idx].securityQuestion = question;
      users[idx].securityAnswerHash = answerHash;
      saveUsersLocal(users);
      return Promise.resolve(true);
    }
  }

  function doGetAllUsers() {
    var session = getSession(); if (!session || session.role !== 'admin') return Promise.resolve(null);
    var sb = getSupabase();
    if (sb) {
      return sbFetchAllUsers();
    } else {
      return Promise.resolve(getUsersLocal().map(function (u) { return { username: u.username, role: u.role, realName: u.realName, importEnabled: !!u.importEnabled, createdAt: u.createdAt, lastLogin: u.lastLogin }; }));
    }
  }

  /* ═══════════════════════════════════════════
     素材导入权限管理
     ═══════════════════════════════════════════ */

  function doCheckImportPermission() {
    var session = getSession();
    if (!session) return false;
    if (session.role === 'admin') return true;
    return !!session.importEnabled;
  }

  function doToggleImportPermission(username, enabled) {
    var session = getSession(); if (!session || session.role !== 'admin') return Promise.resolve('权限不足');
    if (username === 'admin') return Promise.resolve('管理员默认拥有所有权限');
    var sb = getSupabase();
    if (sb) {
      return sb.from('users').update({ import_enabled: !!enabled }).eq('username', username).then(function (res) {
        return !res.error ? true : '更新失败';
      });
    } else {
      var users = getUsersLocal();
      var idx = -1; for (var i = 0; i < users.length; i++) { if (users[i].username === username) { idx = i; break; } }
      if (idx === -1) return Promise.resolve('用户不存在');
      users[idx].importEnabled = !!enabled;
      saveUsersLocal(users);
      return Promise.resolve(true);
    }
  }

  function doRefreshSessionPermission() {
    var session = getSession();
    if (!session || session.role === 'admin') return Promise.resolve();
    var sb = getSupabase();
    if (sb) {
      return sbFetchUser(session.username).then(function (user) {
        if (user) {
          session.importEnabled = user.importEnabled;
          sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
          updateImportUI();
        }
      });
    }
    return Promise.resolve();
  }

  function updateImportUI() {
    var allowed = doCheckImportPermission();
    var btnImport = document.getElementById('btn-import-img');
    if (btnImport) {
      btnImport.disabled = !allowed;
      btnImport.title = allowed ? '导入素材' : '您没有素材导入权限，请联系管理员';
      btnImport.style.opacity = allowed ? '1' : '0.5';
    }
  }

  /* ═══════════════════════════════════════════
     登录处理
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

    showSyncStatus('正在验证...');

    doLoginSync(username, password).then(function (result) {
      showSyncStatus('');
      if (result.success) {
        showLoginError('');
        usernameEl.value = ''; passwordEl.value = '';
        hideLoginOverlay(); updateHeaderUI(result.session); resetInactivityTimer();
      } else {
        showLoginError(result.message);
      }
      isLoginSubmitting = false;
    }).catch(function (err) {
      showSyncStatus('');
      showLoginError('网络错误，请检查连接后重试');
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
      errEl.textContent = '处理中...';
      doChangePassword(o, n).then(function (result) {
        if (result === true) { dialog.remove(); showInlineMessage('密码修改成功'); }
        else { errEl.textContent = result; }
      });
    });
  }

  /* ═══════════════════════════════════════════
     找回密码弹窗
     ═══════════════════════════════════════════ */

  function showForgotPasswordDialog() {
    var overlay = document.getElementById('forgot-pwd-overlay');
    if (!overlay) return;
    showStep(1);
    overlay.style.display = '';
  }

  function hideForgotPasswordDialog() {
    var overlay = document.getElementById('forgot-pwd-overlay');
    if (overlay) overlay.style.display = 'none';
    forgotState.username = '';
    forgotState.securityQuestion = '';
  }

  function showStep(n) {
    var steps = ['forgot-step1', 'forgot-step2', 'forgot-step3', 'forgot-success'];
    steps.forEach(function (id, i) {
      var el = document.getElementById(id);
      if (el) el.style.display = (i + 1 === n) ? '' : 'none';
    });
    // 清除错误
    ['forgot-step1-error', 'forgot-step2-error', 'forgot-step3-error'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) { el.textContent = ''; el.style.display = 'none'; }
    });
  }

  function bindForgotPasswordEvents() {
    // 忘记密码链接
    var forgotLink = document.getElementById('auth-forgot-link');
    if (forgotLink) forgotLink.addEventListener('click', function () { showForgotPasswordDialog(); });

    // 返回登录
    var backBtn = document.getElementById('forgot-back-btn');
    if (backBtn) backBtn.addEventListener('click', hideForgotPasswordDialog);

    // 步骤1：下一步
    var nextBtn = document.getElementById('forgot-next-btn');
    if (nextBtn) nextBtn.addEventListener('click', function () {
      var username = document.getElementById('forgot-username').value.trim();
      var errEl = document.getElementById('forgot-step1-error');
      if (!username) { errEl.textContent = '请输入账号'; errEl.style.display = ''; return; }
      nextBtn.textContent = '验证中...';
      nextBtn.disabled = true;
      doForgotStep1(username).then(function (result) {
        nextBtn.textContent = '下一步';
        nextBtn.disabled = false;
        if (result.ok) {
          document.getElementById('forgot-question-text').textContent = result.question;
          showStep(2);
        } else {
          errEl.textContent = result.error;
          errEl.style.display = '';
        }
      });
    });

    // 步骤1 回车
    var forgotUsername = document.getElementById('forgot-username');
    if (forgotUsername) forgotUsername.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); document.getElementById('forgot-next-btn').click(); }
    });

    // 步骤2：验证答案并进入重置
    var verifyBtn = document.getElementById('forgot-verify-btn');
    if (verifyBtn) verifyBtn.addEventListener('click', function () {
      var answer = document.getElementById('forgot-answer').value.trim();
      var newPwd = document.getElementById('forgot-new-pwd').value;
      var confirmPwd = document.getElementById('forgot-confirm-pwd').value;
      var errEl = document.getElementById('forgot-step2-error');
      if (!answer) { errEl.textContent = '请输入安全问题的答案'; errEl.style.display = ''; return; }
      if (!newPwd || newPwd.length < MIN_PASSWORD_LENGTH) { errEl.textContent = '新密码长度不能少于 ' + MIN_PASSWORD_LENGTH + ' 位'; errEl.style.display = ''; return; }
      if (newPwd !== confirmPwd) { errEl.textContent = '两次输入的新密码不一致'; errEl.style.display = ''; return; }
      verifyBtn.textContent = '验证中...';
      verifyBtn.disabled = true;
      doForgotStep2(answer, newPwd).then(function (result) {
        verifyBtn.textContent = '验 证';
        verifyBtn.disabled = false;
        if (result.ok) {
          showStep(4);
        } else {
          errEl.textContent = result.error;
          errEl.style.display = '';
        }
      });
    });

    // 步骤2/3 回车
    var forgotAnswer = document.getElementById('forgot-answer');
    if (forgotAnswer) forgotAnswer.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); showStep(3); }
    });

    // 步骤3：重置密码按钮
    var resetBtn = document.getElementById('forgot-reset-btn');
    if (resetBtn) resetBtn.addEventListener('click', function () {
      var newPwd = document.getElementById('forgot-new-pwd').value;
      var confirmPwd = document.getElementById('forgot-confirm-pwd').value;
      var errEl = document.getElementById('forgot-step3-error');
      var answer = document.getElementById('forgot-answer').value.trim();
      if (!newPwd || newPwd.length < MIN_PASSWORD_LENGTH) { errEl.textContent = '新密码长度不能少于 ' + MIN_PASSWORD_LENGTH + ' 位'; errEl.style.display = ''; return; }
      if (newPwd !== confirmPwd) { errEl.textContent = '两次输入的新密码不一致'; errEl.style.display = ''; return; }
      if (!answer) { errEl.textContent = '请先返回上一步回答安全问题'; errEl.style.display = ''; showStep(2); return; }
      resetBtn.textContent = '重置中...';
      resetBtn.disabled = true;
      doForgotStep2(answer, newPwd).then(function (result) {
        resetBtn.textContent = '重置密码';
        resetBtn.disabled = false;
        if (result.ok) { showStep(4); }
        else { errEl.textContent = result.error; errEl.style.display = ''; }
      });
    });

    // 成功：返回登录
    var goLoginBtn = document.getElementById('forgot-go-login');
    if (goLoginBtn) goLoginBtn.addEventListener('click', function () {
      hideForgotPasswordDialog();
    });
  }

  /* ═══════════════════════════════════════════
     管理员面板（异步渲染）
     ═══════════════════════════════════════════ */

  function renderAdminPanel() {
    var container = document.getElementById('admin-users-list'); if (!container) return;
    container.innerHTML = '<p style="color:#888;">加载中...</p>';
    var currentSession = getSession();

    doGetAllUsers().then(function (users) {
      if (!users || users.length === 0) { container.innerHTML = '<p style="color:#888;">暂无用户数据</p>'; return; }
      var html = '<table style="width:100%;border-collapse:collapse;font-size:0.9rem;">';
      html += '<thead><tr style="border-bottom:2px solid #4a6741;color:#4a6741;">' +
        '<th style="text-align:left;padding:8px 4px;">用户名</th><th style="text-align:left;padding:8px 4px;">姓名</th>' +
        '<th style="text-align:left;padding:8px 4px;">角色</th><th style="text-align:center;padding:8px 4px;">导入权限</th>' +
        '<th style="text-align:left;padding:8px 4px;">上次登录</th>' +
        '<th style="text-align:right;padding:8px 4px;">操作</th></tr></thead><tbody>';
      users.forEach(function (u) {
        var isSelf = currentSession && currentSession.username === u.username;
        var ll = u.lastLogin ? new Date(u.lastLogin).toLocaleString('zh-CN') : '从未登录';
        var isAdmin = u.role === 'admin';
        var hasImport = isAdmin || u.importEnabled;
        html += '<tr style="border-bottom:1px solid #eee;"><td style="padding:8px 4px;">' + escapeHtml(u.username) + '</td>' +
          '<td style="padding:8px 4px;">' + escapeHtml(u.realName || '-') + '</td>' +
          '<td style="padding:8px 4px;">' + (isAdmin ? '管理员' : '普通用户') + '</td>' +
          '<td style="padding:8px 4px;text-align:center;">';
        if (isAdmin) {
          html += '<span style="color:#4a6741;font-size:0.8rem;">默认拥有</span>';
        } else {
          html += '<button class="admin-import-toggle-btn" data-username="' + escapeHtml(u.username) + '" data-enabled="' + (hasImport ? '1' : '0') + '" style="padding:2px 10px;font-size:0.8rem;border-radius:12px;cursor:pointer;border:1px solid ' + (hasImport ? '#4a6741' : '#ccc') + ';color:' + (hasImport ? '#fff' : '#888') + ';background:' + (hasImport ? '#4a6741' : '#fff') + ';">' + (hasImport ? '已授权' : '未授权') + '</button>';
        }
        html += '</td><td style="padding:8px 4px;color:#888;font-size:0.8rem;">' + ll + '</td><td style="padding:8px 4px;text-align:right;">';
        if (!isSelf) html += '<button class="admin-reset-pwd-btn" data-username="' + escapeHtml(u.username) + '" style="margin-left:4px;padding:3px 8px;font-size:0.8rem;border:1px solid #e67e22;color:#e67e22;background:#fff;border-radius:3px;cursor:pointer;">重置密码</button>';
        if (u.username !== 'admin' && !isSelf) html += '<button class="admin-delete-user-btn" data-username="' + escapeHtml(u.username) + '" style="margin-left:4px;padding:3px 8px;font-size:0.8rem;border:1px solid #c0392b;color:#c0392b;background:#fff;border-radius:3px;cursor:pointer;">删除</button>';
        html += '</td></tr>';
      });
      html += '</tbody></table>';
      container.innerHTML = html;
      container.querySelectorAll('.admin-reset-pwd-btn').forEach(function (btn) { btn.addEventListener('click', function () { showResetPasswordDialog(this.getAttribute('data-username')); }); });
      container.querySelectorAll('.admin-delete-user-btn').forEach(function (btn) { btn.addEventListener('click', function () { showDeleteConfirmDialog(this.getAttribute('data-username')); }); });
      container.querySelectorAll('.admin-import-toggle-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var uname = this.getAttribute('data-username');
          var curEnabled = this.getAttribute('data-enabled') === '1';
          var newEnabled = !curEnabled;
          var self = this;
          doToggleImportPermission(uname, newEnabled).then(function (res) {
            if (res === true) {
              self.setAttribute('data-enabled', newEnabled ? '1' : '0');
              self.textContent = newEnabled ? '已授权' : '未授权';
              self.style.background = newEnabled ? '#4a6741' : '#fff';
              self.style.color = newEnabled ? '#fff' : '#888';
              self.style.borderColor = newEnabled ? '#4a6741' : '#ccc';
              showInlineMessage((newEnabled ? '已授权' : '已撤销') + ' "' + uname + '" 的素材导入权限');
            } else {
              showInlineMessage(res || '操作失败');
            }
          });
        });
      });
    });
  }

  function showAdminPanel() { var o = document.getElementById('admin-panel-overlay'); if (o) { o.style.display = 'flex'; renderAdminPanel(); } }
  function hideAdminPanel() { var o = document.getElementById('admin-panel-overlay'); if (o) o.style.display = 'none'; }

  function handleAddUser(e) {
    e.preventDefault();
    var btn = e.target.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;
    var err = document.getElementById('admin-add-error');
    if (err) err.textContent = '添加中...';

    doAddUser({
      username: (document.getElementById('admin-new-username') || {}).value || '',
      realName: (document.getElementById('admin-new-realname') || {}).value || '',
      password: (document.getElementById('admin-new-password') || {}).value || '',
      role: (document.getElementById('admin-new-role') || {}).value || 'user'
    }).then(function (result) {
      if (btn) btn.disabled = false;
      if (result === true) {
        var els = ['admin-new-username','admin-new-realname','admin-new-password'];
        els.forEach(function(id) { var el = document.getElementById(id); if (el) el.value = ''; });
        var r = document.getElementById('admin-new-role'); if (r) r.value = 'user';
        if (err) err.textContent = '';
        renderAdminPanel(); showInlineMessage('用户添加成功');
      } else {
        if (err) err.textContent = result;
      }
    });
  }

  function showResetPasswordDialog(username) {
    var dialog = document.createElement('div');
    dialog.style.cssText = 'position:fixed;inset:0;z-index:10001;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);';
    dialog.innerHTML = '<div style="background:#fff;padding:2rem;border-radius:8px;width:360px;max-width:90vw;">' +
      '<h3 style="margin:0 0 1rem;font-size:1.1rem;">重置密码 — ' + escapeHtml(username) + '</h3>' +
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
      errEl.textContent = '处理中...';
      doResetPassword(username, n).then(function (result) {
        if (result === true) { dialog.remove(); showInlineMessage('已重置 "' + username + '" 的密码'); }
        else { errEl.textContent = result || '操作失败'; }
      });
    });
  }

  function showDeleteConfirmDialog(username) {
    var dialog = document.createElement('div');
    dialog.style.cssText = 'position:fixed;inset:0;z-index:10001;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);';
    dialog.innerHTML = '<div style="background:#fff;padding:2rem;border-radius:8px;width:340px;max-width:90vw;text-align:center;">' +
      '<p style="font-size:1rem;margin:0 0 1.5rem;">确定要删除用户 <strong>' + escapeHtml(username) + '</strong> 吗？<br><span style="color:#888;font-size:0.85rem;">此操作不可撤销</span></p>' +
      '<div style="display:flex;gap:8px;justify-content:center;">' +
        '<button id="auth-del-cancel" style="padding:6px 20px;border:1px solid #ccc;border-radius:4px;background:#fff;cursor:pointer;">取消</button>' +
        '<button id="auth-del-ok" style="padding:6px 20px;border:none;border-radius:4px;background:#c0392b;color:#fff;cursor:pointer;">确认删除</button>' +
      '</div></div>';
    document.body.appendChild(dialog);
    dialog.querySelector('#auth-del-cancel').addEventListener('click', function () { dialog.remove(); });
    dialog.querySelector('#auth-del-ok').addEventListener('click', function () {
      dialog.remove();
      doDeleteUser(username).then(function (result) {
        if (result === true) { renderAdminPanel(); showInlineMessage('已删除用户 "' + username + '"'); }
        else { showInlineMessage(result || '删除失败'); }
      });
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

    bindForgotPasswordEvents();
  }

  /* ═══════════════════════════════════════════
     初始化
     ═══════════════════════════════════════════ */

  function init() {
    // 清除旧锁定
    sessionStorage.removeItem(ATTEMPTS_KEY);
    sessionStorage.removeItem(LOCKOUT_KEY);

    var sb = getSupabase();
    if (sb) {
      console.log('[Auth] v3 已连接 Supabase — 云端模式');
      showSyncStatus('已连接云端数据库');
      setTimeout(function () { showSyncStatus(''); }, 2000);
    } else {
      console.log('[Auth] v3 Supabase 未配置 — 本地模式');
      ensureDefaultAdmin();
    }

    // 检查会话
    var session = getSession();
    if (session) { hideLoginOverlay(); updateHeaderUI(session); resetInactivityTimer(); updateImportUI(); doRefreshSessionPermission(); }
    else { showLoginOverlay(); }

    bindEvents();
    bindActivityListeners();
  }

  /* ═══════════════════════════════════════════
     公共接口（与 v2 完全兼容）
     ═══════════════════════════════════════════ */

  window.AuthSystem = {
    init: init,
    login: function (u, p) { return doLoginSync(u, p); },
    logout: function () { doLogout(); },
    changePassword: function (o, n) { return doChangePassword(o, n); },
    isAdmin: function () { var s = getSession(); return s && s.role === 'admin'; },
    getCurrentUser: function () { var s = getSession(); return s ? { username: s.username, role: s.role, realName: s.realName, importEnabled: s.importEnabled } : null; },
    addUser: function (d) { return doAddUser(d); },
    deleteUser: function (u) { return doDeleteUser(u); },
    resetPassword: function (u, p) { return doResetPassword(u, p); },
    getAllUsers: function () { return doGetAllUsers(); },
    canImport: function () { return doCheckImportPermission(); },
    toggleImportPermission: function (u, e) { return doToggleImportPermission(u, e); },
    refreshPermission: function () { return doRefreshSessionPermission(); },
    updateSecurityQA: function (q, a) { var s = getSession(); return s ? doUpdateSecurityQA(s.username, q, a) : Promise.resolve('未登录'); }
  };

  // 自动初始化
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); }
  else { init(); }

})();
