/**
 * 宋染非遗数字设计系统 - 智能配色引擎
 * 纯前端实现，无外部依赖
 */
(function () {
    'use strict';

    // ========== 1. 传统染料色谱数据 ==========
    const SPECTRUM = [
        {
            name: '靛蓝', dye: 'indigo', formula: '蓼蓝叶发酵还原',
            colors: [
                { name: '月白', hex: '#d4e5ef', desc: '极浅靛蓝' },
                { name: '天青', hex: '#7cb5b0', desc: '淡雅青调' },
                { name: '靛蓝', hex: '#2c5f7c', desc: '经典靛蓝' },
                { name: '藏青', hex: '#1a3a4d', desc: '深沉蓝黑' },
            ]
        },
        {
            name: '茜红', dye: 'madder', formula: '茜草根媒染',
            colors: [
                { name: '粉红', hex: '#e8a8a0', desc: '淡茜红' },
                { name: '胭脂', hex: '#d47068', desc: '浓郁胭脂' },
                { name: '茜红', hex: '#b5433a', desc: '标准茜红' },
                { name: '绛紫', hex: '#8b2a23', desc: '深沉红紫' },
            ]
        },
        {
            name: '槐黄', dye: 'sophora', formula: '槐花蕾蒸煮',
            colors: [
                { name: '鹅黄', hex: '#e8d88e', desc: '嫩芽黄' },
                { name: '槐黄', hex: '#b8922e', desc: '标准槐黄' },
                { name: '赭黄', hex: '#8b6914', desc: '深沉黄褐' },
                { name: '暗金', hex: '#5c460e', desc: '暗金色调' },
            ]
        },
        {
            name: '茶褐', dye: 'gallnut', formula: '五倍子媒染',
            colors: [
                { name: '浅褐', hex: '#a89080', desc: '浅茶褐' },
                { name: '茶褐', hex: '#8b6e5a', desc: '标准茶褐' },
                { name: '栗棕', hex: '#5c4033', desc: '深沉栗棕' },
                { name: '墨褐', hex: '#3a2820', desc: '近黑褐色' },
            ]
        },
        {
            name: '紫草', dye: 'gromwell', formula: '紫草根浸泡',
            colors: [
                { name: '淡紫', hex: '#c4a0c4', desc: '柔和浅紫' },
                { name: '紫草', hex: '#9b6a9b', desc: '标准紫草' },
                { name: '暗紫', hex: '#6b3a6b', desc: '深沉暗紫' },
                { name: '茄紫', hex: '#4a2040', desc: '深沉茄紫' },
            ]
        },
        {
            name: '栀子', dye: 'gardenia', formula: '栀子果实煎煮',
            colors: [
                { name: '嫩黄', hex: '#f0e070', desc: '清新嫩黄' },
                { name: '栀黄', hex: '#c4a035', desc: '标准栀子黄' },
                { name: '金黄', hex: '#9a7a20', desc: '温暖金黄' },
            ]
        },
        {
            name: '皂黑', dye: 'logwood', formula: '苏木 + 铁媒染',
            colors: [
                { name: '灰黑', hex: '#6a6058', desc: '浅灰黑' },
                { name: '炭灰', hex: '#4a4038', desc: '炭灰色' },
                { name: '皂黑', hex: '#2a2520', desc: '标准皂黑' },
            ]
        },
        {
            name: '苏木', dye: 'sapanwood', formula: '苏木心材煎煮',
            colors: [
                { name: '浅红', hex: '#c87080', desc: '淡苏木红' },
                { name: '苏木红', hex: '#8b4557', desc: '标准苏木红' },
                { name: '暗红', hex: '#5c2a3a', desc: '深沉暗红' },
            ]
        }
    ];

    // ========== 数据接口 ==========
    window.ColorEngine = {
        selectedColor: '#2c5f7c',
        paletteColors: [],
        SPECTRUM: SPECTRUM,
        init: init
    };

    // 当前推荐模式
    let currentMode = 'analogous';

    // ========== 2. 色彩转换工具 ==========
    function hexToRgb(hex) {
        hex = hex.replace('#', '');
        if (hex.length === 3) {
            hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
        }
        return {
            r: parseInt(hex.substring(0, 2), 16),
            g: parseInt(hex.substring(2, 4), 16),
            b: parseInt(hex.substring(4, 6), 16)
        };
    }

    function rgbToHex(r, g, b) {
        return '#' + [r, g, b].map(function (v) {
            var s = Math.round(Math.max(0, Math.min(255, v))).toString(16);
            return s.length === 1 ? '0' + s : s;
        }).join('');
    }

    function hexToHsl(hex) {
        var rgb = hexToRgb(hex);
        var r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255;
        var max = Math.max(r, g, b), min = Math.min(r, g, b);
        var h, s, l = (max + min) / 2;

        if (max === min) {
            h = s = 0;
        } else {
            var d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
                case g: h = ((b - r) / d + 2) / 6; break;
                case b: h = ((r - g) / d + 4) / 6; break;
            }
        }
        return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
    }

    function hslToHex(h, s, l) {
        h = ((h % 360) + 360) % 360;
        s = Math.max(0, Math.min(100, s)) / 100;
        l = Math.max(0, Math.min(100, l)) / 100;

        var c = (1 - Math.abs(2 * l - 1)) * s;
        var x = c * (1 - Math.abs((h / 60) % 2 - 1));
        var m = l - c / 2;
        var r, g, b;

        if (h < 60) { r = c; g = x; b = 0; }
        else if (h < 120) { r = x; g = c; b = 0; }
        else if (h < 180) { r = 0; g = c; b = x; }
        else if (h < 240) { r = 0; g = x; b = c; }
        else if (h < 300) { r = x; g = 0; b = c; }
        else { r = c; g = 0; b = x; }

        return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
    }

    // ========== 3. 传统色匹配 ==========
    function getAllTraditionalColors() {
        var colors = [];
        SPECTRUM.forEach(function (group) {
            group.colors.forEach(function (c) {
                colors.push({
                    hex: c.hex,
                    name: c.name,
                    desc: c.desc,
                    family: group.name,
                    dye: group.dye,
                    formula: group.formula
                });
            });
        });
        return colors;
    }

    var _allTraditionalColors = null;

    function matchToTraditional(hex) {
        if (!_allTraditionalColors) _allTraditionalColors = getAllTraditionalColors();
        var rgb = hexToRgb(hex);
        var best = null, bestDist = Infinity;

        _allTraditionalColors.forEach(function (tc) {
            var tRgb = hexToRgb(tc.hex);
            var dr = rgb.r - tRgb.r, dg = rgb.g - tRgb.g, db = rgb.b - tRgb.b;
            var dist = Math.sqrt(dr * dr + dg * dg + db * db);
            if (dist < bestDist) {
                bestDist = dist;
                best = tc;
            }
        });
        return { match: best, distance: bestDist };
    }

    // ========== 4. 智能配色推荐 ==========
    function getRecommendations(hex, mode) {
        var hsl = hexToHsl(hex);
        var h = hsl.h, s = hsl.s, l = hsl.l;
        var results = [];

        // 将推荐色匹配到最近的传统色
        function matchColors(hexList) {
            return hexList.map(function (hx) {
                var m = matchToTraditional(hx);
                return { hex: hx, traditional: m.match, distance: m.distance };
            });
        }

        if (mode === 'analogous') {
            // 同类色：色相 ±30° 取4色
            var angles = [-30, -15, 0, 15, 30];
            var colors = angles.map(function (offset) {
                return hslToHex(h + offset, s, l);
            });
            results.push({
                title: '同类色搭配',
                colors: matchColors(colors),
                desc: '色相相近，色调和谐统一，适合纹样主色搭配与同色系渐变设计'
            });
        }

        if (mode === 'complementary') {
            // 互补色
            var compH = (h + 180) % 360;
            var colors = [
                hslToHex(h, s, l),
                hslToHex(h, Math.max(s - 20, 10), Math.min(l + 15, 85)),
                hslToHex(compH, Math.max(s - 15, 10), Math.min(l + 10, 80)),
                hslToHex(compH, s, l)
            ];
            results.push({
                title: '互补色搭配',
                colors: matchColors(colors),
                desc: '冷暖对比强烈，适合作为底色与点缀色的搭配，视觉冲击力强'
            });
        }

        if (mode === 'triadic') {
            // 三角配色
            var triads = [0, 120, 240];
            var colors = [];
            triads.forEach(function (offset, i) {
                var th = (h + offset) % 360;
                colors.push(hslToHex(th, s, l));
                if (i === 0) {
                    colors.push(hslToHex(th, Math.max(s - 15, 10), Math.min(l + 20, 85)));
                }
            });
            results.push({
                title: '三角配色',
                colors: matchColors(colors),
                desc: '三角色平衡分布，色彩丰富而不杂乱，适合多色纹样组合设计'
            });
        }

        if (mode === 'split') {
            // 分裂互补
            var angles = [0, 150, 210];
            var colors = angles.map(function (offset) {
                return hslToHex((h + offset) % 360, s, l);
            });
            colors.push(hslToHex(h, Math.max(s - 20, 10), Math.min(l + 15, 85)));
            results.push({
                title: '分裂互补',
                colors: matchColors(colors),
                desc: '互补色的柔和变体，兼具对比与和谐，适合大面积底色搭配细节点缀'
            });
        }

        return results;
    }

    // ========== 5. 渲染色谱面板 ==========
    function renderSpectrum() {
        var container = document.getElementById('spectrum-list');
        if (!container) return;
        container.innerHTML = '';

        SPECTRUM.forEach(function (group) {
            var item = document.createElement('div');
            item.className = 'spectrum-item';

            // 色系标题
            var header = document.createElement('div');
            header.className = 'spectrum-header';
            header.innerHTML =
                '<span class="dye-dot" style="background:' + group.colors[0].hex + '"></span>' +
                '<span class="spectrum-name">' + group.name + '</span>' +
                '<span class="spectrum-formula">' + group.formula + '</span>';
            item.appendChild(header);

            // 颜色渐变条
            var bar = document.createElement('div');
            bar.className = 'spectrum-bar';

            group.colors.forEach(function (color, idx) {
                var swatch = document.createElement('div');
                swatch.className = 'spectrum-swatch';
                swatch.style.background = color.hex;
                swatch.dataset.hex = color.hex;
                swatch.dataset.name = color.name;
                swatch.dataset.family = group.name;

                // 深浅标签
                if (idx === 0) swatch.classList.add('lightest');
                if (idx === group.colors.length - 1) swatch.classList.add('deepest');

                swatch.title = color.name + ' ' + color.hex + '\n' + color.desc;

                swatch.addEventListener('click', function () {
                    selectColor(color.hex);
                    // 高亮选中
                    document.querySelectorAll('.spectrum-swatch.selected').forEach(function (el) {
                        el.classList.remove('selected');
                    });
                    swatch.classList.add('selected');
                });

                bar.appendChild(swatch);

                // 标签
                var label = document.createElement('span');
                label.className = 'spectrum-label';
                label.textContent = color.name;
                bar.appendChild(label);
            });

            item.appendChild(bar);
            container.appendChild(item);
        });
    }

    function selectColor(hex) {
        window.ColorEngine.selectedColor = hex;
        var picker = document.getElementById('main-color-picker');
        var preview = document.getElementById('main-color-preview');
        if (picker) picker.value = hex;
        if (preview) preview.style.background = hex;

        // 同步调色板编辑器滑块
        var hsl = hexToHsl(hex);
        var hueSlider = document.getElementById('hue-slider');
        var satSlider = document.getElementById('sat-slider');
        var lightSlider = document.getElementById('light-slider');
        if (hueSlider) hueSlider.value = hsl.h;
        if (satSlider) satSlider.value = hsl.s;
        if (lightSlider) lightSlider.value = hsl.l;
        updatePaletteCurrent();

        // 触发推荐
        renderRecommendations();
    }

    // ========== 6. 渲染推荐结果 ==========
    function renderRecommendations() {
        var container = document.getElementById('recommend-results');
        if (!container) return;
        container.innerHTML = '';

        var schemes = getRecommendations(window.ColorEngine.selectedColor, currentMode);

        schemes.forEach(function (scheme) {
            var card = document.createElement('div');
            card.className = 'recommend-scheme';

            var title = document.createElement('div');
            title.className = 'scheme-title';
            title.textContent = scheme.title;
            card.appendChild(title);

            var desc = document.createElement('div');
            desc.className = 'scheme-desc';
            desc.textContent = scheme.desc;
            card.appendChild(desc);

            var colorRow = document.createElement('div');
            colorRow.className = 'scheme-colors';

            scheme.colors.forEach(function (item) {
                var swatch = document.createElement('div');
                swatch.className = 'scheme-swatch';
                swatch.style.background = item.hex;
                swatch.title = item.hex +
                    (item.traditional ? '\n传统色: ' + item.traditional.name + '（' + item.traditional.family + '）' : '');

                swatch.addEventListener('click', function () {
                    if (navigator.clipboard) {
                        navigator.clipboard.writeText(item.hex);
                    }
                    selectColor(item.hex);
                });

                colorRow.appendChild(swatch);

                // 传统色标签
                if (item.traditional) {
                    var tag = document.createElement('span');
                    tag.className = 'scheme-trad-tag';
                    tag.textContent = item.traditional.name;
                    colorRow.appendChild(tag);
                }
            });

            card.appendChild(colorRow);
            container.appendChild(card);
        });
    }

    // ========== 7. 图片取色 K-means ==========
    function handleImageUpload(file) {
        var reader = new FileReader();
        reader.onload = function (e) {
            var img = new Image();
            img.onload = function () {
                var canvas = document.getElementById('image-canvas');
                if (!canvas) return;
                var ctx = canvas.getContext('2d');

                // 缩放绘制到 canvas
                var maxW = 300, maxH = 200;
                var scale = Math.min(maxW / img.width, maxH / img.height, 1);
                canvas.width = Math.round(img.width * scale);
                canvas.height = Math.round(img.height * scale);
                canvas.classList.remove('hidden');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                // 提取像素
                var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                var pixels = imageData.data;
                var samples = [];

                // 采样（每隔几个像素取一次）
                var step = Math.max(1, Math.floor(pixels.length / 4 / 5000));
                for (var i = 0; i < pixels.length; i += step * 4) {
                    var r = pixels[i], g = pixels[i + 1], b = pixels[i + 2], a = pixels[i + 3];
                    if (a < 128) continue; // 跳过透明
                    samples.push([r, g, b]);
                }

                if (samples.length < 5) return;

                // K-means 聚类
                var k = 5;
                var centers = kmeansInit(samples, k);
                for (var iter = 0; iter < 10; iter++) {
                    var clusters = kmeansAssign(samples, centers);
                    centers = kmeansUpdate(clusters);
                }

                // 渲染提取结果
                var extractedContainer = document.getElementById('extracted-colors');
                if (!extractedContainer) return;
                extractedContainer.innerHTML = '';

                // 按亮度排序
                centers.sort(function (a, b) {
                    return (a[0] * 0.299 + a[1] * 0.587 + a[2] * 0.114) -
                        (b[0] * 0.299 + b[1] * 0.587 + b[2] * 0.114);
                });

                centers.forEach(function (center) {
                    var hex = rgbToHex(center[0], center[1], center[2]);
                    var m = matchToTraditional(hex);

                    var swatch = document.createElement('div');
                    swatch.className = 'extracted-swatch';
                    swatch.style.background = hex;

                    // tooltip
                    swatch.title = hex +
                        '\n传统色: ' + m.match.name + '（' + m.match.family + '）' +
                        '\n配方: ' + m.match.formula;

                    swatch.addEventListener('click', function () {
                        selectColor(hex);
                    });

                    extractedContainer.appendChild(swatch);
                });
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    function kmeansInit(samples, k) {
        // K-means++ 初始化
        var centers = [];
        centers.push(samples[Math.floor(Math.random() * samples.length)].slice());

        for (var c = 1; c < k; c++) {
            var distances = samples.map(function (s) {
                var minDist = Infinity;
                centers.forEach(function (ctr) {
                    var d = Math.sqrt(
                        Math.pow(s[0] - ctr[0], 2) +
                        Math.pow(s[1] - ctr[1], 2) +
                        Math.pow(s[2] - ctr[2], 2)
                    );
                    if (d < minDist) minDist = d;
                });
                return minDist * minDist;
            });

            var totalDist = distances.reduce(function (a, b) { return a + b; }, 0);
            var threshold = Math.random() * totalDist;
            var cumulative = 0;
            for (var i = 0; i < distances.length; i++) {
                cumulative += distances[i];
                if (cumulative >= threshold) {
                    centers.push(samples[i].slice());
                    break;
                }
            }
        }
        return centers;
    }

    function kmeansAssign(samples, centers) {
        var clusters = centers.map(function () { return []; });
        samples.forEach(function (s) {
            var minDist = Infinity, minIdx = 0;
            centers.forEach(function (ctr, idx) {
                var d = Math.sqrt(
                    Math.pow(s[0] - ctr[0], 2) +
                    Math.pow(s[1] - ctr[1], 2) +
                    Math.pow(s[2] - ctr[2], 2)
                );
                if (d < minDist) { minDist = d; minIdx = idx; }
            });
            clusters[minIdx].push(s);
        });
        return clusters;
    }

    function kmeansUpdate(clusters) {
        return clusters.map(function (cluster) {
            if (cluster.length === 0) return [128, 128, 128];
            var sumR = 0, sumG = 0, sumB = 0;
            cluster.forEach(function (p) { sumR += p[0]; sumG += p[1]; sumB += p[2]; });
            return [Math.round(sumR / cluster.length), Math.round(sumG / cluster.length), Math.round(sumB / cluster.length)];
        });
    }

    // ========== 8. 调色板编辑器 ==========
    function initPaletteEditor() {
        var canvas = document.getElementById('hsl-canvas');
        if (!canvas) return;
        drawHslWheel(canvas);

        // 色板点击取色
        canvas.addEventListener('click', function (e) {
            var rect = canvas.getBoundingClientRect();
            var x = e.clientX - rect.left;
            var y = e.clientY - rect.top;
            var scaleX = canvas.width / rect.width;
            var scaleY = canvas.height / rect.height;
            x *= scaleX;
            y *= scaleY;

            var cx = canvas.width / 2, cy = canvas.height / 2;
            var dx = x - cx, dy = y - cy;
            var dist = Math.sqrt(dx * dx + dy * dy);
            var outerR = cx - 4;
            var innerR = outerR - 30;

            if (dist >= innerR && dist <= outerR) {
                // 点击在色相环上
                var angle = Math.atan2(dy, dx) * 180 / Math.PI;
                if (angle < 0) angle += 360;
                var hueSlider = document.getElementById('hue-slider');
                if (hueSlider) hueSlider.value = Math.round(angle);
                updatePaletteCurrent();
                drawHslWheel(canvas);
            } else if (dist < innerR - 4) {
                // 点击在中间 SV 色板
                var hueSlider = document.getElementById('hue-slider');
                var hue = hueSlider ? parseInt(hueSlider.value) : 0;
                var sat = Math.max(0, Math.min(100, Math.round((dx + innerR - 4) / (2 * (innerR - 4)) * 100)));
                var light = Math.max(0, Math.min(100, Math.round((1 - (dy + innerR - 4) / (2 * (innerR - 4))) * 100)));
                var satSlider = document.getElementById('sat-slider');
                var lightSlider = document.getElementById('light-slider');
                if (satSlider) satSlider.value = sat;
                if (lightSlider) lightSlider.value = light;
                updatePaletteCurrent();
            }
        });
    }

    function drawHslWheel(canvas) {
        var ctx = canvas.getContext('2d');
        var w = canvas.width, h = canvas.height;
        var cx = w / 2, cy = h / 2;
        var outerR = cx - 4;
        var innerR = outerR - 30;

        ctx.clearRect(0, 0, w, h);

        // 绘制色相环
        for (var angle = 0; angle < 360; angle += 1) {
            var startAngle = (angle - 90) * Math.PI / 180;
            var endAngle = (angle - 88) * Math.PI / 180;

            ctx.beginPath();
            ctx.arc(cx, cy, outerR, startAngle, endAngle);
            ctx.arc(cx, cy, innerR, endAngle, startAngle, true);
            ctx.closePath();
            ctx.fillStyle = 'hsl(' + angle + ', 80%, 55%)';
            ctx.fill();
        }

        // 色相环上的当前选中指示器
        var hueSlider = document.getElementById('hue-slider');
        var currentHue = hueSlider ? parseInt(hueSlider.value) : 0;
        var indicatorAngle = (currentHue - 90) * Math.PI / 180;
        var midR = (outerR + innerR) / 2;
        var ix = cx + Math.cos(indicatorAngle) * midR;
        var iy = cy + Math.sin(indicatorAngle) * midR;

        ctx.beginPath();
        ctx.arc(ix, iy, 6, 0, Math.PI * 2);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(ix, iy, 5, 0, Math.PI * 2);
        ctx.fillStyle = 'hsl(' + currentHue + ', 80%, 55%)';
        ctx.fill();

        // 绘制中间的饱和度-明度色板
        var panelR = innerR - 6;
        var panelSize = panelR * 2;
        var px = cx - panelR, py = cy - panelR;

        // 使用 ImageData 逐像素绘制
        var imgData = ctx.createImageData(Math.ceil(panelSize), Math.ceil(panelSize));
        for (var row = 0; row < imgData.height; row++) {
            for (var col = 0; col < imgData.width; col++) {
                var sat = Math.max(0, Math.min(100, (col / imgData.width) * 100));
                var light = Math.max(0, Math.min(100, (1 - row / imgData.height) * 100));
                var rgb = hexToRgb(hslToHex(currentHue, sat, light));
                var idx = (row * imgData.width + col) * 4;
                imgData.data[idx] = rgb.r;
                imgData.data[idx + 1] = rgb.g;
                imgData.data[idx + 2] = rgb.b;
                imgData.data[idx + 3] = 255;
            }
        }
        ctx.putImageData(imgData, Math.round(px), Math.round(py));
    }

    function updatePaletteCurrent() {
        var hueSlider = document.getElementById('hue-slider');
        var satSlider = document.getElementById('sat-slider');
        var lightSlider = document.getElementById('light-slider');
        var currentEl = document.getElementById('palette-current');
        if (!hueSlider || !satSlider || !lightSlider || !currentEl) return;

        var hex = hslToHex(
            parseInt(hueSlider.value),
            parseInt(satSlider.value),
            parseInt(lightSlider.value)
        );
        currentEl.style.background = hex;
        currentEl.textContent = hex;
    }

    function addColorToPalette(hex) {
        var arr = window.ColorEngine.paletteColors;
        if (arr.length >= 12) return;

        // 去重
        if (arr.indexOf(hex) !== -1) return;
        arr.push(hex);
        renderPalette();
    }

    function removeColorFromPalette(hex) {
        var arr = window.ColorEngine.paletteColors;
        var idx = arr.indexOf(hex);
        if (idx !== -1) {
            arr.splice(idx, 1);
            renderPalette();
        }
    }

    function renderPalette() {
        var container = document.getElementById('palette-colors');
        if (!container) return;
        container.innerHTML = '';

        window.ColorEngine.paletteColors.forEach(function (hex) {
            var swatch = document.createElement('div');
            swatch.className = 'palette-swatch';
            swatch.style.background = hex;
            swatch.title = hex + ' (点击删除)';

            swatch.addEventListener('click', function () {
                removeColorFromPalette(hex);
            });

            container.appendChild(swatch);
        });
    }

    // ========== 9. 事件绑定 ==========
    function bindEvents() {
        // 主色选择器
        var mainPicker = document.getElementById('main-color-picker');
        if (mainPicker) {
            mainPicker.addEventListener('input', function () {
                selectColor(mainPicker.value);
            });
        }

        // 推荐模式切换
        document.querySelectorAll('.mode-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                document.querySelectorAll('.mode-btn').forEach(function (b) { b.classList.remove('active'); });
                btn.classList.add('active');
                currentMode = btn.dataset.mode;
                renderRecommendations();
            });
        });

        // 图片上传区域
        var uploadArea = document.getElementById('upload-area');
        var imageInput = document.getElementById('image-upload');
        if (uploadArea && imageInput) {
            uploadArea.addEventListener('click', function () {
                imageInput.click();
            });
            imageInput.addEventListener('change', function () {
                if (imageInput.files && imageInput.files[0]) {
                    handleImageUpload(imageInput.files[0]);
                }
            });
            // 拖拽上传
            uploadArea.addEventListener('dragover', function (e) {
                e.preventDefault();
                uploadArea.classList.add('drag-over');
            });
            uploadArea.addEventListener('dragleave', function () {
                uploadArea.classList.remove('drag-over');
            });
            uploadArea.addEventListener('drop', function (e) {
                e.preventDefault();
                uploadArea.classList.remove('drag-over');
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    handleImageUpload(e.dataTransfer.files[0]);
                }
            });
        }

        // 调色板滑块
        var hueSlider = document.getElementById('hue-slider');
        var satSlider = document.getElementById('sat-slider');
        var lightSlider = document.getElementById('light-slider');

        function onSliderInput() {
            updatePaletteCurrent();
            var canvas = document.getElementById('hsl-canvas');
            if (canvas) drawHslWheel(canvas);
        }

        if (hueSlider) hueSlider.addEventListener('input', onSliderInput);
        if (satSlider) satSlider.addEventListener('input', onSliderInput);
        if (lightSlider) lightSlider.addEventListener('input', onSliderInput);

        // 加入配色板按钮
        var btnAddPalette = document.getElementById('btn-add-palette');
        if (btnAddPalette) {
            btnAddPalette.addEventListener('click', function () {
                var hue = hueSlider ? parseInt(hueSlider.value) : 0;
                var sat = satSlider ? parseInt(satSlider.value) : 60;
                var light = lightSlider ? parseInt(lightSlider.value) : 40;
                addColorToPalette(hslToHex(hue, sat, light));
            });
        }
    }

    // ========== 10. 初始化 ==========
    function init() {
        renderSpectrum();
        renderRecommendations();
        initPaletteEditor();
        updatePaletteCurrent();
        renderPalette();
        bindEvents();
    }

    // DOM 就绪后自动初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
