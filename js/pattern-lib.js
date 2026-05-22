/**
 * 宋染非遗数字设计系统 — 纹样图库管理模块
 * 纯前端 Canvas 程序化绘制，无外部依赖
 */
(function () {
  'use strict';

  var PatternLib = {};

  // ── 常量 ──────────────────────────────────────────────
  var CARD_SIZE  = 300;
  var MODAL_SIZE = 480;
  var GEN_SIZE   = 400;

  // ── 公共数据 ──────────────────────────────────────────
  PatternLib.currentPattern = null;
  PatternLib.patternData    = [];

  // 内部状态
  var _currentFilter    = 'all';
  var _currentGenType   = 'symmetric';
  var _editingPatternId = null;
  var _rafId            = null;
  var _genParams        = {};
  var _idCounter        = 0;

  // ══════════════════════════════════════════════════════
  //  工具函数
  // ══════════════════════════════════════════════════════

  function getSupabase() {
    try {
      if (window.supabase && window.supabase.createClient) {
        return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      }
    } catch (e) {}
    return null;
  }

  // ── Supabase 配置 ──
  var SUPABASE_URL = 'https://zrdghzoqzoucguntomcl.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_XekzKKriauePN_sb4OwvKg_STXhypDn';

  /**
   * 保存素材到 Supabase
   */
  function saveMaterialToCloud(pat, dataUrl) {
    var sb = getSupabase();
    if (!sb) return Promise.resolve();
    var session = window.AuthSystem ? window.AuthSystem.getCurrentUser() : null;
    // 缩小图片到 800px 以内以节省存储
    return resizeDataUrl(dataUrl, 800).then(function (resizedUrl) {
      return sb.from('materials').insert({
        name: pat.name,
        category: 'imported',
        data_url: resizedUrl,
        primary_color: pat.primaryColor || '#2c5f7c',
        secondary_color: pat.secondaryColor || '#8b6914',
        uploaded_by: session ? session.username : null
      }).then(function (res) {
        if (res.error) console.warn('[PatternLib] 素材云端保存失败:', res.error.message);
        else console.log('[PatternLib] 素材已保存到云端');
      });
    }).catch(function (e) {
      console.warn('[PatternLib] 素材云端保存异常:', e);
    });
  }

  /**
   * 缩放 data URL 图片到 maxWidth
   */
  function resizeDataUrl(dataUrl, maxWidth) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        if (img.naturalWidth <= maxWidth) { resolve(dataUrl); return; }
        var ratio = maxWidth / img.naturalWidth;
        var h = Math.round(img.naturalHeight * ratio);
        var canvas = document.createElement('canvas');
        canvas.width = maxWidth;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, maxWidth, h);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = function () { resolve(dataUrl); };
      img.src = dataUrl;
    });
  }

  /**
   * 从 Supabase 加载已保存素材
   */
  function loadMaterialsFromCloud() {
    var sb = getSupabase();
    if (!sb) return Promise.resolve([]);
    return sb.from('materials').select('*').order('created_at', { ascending: false }).then(function (res) {
      if (res.error) { console.warn('[PatternLib] 加载云端素材失败:', res.error.message); return []; }
      return res.data || [];
    });
  }

  /**
   * 从 data URL 创建 Image 对象
   */
  function loadImageFromUrl(dataUrl) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('图片加载失败')); };
      img.src = dataUrl;
    });
  }

  function safeW(w) { return Math.max(1, w); }
  function safeH(h) { return Math.max(1, h); }
  function uid() { return 'pat-' + (++_idCounter); }

  function hexToRgba(hex, a) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  function darken(hex, factor) {
    var r = Math.round(parseInt(hex.slice(1, 3), 16) * factor);
    var g = Math.round(parseInt(hex.slice(3, 5), 16) * factor);
    var b = Math.round(parseInt(hex.slice(5, 7), 16) * factor);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function lighten(hex, factor) {
    var r = Math.min(255, Math.round(parseInt(hex.slice(1, 3), 16) + (255 - parseInt(hex.slice(1, 3), 16)) * factor));
    var g = Math.min(255, Math.round(parseInt(hex.slice(3, 5), 16) + (255 - parseInt(hex.slice(3, 5), 16)) * factor));
    var b = Math.min(255, Math.round(parseInt(hex.slice(5, 7), 16) + (255 - parseInt(hex.slice(5, 7), 16)) * factor));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  // ══════════════════════════════════════════════════════
  //  1. 缠枝牡丹纹（植物纹）
  // ══════════════════════════════════════════════════════

  function drawPeony(ctx, cx, cy, size, color, leafColor) {
    size = Math.max(4, size);
    // 花瓣 — 多层
    var layers = [
      { count: 8, r: size * 0.55, w: size * 0.28, h: size * 0.38, offset: 0 },
      { count: 8, r: size * 0.35, w: size * 0.22, h: size * 0.32, offset: Math.PI / 8 },
      { count: 6, r: size * 0.18, w: size * 0.15, h: size * 0.22, offset: Math.PI / 6 }
    ];
    layers.forEach(function (layer) {
      for (var i = 0; i < layer.count; i++) {
        var angle = (Math.PI * 2 / layer.count) * i + layer.offset;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.ellipse(layer.r, 0, Math.max(1, layer.h), Math.max(1, layer.w), 0, 0, Math.PI * 2);
        ctx.fillStyle = hexToRgba(color, 0.55);
        ctx.fill();
        ctx.strokeStyle = hexToRgba(darken(color, 0.6), 0.6);
        ctx.lineWidth = 0.8;
        ctx.stroke();
        ctx.restore();
      }
    });
    // 花心
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(1, size * 0.12), 0, Math.PI * 2);
    ctx.fillStyle = lighten(color, 0.5);
    ctx.fill();
    ctx.strokeStyle = darken(color, 0.5);
    ctx.lineWidth = 1;
    ctx.stroke();

    // 花蕊小点
    for (var j = 0; j < 8; j++) {
      var a2 = (Math.PI * 2 / 8) * j;
      var dx = Math.cos(a2) * size * 0.07;
      var dy = Math.sin(a2) * size * 0.07;
      ctx.beginPath();
      ctx.arc(cx + dx, cy + dy, Math.max(0.5, size * 0.025), 0, Math.PI * 2);
      ctx.fillStyle = darken(color, 0.4);
      ctx.fill();
    }
  }

  function drawLeaf(ctx, cx, cy, size, angle, color) {
    size = Math.max(3, size);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    // 叶片
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(size * 0.3, -size * 0.4, size * 0.8, -size * 0.35, size, 0);
    ctx.bezierCurveTo(size * 0.8, size * 0.35, size * 0.3, size * 0.4, 0, 0);
    ctx.fillStyle = hexToRgba(color, 0.65);
    ctx.fill();
    ctx.strokeStyle = hexToRgba(darken(color, 0.55), 0.7);
    ctx.lineWidth = 0.7;
    ctx.stroke();
    // 叶脉
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(size * 0.9, 0);
    ctx.strokeStyle = hexToRgba(darken(color, 0.4), 0.5);
    ctx.lineWidth = 0.5;
    ctx.stroke();
    for (var k = 1; k <= 3; k++) {
      var vx = size * k * 0.22;
      ctx.beginPath();
      ctx.moveTo(vx, 0);
      ctx.lineTo(vx + size * 0.1, -size * 0.15);
      ctx.moveTo(vx, 0);
      ctx.lineTo(vx + size * 0.1, size * 0.15);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawVine(ctx, x1, y1, x2, y2, color) {
    var mx = (x1 + x2) / 2;
    var my = (y1 + y2) / 2;
    var dist = Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));
    var off = dist * 0.35;
    var perpX = -(y2 - y1) / (dist || 1) * off;
    var perpY = (x2 - x1) / (dist || 1) * off;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.bezierCurveTo(mx + perpX, my + perpY, mx - perpX, my - perpY, x2, y2);
    ctx.strokeStyle = hexToRgba(color, 0.7);
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  PatternLib.drawInterlockingPeony = function (ctx, width, height, primaryColor, secondaryColor) {
    var w = safeW(width), h = safeH(height);
    ctx.clearRect(0, 0, w, h);

    // 淡底
    ctx.fillStyle = '#faf6ef';
    ctx.fillRect(0, 0, w, h);

    var cx = w / 2, cy = h / 2;
    var unit = Math.min(w, h) * 0.18;

    // 缠枝藤蔓 — S形曲线
    var vineColor = darken(primaryColor, 0.75);
    // 主藤蔓
    drawVine(ctx, w * 0.15, h * 0.5, w * 0.5, h * 0.25, vineColor);
    drawVine(ctx, w * 0.5, h * 0.25, w * 0.85, h * 0.5, vineColor);
    drawVine(ctx, w * 0.85, h * 0.5, w * 0.5, h * 0.75, vineColor);
    drawVine(ctx, w * 0.5, h * 0.75, w * 0.15, h * 0.5, vineColor);
    // 辅助卷须
    drawVine(ctx, w * 0.3, h * 0.35, w * 0.4, h * 0.18, vineColor);
    drawVine(ctx, w * 0.7, h * 0.35, w * 0.6, h * 0.18, vineColor);
    drawVine(ctx, w * 0.3, h * 0.65, w * 0.4, h * 0.82, vineColor);
    drawVine(ctx, w * 0.7, h * 0.65, w * 0.6, h * 0.82, vineColor);

    // 中心大牡丹
    drawPeony(ctx, cx, cy, unit * 1.5, primaryColor, secondaryColor);

    // 四角小花
    drawPeony(ctx, w * 0.2, h * 0.2, unit * 0.7, primaryColor, secondaryColor);
    drawPeony(ctx, w * 0.8, h * 0.2, unit * 0.7, primaryColor, secondaryColor);
    drawPeony(ctx, w * 0.8, h * 0.8, unit * 0.7, primaryColor, secondaryColor);
    drawPeony(ctx, w * 0.2, h * 0.8, unit * 0.7, primaryColor, secondaryColor);

    // 叶子
    drawLeaf(ctx, cx - unit * 1.2, cy - unit * 0.3, unit * 0.9, -0.5, secondaryColor);
    drawLeaf(ctx, cx + unit * 1.2, cy + unit * 0.3, unit * 0.9, Math.PI - 0.5, secondaryColor);
    drawLeaf(ctx, cx + unit * 0.3, cy - unit * 1.1, unit * 0.8, -0.8, secondaryColor);
    drawLeaf(ctx, cx - unit * 0.3, cy + unit * 1.1, unit * 0.8, Math.PI + 0.8, secondaryColor);
    drawLeaf(ctx, w * 0.35, h * 0.28, unit * 0.6, -0.3, secondaryColor);
    drawLeaf(ctx, w * 0.65, h * 0.28, unit * 0.6, Math.PI + 0.3, secondaryColor);
    drawLeaf(ctx, w * 0.65, h * 0.72, unit * 0.6, 0.3, secondaryColor);
    drawLeaf(ctx, w * 0.35, h * 0.72, unit * 0.6, Math.PI - 0.3, secondaryColor);
  };

  // ══════════════════════════════════════════════════════
  //  2. 云纹（自然纹）
  // ══════════════════════════════════════════════════════

  function drawRuyiCloud(ctx, cx, cy, size, color) {
    size = Math.max(4, size);
    var grad = ctx.createRadialGradient(cx, cy - size * 0.1, size * 0.1, cx, cy, size);
    grad.addColorStop(0, hexToRgba(color, 0.85));
    grad.addColorStop(0.6, hexToRgba(color, 0.55));
    grad.addColorStop(1, hexToRgba(color, 0.1));

    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath();
    // 如意云头：由多个圆弧组成
    ctx.moveTo(-size * 0.5, size * 0.1);
    // 底部云尾
    ctx.bezierCurveTo(-size * 0.4, size * 0.35, size * 0.1, size * 0.4, size * 0.5, size * 0.15);
    ctx.bezierCurveTo(size * 0.55, size * 0.05, size * 0.5, -size * 0.05, size * 0.4, -size * 0.1);
    // 右卷
    ctx.arc(size * 0.25, -size * 0.1, size * 0.2, 0, Math.PI * 1.3, true);
    // 顶部
    ctx.arc(0, -size * 0.25, size * 0.28, -Math.PI * 0.5, Math.PI * 0.4, false);
    // 左卷
    ctx.arc(-size * 0.28, -size * 0.1, size * 0.22, -Math.PI * 0.3, Math.PI * 0.7, true);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = hexToRgba(darken(color, 0.55), 0.5);
    ctx.lineWidth = 1;
    ctx.stroke();

    // 内部线条
    ctx.beginPath();
    ctx.arc(0, -size * 0.1, size * 0.15, 0, Math.PI * 2);
    ctx.strokeStyle = hexToRgba(lighten(color, 0.5), 0.35);
    ctx.lineWidth = 0.8;
    ctx.stroke();

    ctx.restore();
  }

  function drawSmallCloud(ctx, cx, cy, size, color) {
    size = Math.max(2, size);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath();
    ctx.arc(0, -size * 0.1, size * 0.25, 0, Math.PI * 2);
    ctx.arc(-size * 0.25, size * 0.05, size * 0.18, 0, Math.PI * 2);
    ctx.arc(size * 0.25, size * 0.05, size * 0.18, 0, Math.PI * 2);
    ctx.fillStyle = hexToRgba(color, 0.4);
    ctx.fill();
    ctx.restore();
  }

  PatternLib.drawCloudPattern = function (ctx, width, height, primaryColor, secondaryColor) {
    var w = safeW(width), h = safeH(height);
    ctx.clearRect(0, 0, w, h);

    // 宣纸底色
    ctx.fillStyle = '#f8f3ea';
    ctx.fillRect(0, 0, w, h);

    var unit = Math.min(w, h) * 0.14;

    // 大云
    drawRuyiCloud(ctx, w * 0.5, h * 0.4, unit * 1.6, primaryColor);
    drawRuyiCloud(ctx, w * 0.2, h * 0.65, unit * 1.1, primaryColor);
    drawRuyiCloud(ctx, w * 0.8, h * 0.65, unit * 1.1, primaryColor);
    drawRuyiCloud(ctx, w * 0.35, h * 0.18, unit * 0.85, secondaryColor);
    drawRuyiCloud(ctx, w * 0.68, h * 0.22, unit * 0.85, secondaryColor);

    // 小云点缀
    drawSmallCloud(ctx, w * 0.15, h * 0.3, unit * 0.6, secondaryColor);
    drawSmallCloud(ctx, w * 0.85, h * 0.3, unit * 0.6, secondaryColor);
    drawSmallCloud(ctx, w * 0.5, h * 0.82, unit * 0.7, primaryColor);
    drawSmallCloud(ctx, w * 0.3, h * 0.9, unit * 0.5, secondaryColor);
    drawSmallCloud(ctx, w * 0.7, h * 0.88, unit * 0.5, secondaryColor);

    // 装饰螺旋纹
    ctx.strokeStyle = hexToRgba(primaryColor, 0.25);
    ctx.lineWidth = 0.8;
    var spirals = [[w * 0.12, h * 0.15], [w * 0.88, h * 0.15], [w * 0.1, h * 0.85], [w * 0.9, h * 0.85]];
    spirals.forEach(function (s) {
      ctx.beginPath();
      for (var t = 0; t < Math.PI * 4; t += 0.1) {
        var sr = t * unit * 0.015;
        ctx.lineTo(s[0] + Math.cos(t) * sr, s[1] + Math.sin(t) * sr);
      }
      ctx.stroke();
    });
  };

  // ══════════════════════════════════════════════════════
  //  3. 龟背纹（几何纹）
  // ══════════════════════════════════════════════════════

  PatternLib.drawTortoiseShell = function (ctx, width, height, primaryColor, secondaryColor) {
    var w = safeW(width), h = safeH(height);
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = '#f5f0e6';
    ctx.fillRect(0, 0, w, h);

    var hexR = Math.min(w, h) * 0.075; // 六边形外接圆半径
    hexR = Math.max(5, hexR);
    var hexW = Math.sqrt(3) * hexR;
    var hexH = 2 * hexR;

    function hexagonVertices(cx, cy) {
      var verts = [];
      for (var i = 0; i < 6; i++) {
        var angle = Math.PI / 3 * i - Math.PI / 6;
        verts.push([cx + hexR * Math.cos(angle), cy + hexR * Math.sin(angle)]);
      }
      return verts;
    }

    function drawHexagon(cx, cy) {
      var v = hexagonVertices(cx, cy);
      ctx.beginPath();
      ctx.moveTo(v[0][0], v[0][1]);
      for (var i = 1; i < 6; i++) ctx.lineTo(v[i][0], v[i][1]);
      ctx.closePath();

      // 渐变填充
      var grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, hexR);
      grad.addColorStop(0, hexToRgba(primaryColor, 0.08));
      grad.addColorStop(1, hexToRgba(primaryColor, 0.22));
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.strokeStyle = hexToRgba(primaryColor, 0.65);
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // 内部简化纹饰 — 内六边形
      var innerR = hexR * 0.5;
      ctx.beginPath();
      for (var j = 0; j < 6; j++) {
        var a = Math.PI / 3 * j - Math.PI / 6;
        var px = cx + innerR * Math.cos(a);
        var py = cy + innerR * Math.sin(a);
        j === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.strokeStyle = hexToRgba(secondaryColor, 0.4);
      ctx.lineWidth = 0.6;
      ctx.stroke();

      // 中心点
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(1, hexR * 0.06), 0, Math.PI * 2);
      ctx.fillStyle = hexToRgba(secondaryColor, 0.5);
      ctx.fill();

      // 连接线 — 中心到顶点
      for (var k = 0; k < 6; k++) {
        var a2 = Math.PI / 3 * k - Math.PI / 6;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + innerR * Math.cos(a2), cy + innerR * Math.sin(a2));
        ctx.strokeStyle = hexToRgba(secondaryColor, 0.2);
        ctx.lineWidth = 0.4;
        ctx.stroke();
      }
    }

    // 平铺
    var cols = Math.ceil(w / hexW) + 2;
    var rows = Math.ceil(h / (hexH * 0.75)) + 2;
    for (var row = -1; row < rows; row++) {
      for (var col = -1; col < cols; col++) {
        var ox = col * hexW + (row % 2 === 0 ? 0 : hexW * 0.5);
        var oy = row * hexH * 0.75;
        drawHexagon(ox, oy);
      }
    }
  };

  // ══════════════════════════════════════════════════════
  //  4. 水波纹（自然纹）
  // ══════════════════════════════════════════════════════

  PatternLib.drawWavePattern = function (ctx, width, height, primaryColor, secondaryColor) {
    var w = safeW(width), h = safeH(height);
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = '#f0f5fa';
    ctx.fillRect(0, 0, w, h);

    var totalLayers = 14;
    var baseSpacing = h / (totalLayers + 1);

    for (var layer = 0; layer < totalLayers; layer++) {
      var t = layer / (totalLayers - 1);
      var y = baseSpacing * (layer + 1);
      var alpha = 0.15 + 0.55 * (1 - t); // 从浓到淡
      var amp = (8 + 6 * Math.sin(t * Math.PI)) * (1 - t * 0.3);
      var freq = 0.015 + 0.008 * t;
      var phase = layer * 0.8;

      ctx.beginPath();
      ctx.moveTo(0, y);
      for (var x = 0; x <= w; x += 2) {
        var wave = Math.sin(x * freq + phase) * amp
                  + Math.sin(x * freq * 1.7 + phase * 0.6) * amp * 0.3
                  + Math.sin(x * freq * 3.1 + phase * 1.3) * amp * 0.1;
        ctx.lineTo(x, y + wave);
      }

      var color = layer % 3 === 0 ? primaryColor : secondaryColor;
      ctx.strokeStyle = hexToRgba(color, alpha);
      ctx.lineWidth = 1.5 + (1 - t) * 1.5;
      ctx.stroke();

      // 波纹下填充区域
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fillStyle = hexToRgba(color, alpha * 0.08);
      ctx.fill();
    }

    // 涟漪点缀
    for (var ri = 0; ri < 5; ri++) {
      var rx = w * (0.15 + ri * 0.18);
      var ry = h * (0.3 + Math.sin(ri) * 0.25);
      var rr = 6 + ri * 4;
      ctx.beginPath();
      ctx.arc(rx, ry, Math.max(1, rr), 0, Math.PI * 2);
      ctx.strokeStyle = hexToRgba(primaryColor, 0.12);
      ctx.lineWidth = 0.6;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(rx, ry, Math.max(1, rr * 0.6), 0, Math.PI * 2);
      ctx.stroke();
    }
  };

  // ══════════════════════════════════════════════════════
  //  5. 几何回纹（几何纹）
  // ══════════════════════════════════════════════════════

  PatternLib.drawMeanderPattern = function (ctx, width, height, primaryColor, secondaryColor) {
    var w = safeW(width), h = safeH(height);
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = '#f6f1e7';
    ctx.fillRect(0, 0, w, h);

    var unit = Math.min(w, h) * 0.055;
    unit = Math.max(4, unit);
    var lineW = Math.max(1, unit * 0.18);
    var gap = unit * 0.08;

    // 回字纹基本单元（开口朝右）
    function meanderUnit(x, y, s) {
      s = Math.max(2, s);
      ctx.beginPath();
      // 外框
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + s);
      ctx.lineTo(x + s, y + s);
      ctx.lineTo(x + s, y + s * 0.6);
      // 内凹
      ctx.lineTo(x + s * 0.4, y + s * 0.6);
      ctx.lineTo(x + s * 0.4, y + s * 0.4);
      ctx.lineTo(x + s * 0.6, y + s * 0.4);
      ctx.lineTo(x + s * 0.6, y);
      ctx.closePath();
      ctx.strokeStyle = hexToRgba(primaryColor, 0.7);
      ctx.lineWidth = lineW;
      ctx.lineJoin = 'miter';
      ctx.stroke();
    }

    var cols = Math.ceil(w / (unit * 1.4)) + 1;
    var rows = Math.ceil(h / (unit * 1.4)) + 1;
    var cellW = unit * 1.3;
    var cellH = unit * 1.3;

    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var mx = c * cellW + gap;
        var my = r * cellH + gap;
        // 交替翻转
        if ((r + c) % 2 === 0) {
          meanderUnit(mx, my, unit);
        } else {
          ctx.save();
          ctx.translate(mx + unit, my + unit);
          ctx.rotate(Math.PI);
          meanderUnit(-unit, -unit, unit);
          ctx.restore();
        }
      }
    }

    // 边框装饰线
    ctx.strokeStyle = hexToRgba(secondaryColor, 0.3);
    ctx.lineWidth = 1;
    ctx.strokeRect(unit * 0.5, unit * 0.5, w - unit, h - unit);
    ctx.strokeRect(unit * 0.8, unit * 0.8, w - unit * 1.6, h - unit * 1.6);
  };

  // ══════════════════════════════════════════════════════
  //  6. 梅花纹（植物纹）
  // ══════════════════════════════════════════════════════

  function drawPlumBlossom(ctx, cx, cy, size, color, hasCenter) {
    size = Math.max(3, size);
    var petals = 5;
    for (var i = 0; i < petals; i++) {
      var angle = (Math.PI * 2 / petals) * i - Math.PI / 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      ctx.beginPath();
      // 花瓣：圆弧形
      ctx.ellipse(0, -size * 0.38, Math.max(1, size * 0.22), Math.max(1, size * 0.35), 0, 0, Math.PI * 2);
      ctx.fillStyle = hexToRgba(color, 0.75);
      ctx.fill();
      ctx.strokeStyle = hexToRgba(darken(color, 0.55), 0.5);
      ctx.lineWidth = 0.6;
      ctx.stroke();
      ctx.restore();
    }
    // 花心
    if (hasCenter !== false) {
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(1, size * 0.1), 0, Math.PI * 2);
      ctx.fillStyle = lighten(color, 0.55);
      ctx.fill();
      // 花蕊
      for (var j = 0; j < 7; j++) {
        var a = (Math.PI * 2 / 7) * j;
        var sx = cx + Math.cos(a) * size * 0.15;
        var sy = cy + Math.sin(a) * size * 0.15;
        ctx.beginPath();
        ctx.arc(sx, sy, Math.max(0.3, size * 0.03), 0, Math.PI * 2);
        ctx.fillStyle = darken(color, 0.35);
        ctx.fill();
      }
    }
  }

  function drawPlumBud(ctx, cx, cy, size, angle, color) {
    size = Math.max(2, size);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    // 花萼
    ctx.beginPath();
    ctx.moveTo(0, size * 0.3);
    ctx.bezierCurveTo(-size * 0.15, size * 0.1, -size * 0.2, -size * 0.15, 0, -size * 0.3);
    ctx.bezierCurveTo(size * 0.2, -size * 0.15, size * 0.15, size * 0.1, 0, size * 0.3);
    ctx.fillStyle = hexToRgba(darken(color, 0.5), 0.6);
    ctx.fill();
    // 花蕾
    ctx.beginPath();
    ctx.ellipse(0, -size * 0.25, Math.max(1, size * 0.12), Math.max(1, size * 0.18), 0, 0, Math.PI * 2);
    ctx.fillStyle = hexToRgba(color, 0.8);
    ctx.fill();
    ctx.restore();
  }

  function drawBranch(ctx, points, color, width) {
    if (points.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (var i = 1; i < points.length - 1; i++) {
      var xc = (points[i][0] + points[i + 1][0]) / 2;
      var yc = (points[i][1] + points[i + 1][1]) / 2;
      ctx.quadraticCurveTo(points[i][0], points[i][1], xc, yc);
    }
    ctx.lineTo(points[points.length - 1][0], points[points.length - 1][1]);
    ctx.strokeStyle = hexToRgba(color, 0.7);
    ctx.lineWidth = Math.max(1, width);
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  PatternLib.drawPlumBlossomPattern = function (ctx, width, height, primaryColor, secondaryColor) {
    var w = safeW(width), h = safeH(height);
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = '#faf5ec';
    ctx.fillRect(0, 0, w, h);

    var branchColor = darken(secondaryColor, 0.55);

    // 主枝干 — 折枝构图
    drawBranch(ctx, [
      [w * 0.05, h * 0.85],
      [w * 0.2, h * 0.7],
      [w * 0.35, h * 0.55],
      [w * 0.5, h * 0.45],
      [w * 0.65, h * 0.35],
      [w * 0.8, h * 0.3],
      [w * 0.95, h * 0.25]
    ], branchColor, 3.5);

    // 分枝1
    drawBranch(ctx, [
      [w * 0.35, h * 0.55],
      [w * 0.3, h * 0.38],
      [w * 0.35, h * 0.2]
    ], branchColor, 2);

    // 分枝2
    drawBranch(ctx, [
      [w * 0.65, h * 0.35],
      [w * 0.72, h * 0.22],
      [w * 0.82, h * 0.15]
    ], branchColor, 2);

    // 分枝3
    drawBranch(ctx, [
      [w * 0.5, h * 0.45],
      [w * 0.55, h * 0.58],
      [w * 0.65, h * 0.65]
    ], branchColor, 1.5);

    // 梅花 — 大小不一
    var blossoms = [
      [w * 0.34, h * 0.18, 18], [w * 0.42, h * 0.28, 14],
      [w * 0.52, h * 0.38, 20], [w * 0.62, h * 0.3, 16],
      [w * 0.75, h * 0.25, 15], [w * 0.84, h * 0.2, 13],
      [w * 0.48, h * 0.48, 12], [w * 0.28, h * 0.42, 11],
      [w * 0.58, h * 0.52, 14], [w * 0.7, h * 0.4, 10],
      [w * 0.22, h * 0.55, 10], [w * 0.4, h * 0.6, 9]
    ];
    blossoms.forEach(function (b) {
      drawPlumBlossom(ctx, b[0], b[1], b[2], primaryColor, true);
    });

    // 花蕾
    var buds = [
      [w * 0.92, h * 0.23, 10, -0.3], [w * 0.15, h * 0.68, 8, 0.5],
      [w * 0.78, h * 0.12, 9, -0.8], [w * 0.67, h * 0.64, 8, 1.2],
      [w * 0.55, h * 0.15, 7, -0.6]
    ];
    buds.forEach(function (b) {
      drawPlumBud(ctx, b[0], b[1], b[2], b[3], primaryColor);
    });
  };

  // ══════════════════════════════════════════════════════
  //  程序化生成器
  // ══════════════════════════════════════════════════════

  // ── 对称纹样生成器 ────────────────────────────────────

  function genSymmetricPattern(ctx, w, h, params) {
    var axes     = params.axes || 6;
    var layers   = params.layers || 3;
    var density  = params.density || 5;
    var primary  = params.primary || '#2c5f7c';
    var secondary = params.secondary || '#8b6914';

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#faf6ef';
    ctx.fillRect(0, 0, w, h);

    var cx = w / 2, cy = h / 2;
    var maxR = Math.min(w, h) * 0.45;

    // 使用固定种子伪随机以保证可重复
    var seed = 42;
    function rand() {
      seed = (seed * 16807 + 0) % 2147483647;
      return seed / 2147483647;
    }

    for (var layer = layers; layer >= 1; layer--) {
      var layerR = maxR * (layer / layers);
      var innerR = maxR * ((layer - 1) / layers);
      var midR = (layerR + innerR) / 2;

      // 每层环带内放置元素
      var countPerSector = Math.max(1, Math.round(density * 0.8));
      for (var s = 0; s < axes; s++) {
        var baseAngle = (Math.PI * 2 / axes) * s;
        for (var el = 0; el < countPerSector; el++) {
          var r = innerR + (layerR - innerR) * ((el + 0.5) / countPerSector);
          var spread = (Math.PI * 2 / axes) * 0.35;
          var a = baseAngle - spread + spread * 2 * rand();
          var ex = cx + Math.cos(a) * r;
          var ey = cy + Math.sin(a) * r;
          var elSize = (layerR - innerR) * 0.18 + rand() * 6;
          elSize = Math.max(3, elSize);

          // 随机选花瓣或叶形
          if (rand() > 0.4) {
            // 花瓣
            ctx.save();
            ctx.translate(ex, ey);
            ctx.rotate(a + Math.PI / 2);
            ctx.beginPath();
            ctx.ellipse(0, 0, Math.max(1, elSize * 0.35), Math.max(1, elSize), 0, 0, Math.PI * 2);
            ctx.fillStyle = hexToRgba(primary, 0.45 + layer * 0.1);
            ctx.fill();
            ctx.strokeStyle = hexToRgba(primary, 0.3);
            ctx.lineWidth = 0.5;
            ctx.stroke();
            ctx.restore();
          } else {
            // 叶形
            ctx.save();
            ctx.translate(ex, ey);
            ctx.rotate(a);
            ctx.beginPath();
            ctx.moveTo(-elSize, 0);
            ctx.bezierCurveTo(-elSize * 0.3, -elSize * 0.4, elSize * 0.3, -elSize * 0.4, elSize, 0);
            ctx.bezierCurveTo(elSize * 0.3, elSize * 0.4, -elSize * 0.3, elSize * 0.4, -elSize, 0);
            ctx.fillStyle = hexToRgba(secondary, 0.4 + layer * 0.08);
            ctx.fill();
            ctx.strokeStyle = hexToRgba(secondary, 0.3);
            ctx.lineWidth = 0.4;
            ctx.stroke();
            ctx.restore();
          }
        }
      }

      // 层间装饰环
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(1, midR), 0, Math.PI * 2);
      ctx.strokeStyle = hexToRgba(primary, 0.12);
      ctx.lineWidth = 0.6;
      ctx.setLineDash([4, 6]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 中心装饰
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(1, maxR * 0.06), 0, Math.PI * 2);
    ctx.fillStyle = hexToRgba(primary, 0.5);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(1, maxR * 0.1), 0, Math.PI * 2);
    ctx.strokeStyle = hexToRgba(secondary, 0.35);
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // ── 渐变晕染生成器 ────────────────────────────────────

  function genGradientDiffusion(ctx, w, h, params) {
    var centerX  = (params.centerX != null ? params.centerX : 0.5) * w;
    var centerY  = (params.centerY != null ? params.centerY : 0.5) * h;
    var radius   = Math.max(10, (params.radius || 0.35) * Math.max(w, h));
    var layers   = params.colorLayers || 3;
    var colors   = params.colors || ['#2c5f7c', '#8b6914', '#b5433a', '#6b3a6b', '#3a6b5c'];

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#faf6ef';
    ctx.fillRect(0, 0, w, h);

    var seed = 77;
    function rand() {
      seed = (seed * 16807 + 0) % 2147483647;
      return seed / 2147483647;
    }

    for (var layer = 0; layer < Math.min(layers, 5); layer++) {
      var layerR = radius * (1 - layer * 0.18);
      layerR = Math.max(5, layerR);
      var offsetX = (rand() - 0.5) * radius * 0.3;
      var offsetY = (rand() - 0.5) * radius * 0.3;

      // 主径向渐变
      var grad = ctx.createRadialGradient(
        centerX + offsetX, centerY + offsetY, layerR * 0.05,
        centerX + offsetX, centerY + offsetY, layerR
      );
      var c = colors[layer % colors.length];
      grad.addColorStop(0, hexToRgba(c, 0.35));
      grad.addColorStop(0.5, hexToRgba(c, 0.18));
      grad.addColorStop(1, hexToRgba(c, 0));

      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // 不规则边缘 — 多个偏移的径向渐变
      for (var blob = 0; blob < 6; blob++) {
        var bAngle = (Math.PI * 2 / 6) * blob + rand() * 0.5;
        var bDist = layerR * (0.3 + rand() * 0.5);
        var bx = centerX + Math.cos(bAngle) * bDist + (rand() - 0.5) * radius * 0.15;
        var by = centerY + Math.sin(bAngle) * bDist + (rand() - 0.5) * radius * 0.15;
        var bR = Math.max(5, layerR * (0.15 + rand() * 0.25));
        var bGrad = ctx.createRadialGradient(bx, by, 0, bx, by, bR);
        bGrad.addColorStop(0, hexToRgba(c, 0.12));
        bGrad.addColorStop(1, hexToRgba(c, 0));
        ctx.fillStyle = bGrad;
        ctx.fillRect(0, 0, w, h);
      }
    }

    // 水渍纹理
    ctx.strokeStyle = hexToRgba(colors[0], 0.06);
    ctx.lineWidth = 0.5;
    for (var li = 0; li < 20; li++) {
      ctx.beginPath();
      var sx = centerX + (rand() - 0.5) * radius * 1.5;
      var sy = centerY + (rand() - 0.5) * radius * 1.5;
      ctx.arc(sx, sy, Math.max(1, 3 + rand() * 12), 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // ── 几何拼接生成器 ────────────────────────────────────

  function genGeometricTessellation(ctx, w, h, params) {
    var shape    = params.shape || 'hexagon';
    var density  = params.density || 5;
    var rotation = (params.rotation || 0) * Math.PI / 180;
    var primary  = params.primary || '#2c5f7c';
    var secondary = params.secondary || '#8b6914';

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#f8f4ec';
    ctx.fillRect(0, 0, w, h);

    var size = Math.max(8, 20 + (10 - density) * 6);

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(rotation);
    ctx.translate(-w / 2, -h / 2);

    var seed = 33;
    function rand() {
      seed = (seed * 16807 + 0) % 2147483647;
      return seed / 2147483647;
    }

    function drawShape(cx, cy, s, filled) {
      s = Math.max(4, s);
      ctx.beginPath();
      if (shape === 'triangle') {
        var h3 = s * Math.sqrt(3) / 2;
        ctx.moveTo(cx, cy - h3 * 0.67);
        ctx.lineTo(cx - s / 2, cy + h3 * 0.33);
        ctx.lineTo(cx + s / 2, cy + h3 * 0.33);
        ctx.closePath();
      } else if (shape === 'diamond') {
        ctx.moveTo(cx, cy - s * 0.6);
        ctx.lineTo(cx + s * 0.4, cy);
        ctx.lineTo(cx, cy + s * 0.6);
        ctx.lineTo(cx - s * 0.4, cy);
        ctx.closePath();
      } else if (shape === 'hexagon') {
        for (var i = 0; i < 6; i++) {
          var a = Math.PI / 3 * i - Math.PI / 6;
          var px = cx + s * 0.5 * Math.cos(a);
          var py = cy + s * 0.5 * Math.sin(a);
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath();
      } else {
        ctx.arc(cx, cy, Math.max(1, s * 0.4), 0, Math.PI * 2);
      }

      if (filled) {
        ctx.fillStyle = hexToRgba(rand() > 0.5 ? primary : secondary, 0.25 + rand() * 0.2);
        ctx.fill();
      }
      ctx.strokeStyle = hexToRgba(rand() > 0.5 ? primary : secondary, 0.5 + rand() * 0.3);
      ctx.lineWidth = 1 + rand();
      ctx.stroke();

      // 内部纹饰
      if (s > 18 && rand() > 0.4) {
        ctx.beginPath();
        if (shape === 'hexagon') {
          for (var j = 0; j < 6; j++) {
            var a2 = Math.PI / 3 * j - Math.PI / 6;
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + s * 0.25 * Math.cos(a2), cy + s * 0.25 * Math.sin(a2));
          }
        } else {
          ctx.arc(cx, cy, Math.max(1, s * 0.18), 0, Math.PI * 2);
        }
        ctx.strokeStyle = hexToRgba(secondary, 0.3);
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }

    // 计算平铺偏移
    var cellW = size, cellH = size;
    if (shape === 'hexagon') {
      cellW = size * 0.87;
      cellH = size * 0.75;
    } else if (shape === 'diamond') {
      cellW = size * 0.8;
      cellH = size * 1.2;
    } else if (shape === 'triangle') {
      cellW = size * 0.87;
      cellH = size * 0.5;
    }

    var cols = Math.ceil(w / cellW) + 3;
    var rows = Math.ceil(h / cellH) + 3;
    for (var r = -1; r < rows; r++) {
      for (var c = -1; c < cols; c++) {
        var ox = c * cellW + (r % 2 === 1 ? cellW * 0.5 : 0);
        var oy = r * cellH;
        drawShape(ox, oy, size, rand() > 0.5);
      }
    }

    ctx.restore();
  }

  // ── 生成器分发 ────────────────────────────────────────

  function getGeneratorDrawFn(type) {
    switch (type) {
      case 'symmetric': return genSymmetricPattern;
      case 'gradient':  return genGradientDiffusion;
      case 'geometric': return genGeometricTessellation;
      default: return genSymmetricPattern;
    }
  }

  // ══════════════════════════════════════════════════════
  //  预设纹样数据集
  // ══════════════════════════════════════════════════════

  var _presetPatterns = [
    {
      id: uid(), name: '缠枝牡丹纹', category: 'plant',
      primaryColor: '#b5433a', secondaryColor: '#5a8c3c',
      drawFn: PatternLib.drawInterlockingPeony
    },
    {
      id: uid(), name: '云纹', category: 'nature',
      primaryColor: '#4a7a9b', secondaryColor: '#8b9baa',
      drawFn: PatternLib.drawCloudPattern
    },
    {
      id: uid(), name: '龟背纹', category: 'geometric',
      primaryColor: '#3a5c6e', secondaryColor: '#c4a035',
      drawFn: PatternLib.drawTortoiseShell
    },
    {
      id: uid(), name: '水波纹', category: 'nature',
      primaryColor: '#2c5f7c', secondaryColor: '#6a9bb5',
      drawFn: PatternLib.drawWavePattern
    },
    {
      id: uid(), name: '几何回纹', category: 'geometric',
      primaryColor: '#5c4033', secondaryColor: '#8b6914',
      drawFn: PatternLib.drawMeanderPattern
    },
    {
      id: uid(), name: '梅花纹', category: 'plant',
      primaryColor: '#c45a7a', secondaryColor: '#6b5040',
      drawFn: PatternLib.drawPlumBlossomPattern
    }
  ];

  // ══════════════════════════════════════════════════════
  //  图库网格浏览
  // ══════════════════════════════════════════════════════

  PatternLib.renderPatternGrid = function (filter) {
    filter = filter || _currentFilter;
    _currentFilter = filter;
    var grid = document.getElementById('pattern-grid');
    if (!grid) return;
    grid.innerHTML = '';

    var list = PatternLib.patternData.filter(function (p) {
      return filter === 'all' || p.category === filter;
    });

    list.forEach(function (pat) {
      var card = document.createElement('div');
      card.className = 'pattern-card';
      card.setAttribute('data-id', pat.id);

      var canvas = document.createElement('canvas');
      canvas.width = CARD_SIZE;
      canvas.height = CARD_SIZE;
      canvas.className = 'pattern-card-canvas';

      var info = document.createElement('div');
      info.className = 'pattern-card-info';
      info.innerHTML = '<span class="pattern-name">' + pat.name + '</span>'
                     + '<span class="pattern-category">' + getCategoryLabel(pat.category) + '</span>';

      card.appendChild(canvas);
      card.appendChild(info);

      // 绘制纹样到卡片 canvas
      pat.drawFn(canvas.getContext('2d'), CARD_SIZE, CARD_SIZE, pat.primaryColor, pat.secondaryColor);
      pat.canvas = canvas;

      // 点击打开编辑弹窗
      card.addEventListener('click', function () {
        openEditModal(pat);
      });

      grid.appendChild(card);
    });
  };

  function getCategoryLabel(cat) {
    var labels = { plant: '植物纹', geometric: '几何纹', nature: '自然纹', abstract: '抽象纹', imported: '导入素材' };
    return labels[cat] || cat;
  }

  // ══════════════════════════════════════════════════════
  //  编辑弹窗
  // ══════════════════════════════════════════════════════

  function openEditModal(pat) {
    _editingPatternId = pat.id;
    PatternLib.currentPattern = pat;

    var modal = document.getElementById('pattern-modal');
    if (!modal) return;
    modal.classList.remove('hidden');

    document.getElementById('modal-pattern-name').textContent = pat.name;
    document.getElementById('modal-pattern-category').textContent = getCategoryLabel(pat.category);

    var colorPrimary = document.getElementById('modal-color-primary');
    var colorSecondary = document.getElementById('modal-color-secondary');
    var scaleSlider = document.getElementById('modal-scale');
    var rotateSlider = document.getElementById('modal-rotate');

    colorPrimary.value = pat.primaryColor;
    colorSecondary.value = pat.secondaryColor;
    scaleSlider.value = 100;
    rotateSlider.value = 0;
    document.getElementById('scale-val').textContent = '100%';
    document.getElementById('rotate-val').textContent = '0°';

    drawModalPreview();
  }

  function closeEditModal() {
    var modal = document.getElementById('pattern-modal');
    if (modal) modal.classList.add('hidden');
    _editingPatternId = null;
  }

  function drawModalPreview() {
    var pat = PatternLib.patternData.find(function (p) { return p.id === _editingPatternId; });
    if (!pat) return;

    var canvas = document.getElementById('modal-canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var w = MODAL_SIZE, h = MODAL_SIZE;
    ctx.clearRect(0, 0, w, h);

    var colorPrimary = document.getElementById('modal-color-primary').value;
    var colorSecondary = document.getElementById('modal-color-secondary').value;
    var scale = (document.getElementById('modal-scale').value || 100) / 100;
    var rotate = (document.getElementById('modal-rotate').value || 0) * Math.PI / 180;

    // 更新数据
    pat.primaryColor = colorPrimary;
    pat.secondaryColor = colorSecondary;

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(rotate);
    ctx.scale(scale, scale);
    ctx.translate(-w / 2, -h / 2);
    pat.drawFn(ctx, w, h, colorPrimary, colorSecondary);
    ctx.restore();

    // 同步更新卡片
    PatternLib.currentPattern = { canvas: canvas, drawFn: pat.drawFn };
  }

  // ══════════════════════════════════════════════════════
  //  图片素材导入
  // ══════════════════════════════════════════════════════

  function showImportMsg(text) {
    var msg = document.createElement('div');
    msg.textContent = text;
    msg.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:20000;background:#c0392b;color:#fff;padding:10px 24px;border-radius:6px;font-size:0.95rem;box-shadow:0 2px 12px rgba(0,0,0,0.15);transition:opacity 0.3s;';
    document.body.appendChild(msg);
    setTimeout(function () { msg.style.opacity = '0'; }, 1800);
    setTimeout(function () { msg.remove(); }, 2200);
  }

  function handleImageImport(files) {
    if (!files || files.length === 0) return;

    // 权限检查
    if (window.AuthSystem && !window.AuthSystem.canImport()) {
      showImportMsg('您没有素材导入权限，请联系管理员授权');
      return;
    }

    var imported = 0;
    var total = files.length;

    Array.prototype.forEach.call(files, function (file) {
      if (!file.type.startsWith('image/')) return;

      var reader = new FileReader();
      reader.onload = function (e) {
        var img = new Image();
        img.onload = function () {
          var newPat = {
            id: uid(),
            name: file.name.replace(/\.[^.]+$/, ''),
            category: 'imported',
            primaryColor: '#2c5f7c',
            secondaryColor: '#8b6914',
            _img: img,
            drawFn: createImageDrawFn(img)
          };

          PatternLib.patternData.push(newPat);
          imported++;

          // 保存到 Supabase（异步，不阻塞 UI）
          saveMaterialToCloud(newPat, e.target.result);

          // 所有文件处理完后刷新网格
          if (imported === total) {
            PatternLib.renderPatternGrid(_currentFilter);
            console.log('[PatternLib] 导入 ' + imported + ' 张图片素材');
          }
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /**
   * 为导入的图片创建 drawFn
   * 等比缩放居中绘制到目标 canvas，保持 aspect ratio
   */
  function createImageDrawFn(img) {
    var imgW = img.naturalWidth || img.width;
    var imgH = img.naturalHeight || img.height;

    return function (ctx, w, h) {
      w = safeW(w);
      h = safeH(h);
      ctx.clearRect(0, 0, w, h);

      // 浅底色
      ctx.fillStyle = '#faf6ef';
      ctx.fillRect(0, 0, w, h);

      // 等比缩放居中
      var scale = Math.min(w / imgW, h / imgH);
      var drawW = imgW * scale;
      var drawH = imgH * scale;
      var offsetX = (w - drawW) / 2;
      var offsetY = (h - drawH) / 2;

      ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
    };
  }

  // ══════════════════════════════════════════════════════
  //  导出功能
  // ══════════════════════════════════════════════════════

  PatternLib.exportPNG = function (canvas) {
    if (!canvas) return;
    try {
      var dataURL = canvas.toDataURL('image/png');
      var a = document.createElement('a');
      a.href = dataURL;
      a.download = 'pattern-' + Date.now() + '.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      console.error('Export PNG failed:', e);
    }
  };

  function exportAllVisible() {
    var cards = document.querySelectorAll('.pattern-card:not(.hidden)');
    var exported = 0;
    cards.forEach(function (card) {
      var cv = card.querySelector('canvas');
      if (cv) {
        setTimeout(function () { PatternLib.exportPNG(cv); }, exported * 200);
        exported++;
      }
    });
  }

  // ══════════════════════════════════════════════════════
  //  生成器面板交互
  // ══════════════════════════════════════════════════════

  var _genTypeConfigs = {
    symmetric: {
      label: '对称纹样',
      controls: [
        { key: 'axes', label: '对称轴数', type: 'select', options: [2, 4, 6, 8], default: 6 },
        { key: 'layers', label: '层数', type: 'range', min: 1, max: 5, default: 3 },
        { key: 'density', label: '元素密度', type: 'range', min: 1, max: 10, default: 5 },
        { key: 'primary', label: '主色', type: 'color', default: '#2c5f7c' },
        { key: 'secondary', label: '辅色', type: 'color', default: '#8b6914' }
      ]
    },
    gradient: {
      label: '渐变晕染',
      controls: [
        { key: 'centerX', label: '中心 X', type: 'range', min: 0.1, max: 0.9, step: 0.05, default: 0.5 },
        { key: 'centerY', label: '中心 Y', type: 'range', min: 0.1, max: 0.9, step: 0.05, default: 0.5 },
        { key: 'radius', label: '扩散半径', type: 'range', min: 0.1, max: 0.8, step: 0.05, default: 0.35 },
        { key: 'colorLayers', label: '颜色层数', type: 'range', min: 2, max: 5, default: 3 },
        { key: 'c1', label: '颜色1', type: 'color', default: '#2c5f7c' },
        { key: 'c2', label: '颜色2', type: 'color', default: '#8b6914' },
        { key: 'c3', label: '颜色3', type: 'color', default: '#b5433a' },
        { key: 'c4', label: '颜色4', type: 'color', default: '#6b3a6b' },
        { key: 'c5', label: '颜色5', type: 'color', default: '#3a6b5c' }
      ]
    },
    geometric: {
      label: '几何拼接',
      controls: [
        { key: 'shape', label: '基础形状', type: 'select', options: ['triangle', 'diamond', 'hexagon', 'circle'], default: 'hexagon' },
        { key: 'density', label: '拼接密度', type: 'range', min: 1, max: 10, default: 5 },
        { key: 'rotation', label: '旋转角度', type: 'range', min: 0, max: 360, default: 0 },
        { key: 'primary', label: '主色', type: 'color', default: '#2c5f7c' },
        { key: 'secondary', label: '辅色', type: 'color', default: '#8b6914' }
      ]
    }
  };

  function switchGenType(type) {
    _currentGenType = type;
    var controlsEl = document.getElementById('gen-controls');
    if (!controlsEl) return;

    var config = _genTypeConfigs[type];
    controlsEl.innerHTML = '';

    _genParams = {};
    config.controls.forEach(function (ctrl) {
      _genParams[ctrl.key] = ctrl.default;

      var group = document.createElement('div');
      group.className = 'control-group';

      var label = document.createElement('label');
      label.textContent = ctrl.label;
      group.appendChild(label);

      var input;
      if (ctrl.type === 'range') {
        input = document.createElement('input');
        input.type = 'range';
        input.min = ctrl.min;
        input.max = ctrl.max;
        if (ctrl.step) input.step = ctrl.step;
        input.value = ctrl.default;
        var valSpan = document.createElement('span');
        valSpan.className = 'gen-param-val';
        valSpan.textContent = ctrl.default;
        label.appendChild(valSpan);
        input.addEventListener('input', function () {
          _genParams[ctrl.key] = parseFloat(this.value);
          valSpan.textContent = this.value;
        });
      } else if (ctrl.type === 'select') {
        input = document.createElement('select');
        ctrl.options.forEach(function (opt) {
          var o = document.createElement('option');
          o.value = opt;
          o.textContent = opt === 'triangle' ? '三角' : opt === 'diamond' ? '菱形' : opt === 'hexagon' ? '六边形' : opt === 'circle' ? '圆形' : opt;
          input.appendChild(o);
        });
        input.value = ctrl.default;
        input.addEventListener('change', function () {
          _genParams[ctrl.key] = this.value;
        });
      } else if (ctrl.type === 'color') {
        input = document.createElement('input');
        input.type = 'color';
        input.value = ctrl.default;
        input.addEventListener('input', function () {
          _genParams[ctrl.key] = this.value;
        });
      }

      if (input) {
        input.setAttribute('data-key', ctrl.key);
        group.appendChild(input);
      }
      controlsEl.appendChild(group);
    });

    // 梯度生成器需要颜色数组
    if (type === 'gradient') {
      _genParams.colors = [
        _genParams.c1, _genParams.c2, _genParams.c3, _genParams.c4, _genParams.c5
      ];
    }
  }

  function generatePattern() {
    var canvas = document.getElementById('gen-canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');

    // 梯度：收集颜色数组
    if (_currentGenType === 'gradient') {
      _genParams.colors = [
        _genParams.c1 || '#2c5f7c',
        _genParams.c2 || '#8b6914',
        _genParams.c3 || '#b5433a',
        _genParams.c4 || '#6b3a6b',
        _genParams.c5 || '#3a6b5c'
      ];
    }

    var drawFn = getGeneratorDrawFn(_currentGenType);
    drawFn(ctx, GEN_SIZE, GEN_SIZE, _genParams);
  }

  function saveToGallery() {
    var canvas = document.getElementById('gen-canvas');
    if (!canvas) return;

    var genTypeLabels = { symmetric: '对称纹样', gradient: '渐变晕染', geometric: '几何拼接' };
    var name = genTypeLabels[_currentGenType] || '生成纹样';
    name += '-' + (PatternLib.patternData.length + 1);

    var primary = _genParams.primary || _genParams.c1 || '#2c5f7c';
    var secondary = _genParams.secondary || _genParams.c2 || '#8b6914';

    // 将生成器结果封装为 drawFn
    var paramsCopy = JSON.parse(JSON.stringify(_genParams));
    var genTypeCopy = _currentGenType;
    var capturedDrawFn = function (ctx, w, h, pc, sc) {
      var fn = getGeneratorDrawFn(genTypeCopy);
      var p = Object.assign({}, paramsCopy, {
        primary: pc || paramsCopy.primary,
        secondary: sc || paramsCopy.secondary
      });
      fn(ctx, w, h, p);
    };

    var newPat = {
      id: uid(),
      name: name,
      category: 'abstract',
      primaryColor: primary,
      secondaryColor: secondary,
      drawFn: capturedDrawFn,
      canvas: null
    };

    PatternLib.patternData.push(newPat);
    PatternLib.renderPatternGrid(_currentFilter);
  }

  // ══════════════════════════════════════════════════════
  //  事件绑定
  // ══════════════════════════════════════════════════════

  function bindEvents() {
    // 过滤按钮
    var filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        filterBtns.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        PatternLib.renderPatternGrid(btn.getAttribute('data-category'));
      });
    });

    // 程序化生成按钮
    var btnGenerate = document.getElementById('btn-generate');
    if (btnGenerate) {
      btnGenerate.addEventListener('click', function () {
        var panel = document.getElementById('generator-panel');
        if (panel) panel.classList.toggle('hidden');
      });
    }

    // 生成器类型切换
    var genTypeBtns = document.querySelectorAll('.gen-type');
    genTypeBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        genTypeBtns.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        switchGenType(btn.getAttribute('data-gen'));
      });
    });

    // 生成纹样
    var btnGenCreate = document.getElementById('btn-gen-create');
    if (btnGenCreate) {
      btnGenCreate.addEventListener('click', generatePattern);
    }

    // 保存到图库
    var btnGenSave = document.getElementById('btn-gen-save');
    if (btnGenSave) {
      btnGenSave.addEventListener('click', saveToGallery);
    }

    // 批量导出
    var btnExportAll = document.getElementById('btn-export-all');
    if (btnExportAll) {
      btnExportAll.addEventListener('click', exportAllVisible);
    }

    // 导入素材按钮
    var btnImportImg = document.getElementById('btn-import-img');
    var importFileInput = document.getElementById('import-file-input');
    if (btnImportImg && importFileInput) {
      btnImportImg.addEventListener('click', function () {
        // 权限检查
        if (window.AuthSystem && !window.AuthSystem.canImport()) {
          showImportMsg('您没有素材导入权限，请联系管理员授权');
          return;
        }
        importFileInput.value = '';
        importFileInput.click();
      });
      importFileInput.addEventListener('change', function () {
        if (this.files && this.files.length > 0) {
          handleImageImport(this.files);
        }
      });
    }

    // 纹样区域拖拽导入
    var patternGrid = document.getElementById('pattern-grid');
    if (patternGrid) {
      patternGrid.addEventListener('dragover', function (e) {
        e.preventDefault();
        e.stopPropagation();
        patternGrid.classList.add('drag-over');
      });
      patternGrid.addEventListener('dragleave', function (e) {
        e.preventDefault();
        e.stopPropagation();
        patternGrid.classList.remove('drag-over');
      });
      patternGrid.addEventListener('drop', function (e) {
        e.preventDefault();
        e.stopPropagation();
        patternGrid.classList.remove('drag-over');
        // 拖拽导入权限检查
        if (window.AuthSystem && !window.AuthSystem.canImport()) {
          showImportMsg('您没有素材导入权限，请联系管理员授权');
          return;
        }
        if (e.dataTransfer && e.dataTransfer.files) {
          handleImageImport(e.dataTransfer.files);
        }
      });
    }

    // 编辑弹窗关闭
    var modalClose = document.querySelector('.modal-close');
    if (modalClose) {
      modalClose.addEventListener('click', closeEditModal);
    }
    var modalBackdrop = document.querySelector('.modal-backdrop');
    if (modalBackdrop) {
      modalBackdrop.addEventListener('click', closeEditModal);
    }

    // 弹窗控件 — 用 requestAnimationFrame 去抖
    ['modal-color-primary', 'modal-color-secondary', 'modal-scale', 'modal-rotate'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', function () {
          // 更新数值显示
          if (id === 'modal-scale') {
            document.getElementById('scale-val').textContent = el.value + '%';
          } else if (id === 'modal-rotate') {
            document.getElementById('rotate-val').textContent = el.value + '\u00B0';
          }
          if (_rafId) cancelAnimationFrame(_rafId);
          _rafId = requestAnimationFrame(function () {
            drawModalPreview();
            _rafId = null;
          });
        });
      }
    });

    // 弹窗导出
    var btnModalExport = document.getElementById('btn-modal-export');
    if (btnModalExport) {
      btnModalExport.addEventListener('click', function () {
        var cv = document.getElementById('modal-canvas');
        PatternLib.exportPNG(cv);
      });
    }

    // 应用到 3D 预览（预留接口，由 preview-3d 模块监听自定义事件）
    var btnApplyPreview = document.getElementById('btn-modal-apply-preview');
    if (btnApplyPreview) {
      btnApplyPreview.addEventListener('click', function () {
        var cv = document.getElementById('modal-canvas');
        if (cv) PatternLib.currentPattern = { canvas: cv };
        // 派发自定义事件供其他模块使用
        var evt = new CustomEvent('pattern-selected', { detail: { canvas: cv } });
        document.dispatchEvent(evt);
        closeEditModal();
      });
    }
  }

  // ══════════════════════════════════════════════════════
  //  初始化
  // ══════════════════════════════════════════════════════

  PatternLib.init = function () {
    // 加载预设纹样到 patternData
    PatternLib.patternData = _presetPatterns.slice();

    // 绑定事件
    bindEvents();

    // 渲染初始网格
    PatternLib.renderPatternGrid('all');

    // 设置默认生成器参数
    switchGenType('symmetric');

    // 生成器面板预绘制
    generatePattern();

    // 从 Supabase 加载云端素材
    loadMaterialsFromCloud().then(function (materials) {
      if (!materials || materials.length === 0) return;
      var loadCount = 0;
      materials.forEach(function (m) {
        if (!m.data_url) return;
        loadImageFromUrl(m.data_url).then(function (img) {
          var pat = {
            id: 'cloud-' + m.id,
            name: m.name,
            category: 'imported',
            primaryColor: m.primary_color || '#2c5f7c',
            secondaryColor: m.secondary_color || '#8b6914',
            _img: img,
            drawFn: createImageDrawFn(img),
            _cloudId: m.id
          };
          PatternLib.patternData.push(pat);
          loadCount++;
          if (loadCount === materials.length) {
            PatternLib.renderPatternGrid(_currentFilter);
            console.log('[PatternLib] 从云端加载 ' + loadCount + ' 个素材');
          }
        }).catch(function () {});
      });
    });

    console.log('[PatternLib] 初始化完成，共 ' + PatternLib.patternData.length + ' 个纹样');
  };

  // 挂载到全局
  window.PatternLib = PatternLib;

})();
