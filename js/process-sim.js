/**
 * 宋染非遗数字设计系统 - 工艺参数模拟模块
 * window.ProcessSim
 */
(function () {
    'use strict';

    /* ========== 1. 染料数据 ========== */
    const DYE_DATA = {
        indigo: {
            name: '靛蓝', baseColor: '#2c5f7c', formula: '蓼蓝发酵还原',
            optimalTemp: [50, 80], optimalConc: [40, 80],
            description: '靛蓝是中国最古老的染料之一，需经发酵还原成可溶性靛白后染色，氧化后恢复蓝色。'
        },
        madder: {
            name: '茜红', baseColor: '#b5433a', formula: '茜草根+明矾媒染',
            optimalTemp: [60, 90], optimalConc: [30, 70],
            description: '茜红以茜草根为原料，需配合明矾等媒染剂使用，可获得从粉红到绛紫的丰富色阶。'
        },
        sophora: {
            name: '槐黄', baseColor: '#8b6914', formula: '槐花蕾蒸煮提取',
            optimalTemp: [40, 70], optimalConc: [50, 90],
            description: '槐黄取自槐树花蕾，是中国传统植物染料中黄色系列的重要代表。'
        },
        gallnut: {
            name: '茶褐', baseColor: '#5c4033', formula: '五倍子+铁媒染',
            optimalTemp: [50, 85], optimalConc: [30, 60],
            description: '茶褐色以五倍子为原料，经铁媒染后呈现沉稳的褐色调，常用于棉麻织物。'
        },
        gromwell: {
            name: '紫草', baseColor: '#6b3a6b', formula: '紫草根浸泡提取',
            optimalTemp: [30, 60], optimalConc: [40, 80],
            description: '紫草染色工艺复杂，需反复浸染方能获得理想紫色，古代为贵族专用色。'
        },
        gardenia: {
            name: '栀子', baseColor: '#c4a035', formula: '栀子果实煎煮',
            optimalTemp: [45, 75], optimalConc: [35, 75],
            description: '栀子黄来源广泛、染色便捷，是中国传统黄色染料中使用最普遍的品种。'
        }
    };

    /* ========== 辅助函数 ========== */

    function hexToRgb(hex) {
        const h = hex.replace('#', '');
        return {
            r: parseInt(h.substring(0, 2), 16),
            g: parseInt(h.substring(2, 4), 16),
            b: parseInt(h.substring(4, 6), 16)
        };
    }

    function rgbToHex(r, g, b) {
        return '#' + [r, g, b].map(function (v) {
            var s = Math.max(0, Math.min(255, Math.round(v))).toString(16);
            return s.length < 2 ? '0' + s : s;
        }).join('');
    }

    /** 伪随机数生成器（种子可重复） */
    function seededRandom(seed) {
        var x = Math.sin(seed) * 10000;
        return x - Math.floor(x);
    }

    /** 限制值域 */
    function clamp(val, min, max) {
        return Math.max(min, Math.min(max, val));
    }

    /* ========== 2. 染色效果计算 ========== */

    function calculateDyeColor(params) {
        var dye = DYE_DATA[params.dye];
        var rgb = hexToRgb(dye.baseColor);
        var r = rgb.r, g = rgb.g, b = rgb.b;

        // 计算颜色强度因子（0-1）
        var intensity = 0;

        // 浓度影响（权重 30%）
        intensity += (params.concentration / 100) * 0.3;

        // 时间影响（权重 20%，对数曲线）
        intensity += Math.log(params.time + 1) / Math.log(121) * 0.2;

        // 温度影响（权重 20%，偏离最优温度越多效果越差）
        var optTemp = dye.optimalTemp;
        var tempDeviation = Math.abs(params.temperature - (optTemp[0] + optTemp[1]) / 2);
        var tempRange = (optTemp[1] - optTemp[0]) / 2;
        var tempFactor = Math.max(0, 1 - tempDeviation / (tempRange * 2));
        intensity += tempFactor * 0.2;

        // 染色次数影响（权重 30%，递减收益）
        intensity += (1 - Math.exp(-params.dips * 0.3)) * 0.3;

        // 计算最终颜色（与白色混合）
        var finalR = Math.round(255 - (255 - r) * intensity);
        var finalG = Math.round(255 - (255 - g) * intensity);
        var finalB = Math.round(255 - (255 - b) * intensity);

        return { r: finalR, g: finalG, b: finalB, intensity: intensity };
    }

    /* ========== 3. Canvas 绘制工具 ========== */

    var W = 500, H = 500;

    /** 绘制底布层 - 织物纹理 */
    function drawFabricBase(ctx, width, height) {
        // 浅米色底
        ctx.fillStyle = '#f5f0e8';
        ctx.fillRect(0, 0, width, height);

        // 逐像素噪点模拟织物纹理
        var imgData = ctx.getImageData(0, 0, width, height);
        var data = imgData.data;
        for (var i = 0; i < data.length; i += 4) {
            var noise = (Math.random() - 0.5) * 12;
            data[i] = clamp(data[i] + noise, 0, 255);
            data[i + 1] = clamp(data[i + 1] + noise, 0, 255);
            data[i + 2] = clamp(data[i + 2] + noise - 2, 0, 255);
        }
        ctx.putImageData(imgData, 0, 0);

        // 织物经纬线
        ctx.save();
        ctx.globalAlpha = 0.06;
        ctx.strokeStyle = '#b0a890';
        ctx.lineWidth = 0.5;
        for (var y = 0; y < height; y += 3) {
            var offsetX = (seededRandom(y * 7) - 0.5) * 1.2;
            ctx.beginPath();
            ctx.moveTo(0, y + offsetX);
            ctx.lineTo(width, y + offsetX);
            ctx.stroke();
        }
        for (var x = 0; x < width; x += 3) {
            var offsetY = (seededRandom(x * 13 + 99) - 0.5) * 1.2;
            ctx.beginPath();
            ctx.moveTo(x + offsetY, 0);
            ctx.lineTo(x + offsetY, height);
            ctx.stroke();
        }
        ctx.restore();
    }

    /** 绘制染色层 */
    function drawDyeLayer(ctx, width, height, color, dips, clipTop) {
        ctx.save();

        // clipTop 限制染色区域（动画用）
        if (typeof clipTop === 'number') {
            ctx.beginPath();
            ctx.rect(0, 0, width, clipTop);
            ctx.clip();
        }

        var hex = rgbToHex(color.r, color.g, color.b);

        // 整体覆盖染色色
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = hex;
        ctx.fillRect(0, 0, width, height);
        ctx.globalAlpha = 1;

        // 不规则渐变模拟手工不均匀性
        var irregularCount = Math.min(dips, 6) + 3;
        for (var i = 0; i < irregularCount; i++) {
            var cx = seededRandom(i * 37 + 7) * width;
            var cy = seededRandom(i * 53 + 11) * height;
            var rx = 80 + seededRandom(i * 71 + 3) * 160;
            var ry = 60 + seededRandom(i * 91 + 5) * 140;
            var grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry));
            var alpha = 0.04 + seededRandom(i * 17) * 0.08;
            grad.addColorStop(0, 'rgba(' + color.r + ',' + color.g + ',' + color.b + ',' + alpha + ')');
            grad.addColorStop(1, 'rgba(' + color.r + ',' + color.g + ',' + color.b + ',0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, width, height);
        }

        // 多次浸染叠加效果
        for (var d = 1; d < dips; d++) {
            var layerAlpha = 0.03 / d;
            var layerCx = seededRandom(d * 111 + 200) * width;
            var layerCy = seededRandom(d * 131 + 300) * height;
            var layerR = 100 + seededRandom(d * 151) * 200;
            var layerGrad = ctx.createRadialGradient(layerCx, layerCy, 0, layerCx, layerCy, layerR);
            layerGrad.addColorStop(0, 'rgba(' + color.r + ',' + color.g + ',' + color.b + ',' + layerAlpha + ')');
            layerGrad.addColorStop(1, 'rgba(' + color.r + ',' + color.g + ',' + color.b + ',0)');
            ctx.fillStyle = layerGrad;
            ctx.fillRect(0, 0, width, height);
        }

        // 边缘深色渐变（布料边缘吸收更多染液）
        var edgeSize = 40;
        // 上边
        var topGrad = ctx.createLinearGradient(0, 0, 0, edgeSize);
        topGrad.addColorStop(0, 'rgba(' + Math.max(0, color.r - 30) + ',' + Math.max(0, color.g - 30) + ',' + Math.max(0, color.b - 30) + ',0.15)');
        topGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = topGrad;
        ctx.fillRect(0, 0, width, edgeSize);
        // 下边
        var botGrad = ctx.createLinearGradient(0, height - edgeSize, 0, height);
        botGrad.addColorStop(0, 'rgba(0,0,0,0)');
        botGrad.addColorStop(1, 'rgba(' + Math.max(0, color.r - 30) + ',' + Math.max(0, color.g - 30) + ',' + Math.max(0, color.b - 30) + ',0.15)');
        ctx.fillStyle = botGrad;
        ctx.fillRect(0, height - edgeSize, width, edgeSize);
        // 左边
        var leftGrad = ctx.createLinearGradient(0, 0, edgeSize, 0);
        leftGrad.addColorStop(0, 'rgba(' + Math.max(0, color.r - 25) + ',' + Math.max(0, color.g - 25) + ',' + Math.max(0, color.b - 25) + ',0.12)');
        leftGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = leftGrad;
        ctx.fillRect(0, 0, edgeSize, height);
        // 右边
        var rightGrad = ctx.createLinearGradient(width - edgeSize, 0, width, 0);
        rightGrad.addColorStop(0, 'rgba(0,0,0,0)');
        rightGrad.addColorStop(1, 'rgba(' + Math.max(0, color.r - 25) + ',' + Math.max(0, color.g - 25) + ',' + Math.max(0, color.b - 25) + ',0.12)');
        ctx.fillStyle = rightGrad;
        ctx.fillRect(width - edgeSize, 0, edgeSize, height);

        // 水渍纹理
        ctx.globalAlpha = 0.06;
        for (var s = 0; s < 12; s++) {
            var sx = seededRandom(s * 67 + 500) * width;
            var sy = seededRandom(s * 79 + 600) * height;
            var sr = 15 + seededRandom(s * 83) * 40;
            var sGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
            sGrad.addColorStop(0, 'rgba(' + clamp(color.r + 20, 0, 255) + ',' + clamp(color.g + 20, 0, 255) + ',' + clamp(color.b + 20, 0, 255) + ',0.5)');
            sGrad.addColorStop(0.7, 'rgba(' + color.r + ',' + color.g + ',' + color.b + ',0.2)');
            sGrad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = sGrad;
            ctx.beginPath();
            ctx.arc(sx, sy, sr, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        ctx.restore();
    }

    /** 绘制织物经纬细节（在染色后叠加） */
    function drawFabricDetail(ctx, width, height) {
        ctx.save();
        ctx.globalAlpha = 0.03;
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 0.3;
        for (var y = 0; y < height; y += 3) {
            var ox = (Math.random() - 0.5) * 0.8;
            ctx.beginPath();
            ctx.moveTo(0, y + ox);
            ctx.lineTo(width, y + ox);
            ctx.stroke();
        }
        for (var x = 0; x < width; x += 3) {
            var oy = (Math.random() - 0.5) * 0.8;
            ctx.beginPath();
            ctx.moveTo(x + oy, 0);
            ctx.lineTo(x + oy, height);
            ctx.stroke();
        }
        ctx.restore();
    }

    /* ========== 4. 核心模拟方法 ========== */

    /** 模拟染色完整渲染（静态，含全部纹理层） */
    function renderFullSimulation(ctx, width, height, params) {
        var color = calculateDyeColor(params);

        ctx.clearRect(0, 0, width, height);
        drawFabricBase(ctx, width, height);
        drawDyeLayer(ctx, width, height, color, params.dips);
        drawFabricDetail(ctx, width, height);

        return color;
    }

    /** 染色动画（从上到下逐渐染色） */
    function animateDyeing(ctx, width, height, params, onComplete) {
        var color = calculateDyeColor(params);
        var duration = 2000; // 2秒
        var startTime = null;

        // 先绘制底布
        ctx.clearRect(0, 0, width, height);
        drawFabricBase(ctx, width, height);

        function frame(timestamp) {
            if (!startTime) startTime = timestamp;
            var elapsed = timestamp - startTime;
            var progress = Math.min(elapsed / duration, 1);

            // 缓动函数 ease-out
            var easedProgress = 1 - Math.pow(1 - progress, 2.5);
            var clipY = Math.round(easedProgress * height);

            // 重绘底布
            ctx.clearRect(0, 0, width, height);
            drawFabricBase(ctx, width, height);

            // 绘制染色层（带 clip）
            drawDyeLayer(ctx, width, height, color, params.dips, clipY);

            // 在已染色区域叠加织物细节
            if (clipY > 0) {
                ctx.save();
                ctx.beginPath();
                ctx.rect(0, 0, width, clipY);
                ctx.clip();
                drawFabricDetail(ctx, width, height);
                ctx.restore();
            }

            // 染液前沿高亮
            if (clipY > 0 && clipY < height) {
                var frontGrad = ctx.createLinearGradient(0, clipY - 15, 0, clipY + 5);
                frontGrad.addColorStop(0, 'rgba(0,0,0,0)');
                frontGrad.addColorStop(0.6, 'rgba(' + clamp(color.r + 40, 0, 255) + ',' + clamp(color.g + 40, 0, 255) + ',' + clamp(color.b + 40, 0, 255) + ',0.25)');
                frontGrad.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = frontGrad;
                ctx.fillRect(0, clipY - 15, width, 20);
            }

            if (progress < 1) {
                requestAnimationFrame(frame);
            } else {
                // 动画结束，完整绘制一次确保质量
                renderFullSimulation(ctx, width, height, params);
                if (onComplete) onComplete(color);
            }
        }

        requestAnimationFrame(frame);
    }

    /* ========== 5. 传统参考效果 ========== */

    function renderTraditionalReference(dyeKey) {
        var canvas = document.getElementById('process-canvas');
        if (!canvas) return;
        var ctx = canvas.getContext('2d');
        canvas.width = W;
        canvas.height = H;

        var dye = DYE_DATA[dyeKey];
        if (!dye) return;

        // 理想条件参数
        var idealParams = {
            dye: dyeKey,
            temperature: (dye.optimalTemp[0] + dye.optimalTemp[1]) / 2,
            concentration: (dye.optimalConc[0] + dye.optimalConc[1]) / 2,
            time: 60,
            dips: 5
        };

        var color = calculateDyeColor(idealParams);

        // 底布
        drawFabricBase(ctx, W, H);

        // 更均匀的着色 — 减少不规则渐变
        ctx.save();
        ctx.globalAlpha = 0.82;
        ctx.fillStyle = rgbToHex(color.r, color.g, color.b);
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 1;

        // 细腻过渡：少量大型径向渐变
        for (var i = 0; i < 4; i++) {
            var cx = W * (0.2 + i * 0.2);
            var cy = H * (0.3 + (i % 2) * 0.4);
            var r = 180;
            var grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
            var a = 0.025 + seededRandom(i * 41) * 0.035;
            grad.addColorStop(0, 'rgba(' + color.r + ',' + color.g + ',' + color.b + ',' + a + ')');
            grad.addColorStop(1, 'rgba(' + color.r + ',' + color.g + ',' + color.b + ',0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, W, H);
        }

        // 边缘深色（更柔和）
        var edgeSize = 35;
        var edgeAlpha = 0.08;
        var edgeColor = 'rgba(' + Math.max(0, color.r - 20) + ',' + Math.max(0, color.g - 20) + ',' + Math.max(0, color.b - 20) + ',';
        var tGrad = ctx.createLinearGradient(0, 0, 0, edgeSize);
        tGrad.addColorStop(0, edgeColor + edgeAlpha + ')');
        tGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = tGrad;
        ctx.fillRect(0, 0, W, edgeSize);

        var bGrad = ctx.createLinearGradient(0, H - edgeSize, 0, H);
        bGrad.addColorStop(0, 'rgba(0,0,0,0)');
        bGrad.addColorStop(1, edgeColor + edgeAlpha + ')');
        ctx.fillStyle = bGrad;
        ctx.fillRect(0, H - edgeSize, W, edgeSize);

        var lGrad = ctx.createLinearGradient(0, 0, edgeSize, 0);
        lGrad.addColorStop(0, edgeColor + edgeAlpha + ')');
        lGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = lGrad;
        ctx.fillRect(0, 0, edgeSize, H);

        var rGrad = ctx.createLinearGradient(W - edgeSize, 0, W, 0);
        rGrad.addColorStop(0, 'rgba(0,0,0,0)');
        rGrad.addColorStop(1, edgeColor + edgeAlpha + ')');
        ctx.fillStyle = rGrad;
        ctx.fillRect(W - edgeSize, 0, edgeSize, H);

        ctx.restore();

        // 织物细节
        drawFabricDetail(ctx, W, H);

        // 标注文字
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.font = 'bold 16px "Noto Serif SC", serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        // 文字背景
        var textW = 220;
        var textH = 30;
        var textX = W / 2;
        var textY = H - 20;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(textX - textW / 2, textY - textH + 4, textW, textH);
        ctx.fillStyle = '#ffffff';
        ctx.fillText('传统工艺标准参考', textX, textY);
        ctx.restore();
    }

    /* ========== 6. 对比视图 ========== */

    function renderComparison(params) {
        var canvas = document.getElementById('process-canvas');
        if (!canvas) return;
        var ctx = canvas.getContext('2d');
        canvas.width = W;
        canvas.height = H;

        var halfW = Math.floor(W / 2) - 1;

        // === 左半：当前参数模拟 ===
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, halfW, H);
        ctx.clip();
        renderFullSimulation(ctx, halfW, H, params);
        ctx.restore();

        // === 右半：传统参考 ===
        var dye = DYE_DATA[params.dye];
        var idealParams = {
            dye: params.dye,
            temperature: (dye.optimalTemp[0] + dye.optimalTemp[1]) / 2,
            concentration: (dye.optimalConc[0] + dye.optimalConc[1]) / 2,
            time: 60,
            dips: 5
        };

        ctx.save();
        ctx.beginPath();
        ctx.rect(halfW + 2, 0, halfW, H);
        ctx.clip();

        var color = calculateDyeColor(idealParams);
        drawFabricBase(ctx, halfW, H);

        ctx.globalAlpha = 0.82;
        ctx.fillStyle = rgbToHex(color.r, color.g, color.b);
        ctx.fillRect(halfW + 2, 0, halfW, H);
        ctx.globalAlpha = 1;

        for (var i = 0; i < 4; i++) {
            var cx = halfW + 2 + halfW * (0.2 + i * 0.2);
            var cy = H * (0.3 + (i % 2) * 0.4);
            var r = 150;
            var grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
            var a = 0.025 + seededRandom(i * 41) * 0.035;
            grad.addColorStop(0, 'rgba(' + color.r + ',' + color.g + ',' + color.b + ',' + a + ')');
            grad.addColorStop(1, 'rgba(' + color.r + ',' + color.g + ',' + color.b + ',0)');
            ctx.fillStyle = grad;
            ctx.fillRect(halfW + 2, 0, halfW, H);
        }
        ctx.restore();

        // 织物细节（右半）
        ctx.save();
        ctx.beginPath();
        ctx.rect(halfW + 2, 0, halfW, H);
        ctx.clip();
        drawFabricDetail(ctx, W, H);
        ctx.restore();

        // === 中间分隔线 ===
        ctx.save();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.moveTo(halfW + 1, 0);
        ctx.lineTo(halfW + 1, H);
        ctx.stroke();
        ctx.restore();

        // === 标注 ===
        ctx.save();
        ctx.font = 'bold 15px "Noto Serif SC", serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';

        // 左标注
        var leftLabel = '当前参数';
        var lw = ctx.measureText(leftLabel).width + 20;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(halfW / 2 - lw / 2, H - 42, lw, 28);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(leftLabel, halfW / 2, H - 20);

        // 右标注
        var rightLabel = '传统标准';
        var rw = ctx.measureText(rightLabel).width + 20;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(halfW + 2 + halfW / 2 - rw / 2, H - 42, rw, 28);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(rightLabel, halfW + 2 + halfW / 2, H - 20);

        ctx.restore();
    }

    /* ========== 7. 工艺流程动画 ========== */

    function animateFlowSteps(onComplete) {
        var steps = document.querySelectorAll('.flow-step');
        if (!steps.length) {
            if (onComplete) onComplete();
            return;
        }

        // 清除之前状态
        steps.forEach(function (el) {
            el.classList.remove('active', 'completed');
        });

        var stepDurations = [400, 400, 2000, 400, 400]; // 第3步最长
        var index = 0;
        var totalDelay = 0;

        function activateStep() {
            if (index >= steps.length) {
                // 全部完成
                steps.forEach(function (el) {
                    el.classList.remove('active');
                    el.classList.add('completed');
                });
                if (onComplete) onComplete();
                return;
            }

            // 前面的标记为 completed
            for (var j = 0; j < index; j++) {
                steps[j].classList.remove('active');
                steps[j].classList.add('completed');
            }
            // 当前标记为 active
            steps[index].classList.add('active');

            var dur = stepDurations[index] || 400;
            totalDelay += dur;
            index++;

            setTimeout(activateStep, dur);
        }

        setTimeout(activateStep, 100);
    }

    /* ========== 8. 参数面板 ========== */

    function updateRangeIndicator(slider, valEl, optMin, optMax) {
        var val = parseInt(slider.value, 10);
        valEl.textContent = val;

        // 移除旧的提示
        var oldHint = slider.parentNode.querySelector('.range-hint');
        if (oldHint) oldHint.remove();

        var hint = document.createElement('span');
        hint.className = 'range-hint';

        if (val >= optMin && val <= optMax) {
            hint.textContent = ' [推荐区间]';
            hint.style.color = '#4caf50';
            hint.style.fontSize = '11px';
        } else {
            hint.textContent = ' [偏离推荐]';
            hint.style.color = '#ff9800';
            hint.style.fontSize = '11px';
        }

        slider.parentNode.appendChild(hint);
    }

    function initParams() {
        var tempSlider = document.getElementById('temp-slider');
        var concSlider = document.getElementById('conc-slider');
        var timeSlider = document.getElementById('time-slider');
        var dipSlider = document.getElementById('dip-slider');
        var tempVal = document.getElementById('temp-val');
        var concVal = document.getElementById('conc-val');
        var timeVal = document.getElementById('time-val');
        var dipVal = document.getElementById('dip-val');

        function getCurrentDye() {
            return ProcessSim.currentParams.dye;
        }

        function updateDisplays() {
            var dye = DYE_DATA[getCurrentDye()];
            updateRangeIndicator(tempSlider, tempVal, dye.optimalTemp[0], dye.optimalTemp[1]);
            updateRangeIndicator(concSlider, concVal, dye.optimalConc[0], dye.optimalConc[1]);
            timeVal.textContent = timeSlider.value;
            dipVal.textContent = dipSlider.value;

            // 更新染料信息显示
            var nameEl = document.querySelector('.dye-name-display');
            var descEl = document.querySelector('.dye-desc-display');
            var formulaEl = document.querySelector('.dye-formula-display');
            if (nameEl) nameEl.textContent = dye.name;
            if (descEl) descEl.textContent = dye.description;
            if (formulaEl) formulaEl.textContent = dye.formula;

            // 更新染料色块预览
            var swatch = document.querySelector('.dye-swatch');
            if (swatch) swatch.style.backgroundColor = dye.baseColor;
        }

        // 滑块事件
        if (tempSlider) {
            tempSlider.addEventListener('input', function () {
                ProcessSim.currentParams.temperature = parseInt(tempSlider.value, 10);
                updateDisplays();
            });
        }
        if (concSlider) {
            concSlider.addEventListener('input', function () {
                ProcessSim.currentParams.concentration = parseInt(concSlider.value, 10);
                updateDisplays();
            });
        }
        if (timeSlider) {
            timeSlider.addEventListener('input', function () {
                ProcessSim.currentParams.time = parseInt(timeSlider.value, 10);
                updateDisplays();
            });
        }
        if (dipSlider) {
            dipSlider.addEventListener('input', function () {
                ProcessSim.currentParams.dips = parseInt(dipSlider.value, 10);
                updateDisplays();
            });
        }

        // 染料按钮
        var dyeBtns = document.querySelectorAll('.dye-btn');
        dyeBtns.forEach(function (btn) {
            btn.addEventListener('click', function () {
                var dyeKey = btn.getAttribute('data-dye');
                if (!dyeKey || !DYE_DATA[dyeKey]) return;

                dyeBtns.forEach(function (b) { b.classList.remove('active'); });
                btn.classList.add('active');

                ProcessSim.currentParams.dye = dyeKey;
                updateDisplays();
            });
        });

        // 初始渲染
        updateDisplays();
    }

    /* ========== 9. 预览标签切换 ========== */

    function initPreviewTabs() {
        var tabs = document.querySelectorAll('.preview-tab');
        tabs.forEach(function (tab) {
            tab.addEventListener('click', function () {
                var target = tab.getAttribute('data-ptab');
                tabs.forEach(function (t) { t.classList.remove('active'); });
                tab.classList.add('active');

                var params = ProcessSim.currentParams;

                if (target === 'simulated') {
                    renderStaticSimulation(params);
                } else if (target === 'traditional') {
                    renderTraditionalReference(params.dye);
                } else if (target === 'compare') {
                    renderComparison(params);
                }
            });
        });
    }

    /** 静态模拟渲染（无动画） */
    function renderStaticSimulation(params) {
        var canvas = document.getElementById('process-canvas');
        if (!canvas) return;
        var ctx = canvas.getContext('2d');
        canvas.width = W;
        canvas.height = H;
        renderFullSimulation(ctx, W, H, params);
    }

    /* ========== 10. 显示结果摘要 ========== */

    function showResultInfo(color, params) {
        var dye = DYE_DATA[params.dye];
        var infoEl = document.getElementById('process-info');
        if (!infoEl) return;

        var hexStr = rgbToHex(color.r, color.g, color.b);
        var intensityPct = Math.round(color.intensity * 100);

        // 工艺评估
        var optTemp = dye.optimalTemp;
        var tempMid = (optTemp[0] + optTemp[1]) / 2;
        var tempScore = Math.max(0, 1 - Math.abs(params.temperature - tempMid) / ((optTemp[1] - optTemp[0]) / 2 * 2));
        var optConc = dye.optimalConc;
        var concMid = (optConc[0] + optConc[1]) / 2;
        var concScore = Math.max(0, 1 - Math.abs(params.concentration - concMid) / ((optConc[1] - optConc[0]) / 2 * 2));

        var overallScore = Math.round((tempScore * 0.4 + concScore * 0.3 + Math.min(params.dips / 5, 1) * 0.2 + (intensityPct / 100) * 0.1) * 100);

        var rating;
        if (overallScore >= 85) rating = '优秀';
        else if (overallScore >= 70) rating = '良好';
        else if (overallScore >= 50) rating = '一般';
        else rating = '需调整';

        infoEl.innerHTML =
            '<div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">' +
            '<div style="width:32px;height:32px;border-radius:4px;background:' + hexStr + ';border:1px solid rgba(0,0,0,0.15);"></div>' +
            '<span style="font-weight:600;">' + dye.name + ' · ' + hexStr + '</span>' +
            '</div>' +
            '<div style="font-size:13px;color:#666;line-height:1.8;">' +
            '着色强度：<strong>' + intensityPct + '%</strong> &nbsp;|&nbsp; ' +
            '工艺评分：<strong>' + overallScore + '分（' + rating + '）</strong><br>' +
            '温度参数 ' + params.temperature + '°C · 浓度 ' + params.concentration + '% · ' +
            '时间 ' + params.time + 'min · 浸染 ' + params.dips + '次' +
            '</div>';
    }

    /* ========== 11. init() ========== */

    function init() {
        initParams();
        initPreviewTabs();

        // "开始模拟"按钮
        var startBtn = document.querySelector('#start-sim-btn');
        if (startBtn) {
            startBtn.addEventListener('click', function () {
                var canvas = document.getElementById('process-canvas');
                if (!canvas) return;
                var ctx = canvas.getContext('2d');
                canvas.width = W;
                canvas.height = H;

                var params = Object.assign({}, ProcessSim.currentParams);

                // 启动流程动画
                animateFlowSteps(function () {
                    // 流程完成后，不做额外操作（动画已在第3步期间完成）
                });

                // 启动染色动画
                animateDyeing(ctx, W, H, params, function (color) {
                    showResultInfo(color, params);
                });

                // 切换到模拟标签
                var tabs = document.querySelectorAll('.preview-tab');
                tabs.forEach(function (t) { t.classList.remove('active'); });
                var simTab = document.querySelector('.preview-tab[data-ptab="simulated"]');
                if (simTab) simTab.classList.add('active');
            });
        }

        // 初始渲染
        renderStaticSimulation(ProcessSim.currentParams);
    }

    /* ========== 12. 暴露到全局 ========== */

    window.ProcessSim = {
        init: init,
        currentParams: { dye: 'indigo', temperature: 60, concentration: 60, time: 30, dips: 3 },
        DYE_DATA: DYE_DATA,
        simulateDyeing: calculateDyeColor,
        renderTraditionalReference: renderTraditionalReference,
        renderComparison: renderComparison,
        animateFlowSteps: animateFlowSteps,
        _renderStaticSimulation: renderStaticSimulation,
        _hexToRgb: hexToRgb
    };

})();
