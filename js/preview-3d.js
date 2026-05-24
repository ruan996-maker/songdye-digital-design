/**
 * 宋染非遗数字设计系统 - 3D 产品预览模块
 * 纯 Canvas 2D 实现，通过 perspective 变换模拟 3D 效果
 * 所有功能挂载到 window.Preview3D，提供 init() 方法
 */
(function () {
  'use strict';

  /* ==================== 常量 ==================== */
  var W = 700, H = 600;
  var CX = W / 2;            // 350
  var CY = H / 2;            // 300
  var MIN_SCALE = 0.5;
  var MAX_SCALE = 2.0;
  var MAX_ROT_DEG = 30;      // 拖拽最大旋转角度
  var AUTO_ROT_DEG = 5;      // 自动摆动幅度
  var SNAP_BACK_SPEED = 0.06;
  var RESUME_AUTO_DELAY = 3000;

  /* ==================== 内部状态 ==================== */
  var state = {
    product: 'scarf',
    rotation: 0,              // 弧度，当前旋转角度
    scale: 1,
    dragging: false,
    dragStartX: 0,
    dragStartRot: 0,
    light: 0.7,
    bg: '#f5f0e8',
    pattern: null,             // CanvasPattern 对象
    autoRotate: true,          // 是否启用自动旋转
    autoTime: 0,               // 自动旋转时间累积
    snapBack: false,           // 是否正在回弹
    resumeTimer: null,
    rafId: null
  };

  /* 自定义产品列表 */
  var _customProducts = [];    // [{ id, name, img, template, mapping, opacity, areaX, areaY, areaSize }]
  var _customIdCounter = 0;

  /* 弹窗临时状态 */
  var _pendingProduct = {
    img: null,
    imgDataUrl: null,
    template: 'free',
    mapping: 'overlay',
    opacity: 50,
    areaX: 50,
    areaY: 50,
    areaSize: 60
  };

  /* ==================== DOM 引用 ==================== */
  var canvas, ctx;

  /* ==================== 工具函数 ==================== */
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function deg2rad(d) { return d * Math.PI / 180; }

  /** 确定性伪随机，用于纹理一致性 */
  function pseudoRandom(seed) {
    var x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  /* ==================== 路径构建 ==================== */

  /** 围巾轮廓 —— 流动丝巾路径 */
  function buildScarfPath(c) {
    c.beginPath();
    c.moveTo(CX - 225, CY - 95);
    // 上边缘：从左向右流动
    c.bezierCurveTo(CX - 170, CY - 148, CX - 80, CY - 128, CX - 10, CY - 118);
    c.bezierCurveTo(CX + 60, CY - 108, CX + 130, CY - 145, CX + 185, CY - 118);
    c.bezierCurveTo(CX + 232, CY - 98, CX + 258, CY - 48, CX + 248, CY + 8);
    // 右端弯回
    c.bezierCurveTo(CX + 238, CY + 58, CX + 212, CY + 88, CX + 168, CY + 112);
    // 底边缘：从右向左折回
    c.bezierCurveTo(CX + 122, CY + 138, CX + 58, CY + 128, CX, CY + 138);
    c.bezierCurveTo(CX - 58, CY + 148, CX - 105, CY + 118, CX - 145, CY + 138);
    c.bezierCurveTo(CX - 188, CY + 158, CX - 218, CY + 128, CX - 242, CY + 82);
    // 左端回到起点
    c.bezierCurveTo(CX - 262, CY + 38, CX - 258, CY - 28, CX - 242, CY - 58);
    c.bezierCurveTo(CX - 236, CY - 78, CX - 230, CY - 88, CX - 225, CY - 95);
    c.closePath();
  }

  /** T恤轮廓 */
  function buildTshirtPath(c) {
    c.beginPath();
    // 左肩
    c.moveTo(CX - 158, CY - 138);
    c.bezierCurveTo(CX - 128, CY - 158, CX - 78, CY - 168, CX - 32, CY - 158);
    // 领口左半
    c.bezierCurveTo(CX - 16, CY - 152, CX - 6, CY - 132, CX, CY - 126);
    // 领口右半
    c.bezierCurveTo(CX + 6, CY - 132, CX + 16, CY - 152, CX + 32, CY - 158);
    // 右肩
    c.bezierCurveTo(CX + 78, CY - 168, CX + 128, CY - 158, CX + 158, CY - 138);
    // 右袖
    c.bezierCurveTo(CX + 196, CY - 116, CX + 214, CY - 74, CX + 198, CY - 36);
    c.bezierCurveTo(CX + 190, CY - 18, CX + 166, CY - 14, CX + 146, CY - 26);
    // 右侧身体（上窄下宽的微透视）
    c.bezierCurveTo(CX + 142, CY + 32, CX + 148, CY + 112, CX + 155, CY + 168);
    // 下摆
    c.bezierCurveTo(CX + 140, CY + 188, CX - 140, CY + 188, CX - 155, CY + 168);
    // 左侧身体
    c.bezierCurveTo(CX - 148, CY + 112, CX - 142, CY + 32, CX - 146, CY - 26);
    // 左袖
    c.bezierCurveTo(CX - 166, CY - 14, CX - 190, CY - 18, CX - 198, CY - 36);
    c.bezierCurveTo(CX - 214, CY - 74, CX - 196, CY - 116, CX - 158, CY - 138);
    c.closePath();
  }

  /** T恤胸前纹样映射区域 */
  function buildTshirtChestPath(c) {
    c.beginPath();
    c.moveTo(CX - 88, CY - 92);
    c.lineTo(CX + 88, CY - 92);
    c.bezierCurveTo(CX + 96, CY + 10, CX + 98, CY + 50, CX + 96, CY + 68);
    c.lineTo(CX - 96, CY + 68);
    c.bezierCurveTo(CX - 98, CY + 50, CX - 96, CY + 10, CX - 88, CY - 92);
    c.closePath();
  }

  /** 团扇路径 */
  function buildFanPath(c) {
    var cx = CX, cy = CY + 68;
    var r = Math.max(1, 192);
    var startA = deg2rad(215);
    var endA = deg2rad(325);
    c.beginPath();
    c.moveTo(cx, cy);
    c.arc(cx, cy, r, startA, endA);
    c.closePath();
  }

  /** 书签路径 */
  function buildBookmarkPath(c) {
    var x = CX - 58, y = CY - 185;
    var w = 116, h = 370;
    var r = 8;
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.arcTo(x + w, y, x + w, y + r, Math.max(1, r));
    c.lineTo(x + w, y + h - r);
    c.arcTo(x + w, y + h, x + w - r, y + h, Math.max(1, r));
    c.lineTo(x + r, y + h);
    c.arcTo(x, y + h, x, y + h - r, Math.max(1, r));
    c.lineTo(x, y + r);
    c.arcTo(x, y, x + r, y, Math.max(1, r));
    c.closePath();
  }

  /* ==================== 通用绘制辅助 ==================== */

  /** 绘制"请选择纹样"提示 */
  function drawNoPatternHint(x, y) {
    ctx.save();
    ctx.font = '14px "Noto Serif SC", "PingFang SC", "Microsoft YaHei", serif';
    ctx.fillStyle = 'rgba(140, 115, 85, 0.45)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('请选择纹样', x, y);
    ctx.restore();
  }

  /** 左亮右暗线性光影叠加（需在已有路径上 fill） */
  function applyHorizontalLight(x1, x2, y, h, light) {
    var g = ctx.createLinearGradient(x1, y, x2, y);
    g.addColorStop(0, 'rgba(255,255,238,' + (light * 0.10).toFixed(4) + ')');
    g.addColorStop(0.38, 'rgba(255,255,255,0)');
    g.addColorStop(0.62, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,15,' + (light * 0.13).toFixed(4) + ')');
    ctx.fillStyle = g;
    ctx.fill();
  }

  /** 上亮下暗线性光影叠加 */
  function applyVerticalLight(x, y, w, h, light) {
    var g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, 'rgba(255,255,238,' + (light * 0.07).toFixed(4) + ')');
    g.addColorStop(0.35, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(0,0,15,' + (light * 0.05).toFixed(4) + ')');
    ctx.fillStyle = g;
    ctx.fill();
  }

  /* ==================== 围巾绘制 ==================== */
  function drawScarf() {
    var light = state.light;

    // — 围巾底色投影（增加立体感） —
    ctx.save();
    ctx.shadowColor = 'rgba(80, 60, 30, ' + (0.06 + light * 0.04).toFixed(4) + ')';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetX = 4;
    ctx.shadowOffsetY = 8;
    buildScarfPath(ctx);
    ctx.fillStyle = '#e8d5b7';
    ctx.fill();
    ctx.restore();

    // — 主体填充 —
    buildScarfPath(ctx);
    if (state.pattern) {
      ctx.fillStyle = state.pattern;
      ctx.fill();
    } else {
      var g = ctx.createLinearGradient(CX - 260, CY - 100, CX + 260, CY + 120);
      g.addColorStop(0, '#eedcc0');
      g.addColorStop(0.35, '#e2cda8');
      g.addColorStop(0.7, '#d8c09a');
      g.addColorStop(1, '#d0b58e');
      ctx.fillStyle = g;
      ctx.fill();
    }

    // — 边缘线 —
    buildScarfPath(ctx);
    ctx.strokeStyle = 'rgba(160, 130, 90, 0.22)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // — 褶皱纹理 —
    drawScarfFolds(light);

    // — 流苏（两端） —
    drawFringe(CX - 238, CY - 10, 14, 28, -0.35, light);
    drawFringe(CX + 240, CY + 48, 14, 28, 0.35, light);

    // — 光影叠加 —
    buildScarfPath(ctx);
    applyHorizontalLight(CX - 262, CX + 262, CY - 60, 320, light);
    buildScarfPath(ctx);
    applyVerticalLight(CX - 260, CY - 150, 520, 320, light);

    if (!state.pattern) drawNoPatternHint(CX, CY + 18);
  }

  function drawScarfFolds(light) {
    var folds = [
      [CX - 155, CY - 88, CX - 95, CY - 72, CX - 35, CY - 86, CX + 25, CY - 70],
      [CX - 60, CY - 55, CX + 5, CY - 35, CX + 65, CY - 50, CX + 135, CY - 36],
      [CX + 88, CY + 18, CX + 138, CY + 38, CX + 168, CY + 72, CX + 195, CY + 88],
      [CX - 105, CY + 55, CX - 62, CY + 72, CX - 18, CY + 62, CX + 35, CY + 78],
      [CX + 40, CY + 90, CX + 80, CY + 100, CX + 100, CY + 120, CX + 120, CY + 130]
    ];
    for (var i = 0; i < folds.length; i++) {
      var f = folds[i];
      // 阴影
      ctx.beginPath();
      ctx.moveTo(f[0], f[1]);
      ctx.bezierCurveTo(f[2], f[3], f[4], f[5], f[6], f[7]);
      ctx.strokeStyle = 'rgba(120, 88, 50, ' + (light * 0.11).toFixed(4) + ')';
      ctx.lineWidth = Math.max(1, 2.8);
      ctx.stroke();
      // 高光
      ctx.beginPath();
      ctx.moveTo(f[0] + 1.8, f[1] - 1.2);
      ctx.bezierCurveTo(f[2] + 1.8, f[3] - 1.2, f[4] + 1.8, f[5] - 1.2, f[6] + 1.8, f[7] - 1.2);
      ctx.strokeStyle = 'rgba(255, 255, 235, ' + (light * 0.06).toFixed(4) + ')';
      ctx.lineWidth = Math.max(0.5, 1.2);
      ctx.stroke();
    }
  }

  function drawFringe(x, y, count, len, angle, light) {
    ctx.save();
    for (var i = 0; i < count; i++) {
      var t = (i / Math.max(1, count - 1)) - 0.5;
      var sx = x + t * 22;
      var sy = y + Math.abs(t) * 12;
      var ex = sx + Math.sin(angle) * len + t * 6;
      var ey = sy + Math.cos(angle) * len;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(sx + t * 4, sy + len * 0.5, ex, ey);
      ctx.strokeStyle = 'rgba(160, 130, 85, ' + (0.28 + light * 0.08).toFixed(4) + ')';
      ctx.lineWidth = 0.7;
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ==================== T恤绘制 ==================== */
  function drawTshirt() {
    var light = state.light;

    // — 投影 —
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, ' + (0.04 + light * 0.03).toFixed(4) + ')';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 6;
    buildTshirtPath(ctx);
    ctx.fillStyle = '#f0f0f0';
    ctx.fill();
    ctx.restore();

    // — 主体底色 —
    buildTshirtPath(ctx);
    var bg = ctx.createLinearGradient(CX - 200, CY - 170, CX + 200, CY + 190);
    bg.addColorStop(0, '#f5f5f5');
    bg.addColorStop(0.5, '#eeeeee');
    bg.addColorStop(1, '#e6e6e6');
    ctx.fillStyle = bg;
    ctx.fill();

    // — 胸前纹样 —
    if (state.pattern) {
      ctx.save();
      buildTshirtChestPath(ctx);
      ctx.clip();
      ctx.fillStyle = state.pattern;
      ctx.fillRect(CX - 105, CY - 100, 210, 175);
      ctx.restore();
    }

    // — 边缘描线 —
    buildTshirtPath(ctx);
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // — 肩部/袖口区域阴影（裁剪到T恤内部） —
    ctx.save();
    buildTshirtPath(ctx);
    ctx.clip();

    // 肩部阴影
    var sg = ctx.createLinearGradient(CX, CY - 170, CX, CY - 75);
    sg.addColorStop(0, 'rgba(0,0,0,' + (light * 0.07).toFixed(4) + ')');
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(CX - 220, CY - 175, 440, 100);

    // 左袖下阴影
    var sl1 = ctx.createLinearGradient(CX - 205, CY - 36, CX - 145, CY + 15);
    sl1.addColorStop(0, 'rgba(0,0,0,' + (light * 0.055).toFixed(4) + ')');
    sl1.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sl1;
    ctx.fillRect(CX - 215, CY - 42, 75, 60);

    // 右袖下阴影
    var sl2 = ctx.createLinearGradient(CX + 205, CY - 36, CX + 145, CY + 15);
    sl2.addColorStop(0, 'rgba(0,0,0,' + (light * 0.055).toFixed(4) + ')');
    sl2.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sl2;
    ctx.fillRect(CX + 140, CY - 42, 75, 60);

    // 领口下方微阴影
    var cg = ctx.createLinearGradient(CX, CY - 126, CX, CY - 90);
    cg.addColorStop(0, 'rgba(0,0,0,' + (light * 0.04).toFixed(4) + ')');
    cg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = cg;
    ctx.fillRect(CX - 40, CY - 130, 80, 45);

    ctx.restore();

    // — 左右光影 —
    buildTshirtPath(ctx);
    applyHorizontalLight(CX - 210, CX + 210, CY, 370, light);

    if (!state.pattern) drawNoPatternHint(CX, CY + 8);
  }

  /* ==================== 团扇绘制 ==================== */
  function drawFan() {
    var light = state.light;
    var fcx = CX, fcy = CY + 68;
    var r = Math.max(1, 192);
    var startA = deg2rad(215), endA = deg2rad(325);
    var midA = (startA + endA) / 2;

    // — 投影 —
    ctx.save();
    ctx.shadowColor = 'rgba(60, 40, 20, ' + (0.05 + light * 0.03).toFixed(4) + ')';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 5;
    buildFanPath(ctx);
    ctx.fillStyle = '#f5e6d0';
    ctx.fill();
    ctx.restore();

    // — 扇面底色 / 纹样 —
    buildFanPath(ctx);
    if (state.pattern) {
      ctx.save();
      buildFanPath(ctx);
      ctx.clip();
      ctx.fillStyle = state.pattern;
      ctx.fill();
      ctx.restore();
    } else {
      var rg = ctx.createRadialGradient(fcx, fcy, Math.max(1, 20), fcx, fcy, r);
      rg.addColorStop(0, '#f8ead5');
      rg.addColorStop(0.6, '#f0e0c8');
      rg.addColorStop(1, '#e5d4b8');
      ctx.fillStyle = rg;
      ctx.fill();
    }

    // — 纸质纹理（确定性随机点） —
    ctx.save();
    buildFanPath(ctx);
    ctx.clip();
    for (var i = 0; i < 50; i++) {
      var ta = startA + pseudoRandom(i * 3.1) * (endA - startA);
      var td = Math.max(1, pseudoRandom(i * 7.7 + 1) * r * 0.88 + r * 0.08);
      var px = fcx + Math.cos(ta) * td;
      var py = fcy + Math.sin(ta) * td;
      var dotR = Math.max(0.3, pseudoRandom(i * 5.3 + 2) * 1.5);
      ctx.beginPath();
      ctx.arc(px, py, dotR, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(175, 155, 125, ' + (0.025 + pseudoRandom(i * 2.1) * 0.03).toFixed(4) + ')';
      ctx.fill();
    }
    ctx.restore();

    // — 扇骨 —
    var ribCount = 15;
    for (var j = 0; j < ribCount; j++) {
      var ribAngle = startA + (endA - startA) * (j / (ribCount - 1));
      var isEdge = (j === 0 || j === ribCount - 1);
      ctx.beginPath();
      ctx.moveTo(fcx, fcy);
      ctx.lineTo(fcx + Math.cos(ribAngle) * (r - 6), fcy + Math.sin(ribAngle) * (r - 6));
      ctx.strokeStyle = 'rgba(140, 108, 65, ' + (isEdge ? (0.35 + light * 0.1) : (0.15 + light * 0.05)).toFixed(4) + ')';
      ctx.lineWidth = isEdge ? 2.2 : 0.7;
      ctx.stroke();
    }

    // — 扇面弧线边缘 —
    ctx.beginPath();
    ctx.arc(fcx, fcy, r, startA, endA);
    ctx.strokeStyle = 'rgba(140, 108, 65, 0.32)';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // — 3D 弧度光影 —
    buildFanPath(ctx);
    var ag = ctx.createLinearGradient(fcx - r, fcy - r * 0.45, fcx + r, fcy - r * 0.3);
    ag.addColorStop(0, 'rgba(255,255,235,' + (light * 0.09).toFixed(4) + ')');
    ag.addColorStop(0.5, 'rgba(255,255,255,0)');
    ag.addColorStop(1, 'rgba(0,0,15,' + (light * 0.11).toFixed(4) + ')');
    ctx.fillStyle = ag;
    ctx.fill();

    // — 扇柄 —
    ctx.save();
    ctx.lineCap = 'round';
    // 外层
    ctx.beginPath();
    ctx.moveTo(fcx, fcy);
    ctx.lineTo(fcx + 1, fcy + 88);
    ctx.strokeStyle = 'rgba(110, 82, 42, 0.55)';
    ctx.lineWidth = 7;
    ctx.stroke();
    // 内层高光
    ctx.beginPath();
    ctx.moveTo(fcx, fcy);
    ctx.lineTo(fcx + 1, fcy + 88);
    ctx.strokeStyle = 'rgba(185, 155, 105, 0.25)';
    ctx.lineWidth = 3.5;
    ctx.stroke();
    // 扇柄底端
    ctx.beginPath();
    ctx.arc(fcx + 1, fcy + 88, 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(110, 82, 42, 0.45)';
    ctx.fill();
    ctx.restore();

    if (!state.pattern) {
      ctx.save();
      ctx.font = '13px "Noto Serif SC", "PingFang SC", "Microsoft YaHei", serif';
      ctx.fillStyle = 'rgba(140, 115, 85, 0.45)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      var hintDist = r * 0.52;
      ctx.fillText('请选择纹样', fcx + Math.cos(midA) * hintDist, fcy + Math.sin(midA) * hintDist);
      ctx.restore();
    }
  }

  /* ==================== 书签绘制 ==================== */
  function drawBookmark() {
    var light = state.light;
    var bx = CX - 58, by = CY - 185;
    var bw = 116, bh = 370;

    // 微透视倾斜
    ctx.save();
    ctx.translate(CX, CY);
    ctx.transform(1, 0.025, -0.01, 1, 0, 0);
    ctx.translate(-CX, -CY);

    // — 纸张投影 —
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, ' + (0.06 + light * 0.04).toFixed(4) + ')';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetX = 4;
    ctx.shadowOffsetY = 5;
    buildBookmarkPath(ctx);
    ctx.fillStyle = '#f5f0e8';
    ctx.fill();
    ctx.restore();

    // — 主体填充 —
    buildBookmarkPath(ctx);
    if (state.pattern) {
      ctx.fillStyle = state.pattern;
      ctx.fill();
    } else {
      var g = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
      g.addColorStop(0, '#f7f2ea');
      g.addColorStop(0.3, '#f0e8da');
      g.addColorStop(0.7, '#ece2d0');
      g.addColorStop(1, '#e6d8c4');
      ctx.fillStyle = g;
      ctx.fill();
    }

    // — 纸张纹理（细横线） —
    ctx.save();
    buildBookmarkPath(ctx);
    ctx.clip();
    for (var i = 0; i < 18; i++) {
      var ly = by + 55 + i * 18;
      if (ly > by + bh - 10) break;
      ctx.beginPath();
      ctx.moveTo(bx + 12, ly);
      ctx.lineTo(bx + bw - 12, ly);
      ctx.strokeStyle = 'rgba(180, 165, 140, ' + (0.025 + pseudoRandom(i * 4.5) * 0.015).toFixed(4) + ')';
      ctx.lineWidth = 0.4;
      ctx.stroke();
    }
    ctx.restore();

    // — 边缘描线 —
    buildBookmarkPath(ctx);
    ctx.strokeStyle = 'rgba(160, 135, 100, 0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // — 系带孔 —
    ctx.beginPath();
    ctx.arc(CX, by + 28, Math.max(1, 7), 0, Math.PI * 2);
    ctx.fillStyle = state.bg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(160, 135, 100, 0.25)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // — 系带 —
    ctx.save();
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(CX - 2, by + 28);
    ctx.bezierCurveTo(CX - 7, by + 10, CX - 14, by - 5, CX - 10, by - 32);
    ctx.strokeStyle = 'rgba(185, 55, 55, 0.48)';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(CX + 2, by + 28);
    ctx.bezierCurveTo(CX + 7, by + 10, CX + 14, by - 5, CX + 10, by - 32);
    ctx.strokeStyle = 'rgba(185, 55, 55, 0.38)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // 系带末端小球
    ctx.beginPath();
    ctx.arc(CX - 10, by - 32, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(185, 55, 55, 0.4)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(CX + 10, by - 32, 2.2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(185, 55, 55, 0.35)';
    ctx.fill();
    ctx.restore();

    // — 光影 —
    buildBookmarkPath(ctx);
    applyHorizontalLight(bx - 5, bx + bw + 5, by, bh, light);
    buildBookmarkPath(ctx);
    applyVerticalLight(bx, by, bw, bh, light);

    if (!state.pattern) drawNoPatternHint(CX, CY + 12);

    ctx.restore(); // 恢复透视变换
  }

  /* ==================== 自定义产品绘制 ==================== */

  /** 查找自定义产品 */
  function findCustomProduct(id) {
    for (var i = 0; i < _customProducts.length; i++) {
      if (_customProducts[i].id === id) return _customProducts[i];
    }
    return null;
  }

  /** 绘制用户上传的自定义产品（按格式模板渲染） */
  function drawCustomProduct(item) {
    var light = state.light;
    var img = item.img;
    var imgW = img.naturalWidth || img.width;
    var imgH = img.naturalHeight || img.height;

    // 等比缩放适配画布（留边距）
    var maxW = W * 0.62;
    var maxH = H * 0.72;
    var fitScale = Math.min(maxW / Math.max(1, imgW), maxH / Math.max(1, imgH), 1);
    var drawW = imgW * fitScale;
    var drawH = imgH * fitScale;
    var drawX = CX - drawW / 2;
    var drawY = CY - drawH / 2;

    // — 投影 —
    ctx.save();
    ctx.shadowColor = 'rgba(60, 40, 20, ' + (0.05 + light * 0.04).toFixed(4) + ')';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetX = 4;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = '#e8ddd0';
    ctx.fillRect(drawX, drawY, drawW, drawH);
    ctx.restore();

    // — 绘制产品图片 —
    ctx.drawImage(img, drawX, drawY, drawW, drawH);

    // — 纹样映射（根据格式模板和映射方式） —
    if (state.pattern) {
      drawPatternOnCustom(drawX, drawY, drawW, drawH, item);
    }

    // — 边框 —
    ctx.strokeStyle = 'rgba(160, 135, 100, 0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(drawX, drawY, drawW, drawH);

    // — 光影叠加 —
    ctx.save();
    ctx.beginPath();
    ctx.rect(drawX, drawY, drawW, drawH);
    ctx.clip();
    applyHorizontalLight(drawX, drawX + drawW, drawY, drawH, light);
    applyVerticalLight(drawX, drawY, drawW, drawH, light);
    ctx.restore();

    // — 产品名称标签 —
    ctx.save();
    ctx.font = '13px "Noto Serif SC", "PingFang SC", "Microsoft YaHei", serif';
    ctx.fillStyle = 'rgba(42, 37, 32, 0.45)';
    ctx.textAlign = 'center';
    var labelY = drawY + drawH + 22;
    ctx.fillText(item.name, CX, labelY);
    // 模板类型标注
    var templateLabels = { free:'自由型', scarf:'围巾型', tshirt:'T恤型', fan:'团扇型', bookmark:'书签型', round:'圆形型' };
    ctx.font = '11px "Noto Serif SC", "PingFang SC", "Microsoft YaHei", serif';
    ctx.fillStyle = 'rgba(124, 181, 176, 0.5)';
    ctx.fillText(templateLabels[item.template] || '自由型', CX, labelY + 16);
    ctx.restore();

    if (!state.pattern) drawNoPatternHint(CX, CY);
  }

  /**
   * 在自定义产品上绘制纹样
   * 根据模板类型使用不同的 clip 路径
   */
  function drawPatternOnCustom(x, y, w, h, item) {
    var mapping = item.mapping || 'overlay';
    var opacity = (item.opacity || 50) / 100;
    var template = item.template || 'free';

    ctx.save();
    // 根据模板类型设置裁剪区域
    buildTemplateClip(x, y, w, h, template);
    ctx.clip();

    if (mapping === 'overlay') {
      // 叠加覆盖：纹样半透明覆盖全图
      ctx.globalAlpha = opacity;
      ctx.fillStyle = state.pattern;
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
    } else if (mapping === 'replace') {
      // 替换底色：全不透明覆盖
      ctx.fillStyle = state.pattern;
      ctx.fillRect(x, y, w, h);
    } else if (mapping === 'area') {
      // 区域映射：只在指定区域内显示纹样
      var areaX = x + w * ((item.areaX || 50) - (item.areaSize || 60) / 2) / 100;
      var areaY = y + h * ((item.areaY || 50) - (item.areaSize || 60) / 2) / 100;
      var areaW = w * (item.areaSize || 60) / 100;
      var areaH = h * (item.areaSize || 60) / 100;
      ctx.globalAlpha = Math.max(opacity, 0.8);
      ctx.fillStyle = state.pattern;
      ctx.fillRect(areaX, areaY, areaW, areaH);
      ctx.globalAlpha = 1;
      // 区域边框虚线提示
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = 'rgba(124, 181, 176, 0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(areaX, areaY, areaW, areaH);
      ctx.setLineDash([]);
    }

    ctx.restore();
  }

  /** 根据模板类型构建裁剪路径 */
  function buildTemplateClip(x, y, w, h, template) {
    switch (template) {
      case 'scarf':
        // 围巾型：圆角流动形状
        buildScarfTemplateClip(x, y, w, h);
        break;
      case 'tshirt':
        // T恤型：仅胸前矩形区域
        var chestX = x + w * 0.18;
        var chestY = y + h * 0.2;
        var chestW = w * 0.64;
        var chestH = h * 0.5;
        roundRectPath(chestX, chestY, chestW, chestH, 8);
        break;
      case 'fan':
        // 团扇型：圆形裁剪
        var fcx = x + w / 2, fcy = y + h / 2;
        var fr = Math.min(w, h) * 0.45;
        ctx.beginPath();
        ctx.arc(fcx, fcy, Math.max(1, fr), 0, Math.PI * 2);
        break;
      case 'bookmark':
        // 书签型：窄长条
        var bw = w * 0.35;
        var bh = h * 0.85;
        var bx = x + (w - bw) / 2;
        var by = y + (h - bh) / 2;
        roundRectPath(bx, by, bw, bh, 4);
        break;
      case 'round':
        // 圆形型
        var rx = x + w / 2, ry = y + h / 2;
        var rr = Math.min(w, h) * 0.4;
        ctx.beginPath();
        ctx.arc(rx, ry, Math.max(1, rr), 0, Math.PI * 2);
        break;
      default:
        // free: 全图矩形
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        break;
    }
  }

  /** 围巾型模板 clip：流动曲线 */
  function buildScarfTemplateClip(x, y, w, h) {
    var cx = x + w / 2, cy = y + h / 2;
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.38, cy - h * 0.28);
    ctx.bezierCurveTo(cx - w * 0.25, cy - h * 0.42, cx - w * 0.05, cy - h * 0.38, cx + w * 0.05, cy - h * 0.35);
    ctx.bezierCurveTo(cx + w * 0.18, cy - h * 0.3, cx + w * 0.32, cy - h * 0.38, cx + w * 0.4, cy - h * 0.28);
    ctx.bezierCurveTo(cx + w * 0.46, cy - h * 0.15, cx + w * 0.46, cy + h * 0.1, cx + w * 0.38, cy + h * 0.25);
    ctx.bezierCurveTo(cx + w * 0.28, cy + h * 0.35, cx + w * 0.1, cy + h * 0.32, cx, cy + h * 0.35);
    ctx.bezierCurveTo(cx - w * 0.12, cy + h * 0.38, cx - w * 0.25, cy + h * 0.3, cx - w * 0.32, cy + h * 0.35);
    ctx.bezierCurveTo(cx - w * 0.42, cy + h * 0.4, cx - w * 0.46, cy + h * 0.18, cx - w * 0.45, cy);
    ctx.bezierCurveTo(cx - w * 0.44, cy - h * 0.15, cx - w * 0.42, cy - h * 0.22, cx - w * 0.38, cy - h * 0.28);
    ctx.closePath();
  }

  /** 圆角矩形路径辅助 */
  function roundRectPath(x, y, w, h, r) {
    r = Math.max(1, r);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  /* ==================== 自定义产品弹窗逻辑 ==================== */

  function openProductModal() {
    // 重置临时状态
    _pendingProduct = { img: null, imgDataUrl: null, template: 'free', mapping: 'overlay', opacity: 50, areaX: 50, areaY: 50, areaSize: 60 };
    document.getElementById('prod-name').value = '';
    document.getElementById('prod-img-preview').classList.add('hidden');
    document.getElementById('prod-upload-area').classList.remove('hidden');

    // 重置模板选择
    var cards = document.querySelectorAll('.template-card');
    for (var i = 0; i < cards.length; i++) {
      cards[i].classList.toggle('active', cards[i].getAttribute('data-template') === 'free');
    }
    // 重置映射方式
    var mBtns = document.querySelectorAll('.mapping-btn');
    for (var j = 0; j < mBtns.length; j++) {
      mBtns[j].classList.toggle('active', mBtns[j].getAttribute('data-mapping') === 'overlay');
    }
    document.getElementById('mapping-opacity').value = 50;
    document.getElementById('mapping-opacity-val').textContent = '50%';
    document.getElementById('mapping-opacity-group').classList.remove('hidden');
    document.getElementById('mapping-area-group').classList.add('hidden');

    document.getElementById('product-modal').classList.remove('hidden');
  }

  function closeProductModal() {
    document.getElementById('product-modal').classList.add('hidden');
  }

  function confirmAddProduct() {
    if (!_pendingProduct.img) {
      alert('请先上传产品图片');
      return;
    }

    var name = document.getElementById('prod-name').value.trim() || ('产品' + (_customIdCounter + 1));
    var id = 'custom-' + (++_customIdCounter);

    _customProducts.push({
      id: id,
      name: name,
      img: _pendingProduct.img,
      template: _pendingProduct.template,
      mapping: _pendingProduct.mapping,
      opacity: _pendingProduct.opacity,
      areaX: _pendingProduct.areaX,
      areaY: _pendingProduct.areaY,
      areaSize: _pendingProduct.areaSize
    });

    // 动态添加产品按钮
    var list = document.getElementById('product-list');
    if (list) {
      var btn = document.createElement('button');
      btn.className = 'product-btn';
      btn.setAttribute('data-product', id);
      btn.textContent = name;
      btn.style.fontSize = '0.78rem';
      list.appendChild(btn);
      bindProductButton(btn);
    }

    closeProductModal();
    switchToProduct(id);
    console.log('[Preview3D] 添加自定义产品: ' + name + ' (模板:' + _pendingProduct.template + ', 映射:' + _pendingProduct.mapping + ')');
  }

  /** 处理弹窗内图片上传 */
  function handleProductImage(file) {
    if (!file || !file.type.startsWith('image/')) return;
    var reader = new FileReader();
    reader.onload = function (e) {
      var img = new Image();
      img.onload = function () {
        _pendingProduct.img = img;
        _pendingProduct.imgDataUrl = e.target.result;
        // 显示预览
        var preview = document.getElementById('prod-img-preview');
        var pctx = preview.getContext('2d');
        preview.width = 200;
        preview.height = 200;
        pctx.clearRect(0, 0, 200, 200);
        // 等比缩放预览
        var scale = Math.min(190 / Math.max(1, img.width), 190 / Math.max(1, img.height));
        var pw = img.width * scale;
        var ph = img.height * scale;
        pctx.drawImage(img, (200 - pw) / 2, (200 - ph) / 2, pw, ph);
        preview.classList.remove('hidden');
        document.getElementById('prod-upload-area').classList.add('hidden');

        // 自动填充产品名称（从文件名）
        var nameInput = document.getElementById('prod-name');
        if (!nameInput.value.trim()) {
          nameInput.value = file.name.replace(/\.[^.]+$/, '');
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function setupProductModalEvents() {
    // 打开弹窗
    var btnAdd = document.getElementById('btn-add-product');
    if (btnAdd) {
      btnAdd.addEventListener('click', openProductModal);
    }

    // 关闭弹窗
    var modalClose = document.querySelector('#product-modal .modal-close');
    var modalBackdrop = document.querySelector('#product-modal .modal-backdrop');
    var btnCancel = document.getElementById('btn-prod-cancel');
    if (modalClose) modalClose.addEventListener('click', closeProductModal);
    if (modalBackdrop) modalBackdrop.addEventListener('click', closeProductModal);
    if (btnCancel) btnCancel.addEventListener('click', closeProductModal);

    // 确认添加
    var btnConfirm = document.getElementById('btn-prod-confirm');
    if (btnConfirm) btnConfirm.addEventListener('click', confirmAddProduct);

    // 图片上传
    var uploadArea = document.getElementById('prod-upload-area');
    var imgInput = document.getElementById('prod-img-input');
    if (uploadArea && imgInput) {
      uploadArea.addEventListener('click', function () { imgInput.click(); });
      imgInput.addEventListener('change', function () {
        if (this.files && this.files.length > 0) handleProductImage(this.files[0]);
      });
      // 拖拽上传
      uploadArea.addEventListener('dragover', function (e) {
        e.preventDefault();
        this.style.borderColor = 'var(--accent)';
      });
      uploadArea.addEventListener('dragleave', function () {
        this.style.borderColor = '';
      });
      uploadArea.addEventListener('drop', function (e) {
        e.preventDefault();
        this.style.borderColor = '';
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          handleProductImage(e.dataTransfer.files[0]);
        }
      });
    }

    // 模板选择
    var templateCards = document.querySelectorAll('.template-card');
    for (var i = 0; i < templateCards.length; i++) {
      templateCards[i].addEventListener('click', function () {
        var siblings = document.querySelectorAll('.template-card');
        for (var s = 0; s < siblings.length; s++) siblings[s].classList.remove('active');
        this.classList.add('active');
        _pendingProduct.template = this.getAttribute('data-template') || 'free';
      });
    }

    // 映射方式选择
    var mappingBtns = document.querySelectorAll('.mapping-btn');
    for (var m = 0; m < mappingBtns.length; m++) {
      mappingBtns[m].addEventListener('click', function () {
        var siblings = document.querySelectorAll('.mapping-btn');
        for (var s = 0; s < siblings.length; s++) siblings[s].classList.remove('active');
        this.classList.add('active');
        _pendingProduct.mapping = this.getAttribute('data-mapping') || 'overlay';

        // 切换映射参数面板
        var opacityGroup = document.getElementById('mapping-opacity-group');
        var areaGroup = document.getElementById('mapping-area-group');
        if (opacityGroup && areaGroup) {
          if (_pendingProduct.mapping === 'area') {
            opacityGroup.classList.add('hidden');
            areaGroup.classList.remove('hidden');
          } else {
            opacityGroup.classList.remove('hidden');
            areaGroup.classList.add('hidden');
          }
        }
      });
    }

    // 透明度滑块
    var opacitySlider = document.getElementById('mapping-opacity');
    var opacityVal = document.getElementById('mapping-opacity-val');
    if (opacitySlider) {
      opacitySlider.addEventListener('input', function () {
        _pendingProduct.opacity = parseInt(this.value);
        opacityVal.textContent = this.value + '%';
      });
    }

    // 区域映射滑块
    var areaX = document.getElementById('mapping-area-x');
    var areaY = document.getElementById('mapping-area-y');
    var areaSize = document.getElementById('mapping-area-size');
    if (areaX) areaX.addEventListener('input', function () { _pendingProduct.areaX = parseInt(this.value); });
    if (areaY) areaY.addEventListener('input', function () { _pendingProduct.areaY = parseInt(this.value); });
    if (areaSize) areaSize.addEventListener('input', function () { _pendingProduct.areaSize = parseInt(this.value); });
  }

  /** 切换到指定产品（统一处理 active 状态） */
  function switchToProduct(productId) {
    var btns = document.querySelectorAll('.product-btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', btns[i].getAttribute('data-product') === productId);
    }
    state.product = productId;
    state.rotation = 0;
    state.scale = 1;
    state.snapBack = false;
    state.autoRotate = true;
    state.autoTime = 0;
    window.Preview3D.currentProduct = productId;
    render();
  }

  /** 为产品按钮绑定点击事件 */
  function bindProductButton(btn) {
    btn.addEventListener('click', function () {
      switchToProduct(this.getAttribute('data-product') || 'scarf');
    });
  }

  /* ==================== 主渲染 ==================== */
  function render() {
    if (!ctx) return;

    ctx.clearRect(0, 0, W, H);

    // 绘制背景
    ctx.fillStyle = state.bg;
    ctx.fillRect(0, 0, W, H);

    // 背景微妙网格（增加空间感）
    drawBgGrid();

    // 应用变换
    ctx.save();
    ctx.translate(CX, CY);

    // 缩放
    var s = Math.max(MIN_SCALE, state.scale);
    ctx.scale(s, s);

    // 水平缩放模拟 Y 轴旋转
    var cosR = Math.cos(state.rotation);
    ctx.scale(Math.max(0.02, cosR), 1);

    ctx.translate(-CX, -CY);

    // 根据当前产品类型绘制
    switch (state.product) {
      case 'scarf':    drawScarf();    break;
      case 'tshirt':   drawTshirt();   break;
      case 'fan':      drawFan();      break;
      case 'bookmark': drawBookmark(); break;
      default:
        // 查找自定义产品
        var customItem = findCustomProduct(state.product);
        if (customItem) {
          drawCustomProduct(customItem);
        } else {
          drawScarf();
        }
        break;
    }

    ctx.restore();

    // 更新公开数据接口
    window.Preview3D.rotationAngle = state.rotation;
    window.Preview3D.scale = state.scale;
  }

  /** 背景微网格 */
  function drawBgGrid() {
    ctx.save();
    ctx.strokeStyle = isDarkBg() ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.025)';
    ctx.lineWidth = 0.5;
    var step = 40;
    for (var x = step; x < W; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (var y = step; y < H; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function isDarkBg() {
    return state.bg === '#2a2520';
  }

  /* ==================== 动画循环 ==================== */
  function animate() {
    var needsRender = false;

    // 自动旋转：非拖拽且回弹完成时缓慢摆动
    if (state.autoRotate && !state.dragging && !state.snapBack) {
      state.autoTime += 0.008;
      state.rotation = deg2rad(Math.sin(state.autoTime) * AUTO_ROT_DEG);
      needsRender = true;
    }

    // 回弹动画：角度缓动回 0
    if (state.snapBack) {
      state.rotation += (0 - state.rotation) * SNAP_BACK_SPEED;
      if (Math.abs(state.rotation) < 0.0008) {
        state.rotation = 0;
        state.snapBack = false;
      }
      needsRender = true;
    }

    if (needsRender) render();

    state.rafId = requestAnimationFrame(animate);
  }

  /* ==================== 事件处理 ==================== */
  function setupEvents() {
    /* --- 鼠标拖拽旋转 --- */
    canvas.addEventListener('mousedown', function (e) {
      state.dragging = true;
      state.snapBack = false;
      state.autoRotate = false;
      state.dragStartX = e.clientX;
      state.dragStartRot = state.rotation;
      if (state.resumeTimer) {
        clearTimeout(state.resumeTimer);
        state.resumeTimer = null;
      }
      canvas.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', function (e) {
      if (!state.dragging) return;
      var dx = e.clientX - state.dragStartX;
      var newRot = state.dragStartRot + dx * 0.003;
      state.rotation = clamp(newRot, deg2rad(-MAX_ROT_DEG), deg2rad(MAX_ROT_DEG));
      render();
    });

    window.addEventListener('mouseup', function () {
      if (!state.dragging) return;
      state.dragging = false;
      state.snapBack = true;
      canvas.style.cursor = 'grab';

      // 松开 3 秒后恢复自动旋转
      if (state.resumeTimer) clearTimeout(state.resumeTimer);
      state.resumeTimer = setTimeout(function () {
        state.autoRotate = true;
        state.autoTime = 0;
      }, RESUME_AUTO_DELAY);
    });

    /* --- 滚轮缩放 --- */
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      var delta = e.deltaY > 0 ? -0.06 : 0.06;
      state.scale = clamp(state.scale + delta, MIN_SCALE, MAX_SCALE);
      render();
    }, { passive: false });

    /* --- 产品切换按钮 --- */
    var productBtns = document.querySelectorAll('.product-btn');
    for (var i = 0; i < productBtns.length; i++) {
      bindProductButton(productBtns[i]);
    }

    /* --- 添加自定义产品按钮 --- */
    setupProductModalEvents();

    /* --- 光照强度滑块 --- */
    var lightSlider = document.getElementById('light-slider');
    if (lightSlider) {
      lightSlider.addEventListener('input', function () {
        state.light = parseFloat(this.value) / 100;
        render();
      });
    }

    /* --- 背景色切换 --- */
    var bgOpts = document.querySelectorAll('.bg-opt');
    for (var j = 0; j < bgOpts.length; j++) {
      bgOpts[j].addEventListener('click', function () {
        var siblings = document.querySelectorAll('.bg-opt');
        for (var s = 0; s < siblings.length; s++) {
          siblings[s].classList.remove('active');
        }
        this.classList.add('active');

        var bgKey = this.getAttribute('data-bg') || 'light';
        switch (bgKey) {
          case 'dark':  state.bg = '#2a2520'; break;
          case 'warm':  state.bg = '#e8ddd0'; break;
          default:      state.bg = '#f5f0e8'; break;
        }
        render();
      });
    }

    /* --- 强制重新渲染按钮 --- */
    var renderBtn = document.getElementById('btn-render-3d');
    if (renderBtn) {
      renderBtn.addEventListener('click', function () {
        render();
      });
    }

    /* --- 监听纹样选择事件（由纹样图库模块触发） --- */
    window.addEventListener('pattern-selected', function (e) {
      if (e.detail && e.detail.canvas) {
        applyPattern(e.detail.canvas);
      }
    });

    /* --- 纹样下拉框切换 --- */
    var patSelect = document.getElementById('preview-pattern-select');
    if (patSelect) {
      patSelect.addEventListener('change', function () {
        var idx = parseInt(this.value, 10);
        if (isNaN(idx)) {
          state.pattern = null;
          render();
          return;
        }
        var pats = window.PatternLib ? window.PatternLib.patternData : [];
        if (!pats[idx]) return;
        var pat = pats[idx];
        // 将纹样绘制到临时 Canvas 再应用
        var tmpCv = document.createElement('canvas');
        tmpCv.width = 240;
        tmpCv.height = 240;
        var tmpCtx = tmpCv.getContext('2d');
        if (pat.drawFn) {
          pat.drawFn(tmpCtx, 240, 240, pat.primaryColor, pat.secondaryColor);
          applyPattern(tmpCv);
        }
      });
    }
  }

  /* ==================== 纹样应用 ==================== */
  function applyPattern(patternCanvas) {
    if (!patternCanvas) {
      console.warn('[Preview3D] applyPattern: 传入的 canvas 为空');
      return;
    }
    if (!ctx) {
      console.warn('[Preview3D] applyPattern: Preview3D 尚未初始化（ctx 为空），请先切换到3D预览标签页');
      return;
    }
    try {
      // 安全检查：确保 canvas 有有效像素数据
      var pw = patternCanvas.width || 0;
      var ph = patternCanvas.height || 0;
      if (pw < 1 || ph < 1) {
        console.warn('[Preview3D] applyPattern: canvas 尺寸无效', pw, 'x', ph);
        return;
      }
      // 尝试读取一个像素来验证 canvas 数据可访问
      var testCtx = patternCanvas.getContext('2d');
      if (testCtx) {
        var pixel = testCtx.getImageData(0, 0, 1, 1).data;
        if (pixel[3] === 0 && pixel[0] === 0 && pixel[1] === 0 && pixel[2] === 0) {
          // 透明/空白像素，可能整个 canvas 都是空的 — 仍然尝试 createPattern
          console.warn('[Preview3D] applyPattern: canvas 像素数据可能为空（透明）');
        }
      }

      state.pattern = ctx.createPattern(patternCanvas, 'repeat');
      if (!state.pattern) {
        console.error('[Preview3D] createPattern 返回 null');
        return;
      }
      console.log('[Preview3D] 纹样已应用成功 (' + pw + 'x' + ph + ')');
      render();
    } catch (err) {
      console.warn('[Preview3D] 创建纹样 pattern 失败:', err);
    }
  }

  /* ==================== 初始化 ==================== */
  var _inited = false;
  function init() {
    if (_inited) return;
    _inited = true;
    canvas = document.getElementById('preview-3d-canvas');
    if (!canvas) {
      console.error('[Preview3D] 未找到 Canvas #preview-3d-canvas');
      return;
    }

    canvas.width = W;
    canvas.height = H;
    canvas.style.cursor = 'grab';

    ctx = canvas.getContext('2d');
    if (!ctx) {
      console.error('[Preview3D] 无法获取 Canvas 2D 上下文');
      return;
    }

    setupEvents();
    animate();   // 启动动画循环
    render();    // 初始渲染
  }

  /* ==================== 公开接口 ==================== */
  window.Preview3D = {
    init: init,

    /** 当前产品类型 */
    currentProduct: 'scarf',

    /** 当前旋转角度（弧度） */
    rotationAngle: 0,

    /** 当前缩放比例 */
    scale: 1,

    /**
     * 应用纹样到产品模型
     * @param {HTMLCanvasElement} patternCanvas - 纹样 Canvas 元素
     */
    applyPattern: function (patternCanvas) {
      applyPattern(patternCanvas);
    }
  };

})();
