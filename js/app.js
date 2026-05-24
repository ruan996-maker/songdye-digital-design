/**
 * 宋染非遗数字设计系统 - 应用入口
 * 负责：模块路由切换、EventBus 事件总线、模块初始化
 */

(function() {
    'use strict';

    // ========== EventBus 全局事件总线 ==========
    window.EventBus = {
        _listeners: {},
        on(event, callback) {
            if (!this._listeners[event]) this._listeners[event] = [];
            this._listeners[event].push(callback);
        },
        off(event, callback) {
            if (!this._listeners[event]) return;
            this._listeners[event] = this._listeners[event].filter(cb => cb !== callback);
        },
        emit(event, data) {
            if (!this._listeners[event]) return;
            this._listeners[event].forEach(cb => {
                try { cb(data); } catch (e) { console.error('EventBus error:', e); }
            });
        }
    };

    // ========== 模块路由 ==========
    const modules = ['pattern', 'color', 'process', 'preview'];
    let currentModule = 'pattern';
    const initialized = {};

    function switchModule(moduleName) {
        if (!modules.includes(moduleName)) return;
        currentModule = moduleName;

        // 更新导航标签
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.module === moduleName);
        });

        // 更新模块显示
        document.querySelectorAll('.module').forEach(section => {
            section.classList.toggle('active', section.id === 'module-' + moduleName);
        });

        // 延迟初始化模块（首次切换时才初始化）
        if (!initialized[moduleName]) {
            initialized[moduleName] = true;
            switch (moduleName) {
                case 'pattern':
                    if (window.PatternLib && window.PatternLib.init) window.PatternLib.init();
                    break;
                case 'color':
                    if (window.ColorEngine && window.ColorEngine.init) window.ColorEngine.init();
                    break;
                case 'process':
                    if (window.ProcessSim && window.ProcessSim.init) window.ProcessSim.init();
                    break;
                case 'preview':
                    if (window.Preview3D && window.Preview3D.init) window.Preview3D.init();
                    break;
            }
        }

        // 通知模块切换
        EventBus.emit('module-changed', { module: moduleName });

        // 切换到预览模块时刷新纹样下拉框
        if (moduleName === 'preview') {
            updatePreviewPatternSelect();
        }
    }

    // ========== 导航绑定 ==========
    function bindNavigation() {
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', function() {
                switchModule(this.dataset.module);
            });
        });
    }

    // ========== 模块间数据联通 ==========

    // 纹样选中 → 更新3D预览的纹样下拉（监听 DOM 自定义事件）
    document.addEventListener('pattern-selected', function() {
        updatePreviewPatternSelect();
    });

    // 配色选中 → 可供纹样模块使用
    EventBus.on('color-selected', function(data) {
        // 预留接口
    });

    // 更新3D预览模块的纹样选择下拉
    function updatePreviewPatternSelect() {
        const select = document.getElementById('preview-pattern-select');
        if (!select) return;
        const currentVal = select.value;
        select.innerHTML = '<option value="">请先从图库选择纹样</option>';

        if (window.PatternLib && window.PatternLib.patternData) {
            window.PatternLib.patternData.forEach((p, i) => {
                const opt = document.createElement('option');
                opt.value = i;
                opt.textContent = p.name;
                select.appendChild(opt);
            });
        }

        // 恢复之前的选择
        if (currentVal) select.value = currentVal;
    }

    // ========== 初始化 ==========
    function init() {
        bindNavigation();

        // 默认初始化第一个模块
        initialized[currentModule] = true;
        if (window.PatternLib && window.PatternLib.init) {
            window.PatternLib.init();
        }

        // 统计信息
        console.log('宋染数字设计系统已启动');
        console.log('模块:', modules.join(', '));
    }

    // DOM Ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
