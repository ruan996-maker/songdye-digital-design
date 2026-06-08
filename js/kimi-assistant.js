/**
 * Kimi AI 设计助手模块
 * 基于月之暗面 Kimi API (OpenAI 兼容格式)
 * 为宋染非遗数字设计系统提供智能设计辅助
 */
(function () {
  'use strict';

  /* ==================== 配置 ==================== */
  var API_BASE = 'https://api.moonshot.cn/v1/chat/completions';
  var DEFAULT_MODEL = 'moonshot-v1-8k';

  /* ==================== 状态 ==================== */
  var state = {
    apiKey: '',
    proxyUrl: '',       // CORS 代理地址（留空则直连，如 'https://your-worker.your-name.workers.dev'）
    model: DEFAULT_MODEL,
    conversations: [],   // [{role, content}]
    isStreaming: false,
    currentModule: 'pattern', // pattern / color / process / preview
    contextData: {}       // 当前模块的上下文数据
  };

  /* ==================== 各模块的系统提示词 ==================== */
  var MODULE_PROMPTS = {
    pattern: [
      '你是「宋染非遗数字设计系统」的 AI 设计助手，专精于传统宋染纹样设计领域。',
      '你拥有深厚的中国传统纹样学知识，熟悉缠枝纹、云纹、龟背纹、水波纹、回纹、梅花纹等各类传统纹样的历史渊源、文化寓意和构图规律。',
      '你也精通植物染色工艺，了解靛蓝、茜红、槐黄、茶褐、紫草、栀子等传统染料的特性与搭配。',
      '你的任务是帮助用户进行纹样设计创作，包括但不限于：',
      '  - 纹样创意构思与灵感启发',
      '  - 传统纹样元素的解读与运用指导',
      '  - 纹样配色建议（基于传统染料色谱）',
      '  - 纹样文化寓意解读',
      '  - 程序化纹样生成参数建议',
      '回复时请结合中国传统文化美学，语言优雅得体，兼顾专业性与可读性。',
      '如果用户的问题超出了纹样设计或植物染色领域，可以礼貌地引导回相关话题。'
    ].join('\n'),
    color: [
      '你是「宋染非遗数字设计系统」的 AI 配色顾问，专精于传统植物染料配色领域。',
      '你精通以下六种传统植物染料的色谱特性与应用：',
      '  - 靛蓝（#2c5f7c）：从蓝草中提取，是中国最古老的染料之一',
      '  - 茜红（#b5433a）：从茜草根中提取，色泽温润典雅',
      '  - 槐黄（#8b6914）：从槐花中提取，明亮而沉稳',
      '  - 茶褐（#5c4033）：从茶叶或五倍子中提取，自然古朴',
      '  - 紫草（#6b3a6b）：从紫草根中提取，高贵神秘',
      '  - 栀子（#c4a035）：从栀子果实中提取，温暖明亮',
      '你擅长基于色彩理论的配色方案推荐，包括同类色、互补色、三角配色、分裂互补等方案。',
      '你的任务是帮助用户：',
      '  - 根据设计意图推荐合适的传统染料配色方案',
      '  - 解读不同配色组合的文化寓意和适用场景',
      '  - 评估配色和谐度并给出优化建议',
      '  - 结合季节、节日、使用场景提供主题配色',
      '回复时请引用具体的传统染料名称和色值，用专业但易懂的语言。'
    ].join('\n'),
    process: [
      '你是「宋染非遗数字设计系统」的 AI 工艺顾问，专精于传统植物染色工艺技术。',
      '你精通传统植物染色的完整工艺流程，包括：',
      '  - 退浆：去除织物上的浆料，使纤维更容易吸收染液',
      '  - 漂白：使用天然漂白剂（如草木灰水）去除天然色素',
      '  - 染色：将织物浸入染液，通过温度、浓度、时间和次数控制上色效果',
      '  - 水洗：去除浮色，使色彩更加牢固',
      '  - 固色：使用媒染剂（如明矾、铁媒等）固定染料分子',
      '  - 晾干：自然晾晒，避免暴晒导致褪色',
      '你了解各传统染料（靛蓝、茜红、槐黄、茶褐、紫草、栀子）的最佳工艺参数范围，',
      '包括温度（20-100°C）、浓度（10-100%）、浸染时长（1-120分钟）和染色次数（1-10次）。',
      '你的任务是帮助用户：',
      '  - 根据目标效果推荐最佳的工艺参数组合',
      '  - 解读不同参数对染色效果的具体影响',
      '  - 解决染色过程中常见的色彩问题（色差、不均匀、褪色等）',
      '  - 推荐适合的染料与媒染剂组合',
      '回复时请提供具体的参数建议和操作步骤，语言简洁实用。'
    ].join('\n'),
    preview: [
      '你是「宋染非遗数字设计系统」的 AI 产品设计顾问，专精于文创产品设计与纹样应用。',
      '你了解当前系统支持的产品类型：围巾、T恤、团扇、书签，以及多种纹样渲染模式（平铺/拉伸/形状包围）。',
      '你擅长将传统宋染纹样与现代文创产品设计相结合，具有敏锐的设计美感。',
      '你的任务是帮助用户：',
      '  - 根据产品类型推荐合适的纹样和配色方案',
      '  - 分析纹样在产品上的视觉效果（平铺/拉伸/形状包围哪种更佳）',
      '  - 提供产品规格与纹样尺寸的建议',
      '  - 推荐适合的形状包围类型（圆形/菱形/六边形等）和排列方式',
      '  - 结合目标受众（年龄、性别、场景）给出产品设计方向',
      '  - 解读纹样在不同产品上的文化内涵与市场价值',
      '回复时请结合具体的产品特点和纹样特性，给出可操作的设计建议。'
    ].join('\n')
  };

  /* ==================== 快捷指令模板 ==================== */
  var QUICK_ACTIONS = {
    pattern: [
      { label: '纹样灵感', prompt: '请为我提供3个宋染风格的纹样创意灵感，适合用于围巾设计。' },
      { label: '解读纹样', prompt: '请帮我解读缠枝牡丹纹的文化寓意和构图特点。' },
      { label: '配色建议', prompt: '请为传统云纹推荐2组基于传统植物染料的配色方案。' }
    ],
    color: [
      { label: '季节配色', prompt: '请推荐一组适合秋季的植物染料配色方案，用于文创产品设计。' },
      { label: '节日主题', prompt: '请推荐一组适合春节主题的喜庆配色方案，基于传统染料色谱。' },
      { label: '配色评估', prompt: '请评估靛蓝+茜红+栀子的配色方案，分析其和谐度和适用场景。' }
    ],
    process: [
      { label: '靛蓝工艺', prompt: '请推荐靛蓝染料染制纯棉围巾的最佳工艺参数组合。' },
      { label: '故障排除', prompt: '染色后出现色差和不均匀的问题，可能的原因和解决方案是什么？' },
      { label: '工艺优化', prompt: '如何通过调整工艺参数让茜红染色更加均匀饱满？' }
    ],
    preview: [
      { label: '产品选型', prompt: '我想要设计一款具有传统文化特色的文创产品，请推荐合适的产品类型和纹样搭配。' },
      { label: '渲染建议', prompt: '围巾上使用植物染色纹样，平铺、拉伸和形状包围哪种渲染模式效果更好？' },
      { label: '规格参考', prompt: '请提供围巾、T恤、团扇、书签的标准产品规格参考（宽×高×厚度）。' }
    ]
  };

  /* ==================== API 调用 ==================== */

  /**
   * 发送消息到 Kimi API（流式）
   * @param {Array} messages - [{role, content}]
   * @param {Function} onChunk - 收到文本片段回调
   * @param {Function} onDone - 完成回调
   * @param {Function} onError - 错误回调
   */
  function streamChat(messages, onChunk, onDone, onError) {
    if (!state.apiKey) {
      onError({ message: '请先设置 Kimi API Key' });
      return;
    }
    if (state.isStreaming) return;

    state.isStreaming = true;
    updateUI('streaming-start');

    // 构建完整消息列表
    var systemPrompt = MODULE_PROMPTS[state.currentModule] || MODULE_PROMPTS.pattern;
    var fullMessages = [{ role: 'system', content: systemPrompt }].concat(messages);

    // 如果有上下文数据，附加到最后一条用户消息
    var ctxText = buildContextText();
    if (ctxText && fullMessages.length > 0) {
      var lastMsg = fullMessages[fullMessages.length - 1];
      if (lastMsg.role === 'user') {
        lastMsg.content = lastMsg.content + '\n\n【当前设计上下文】\n' + ctxText;
      }
    }

    // 检查 API Key 格式
    if (!/^(sk-)[A-Za-z0-9]{20,}$/.test(state.apiKey)) {
      state.isStreaming = false;
      updateUI('error');
      onError({ message: 'API Key 格式不正确，应为 sk- 开头的字符串（从 platform.moonshot.cn 获取）' });
      return;
    }

    // 构建请求 URL（支持 CORS 代理）
    var apiUrl = API_BASE;
    if (state.proxyUrl) {
      apiUrl = state.proxyUrl.replace(/\/+$/, '') + '/' + API_BASE;
    }

    fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + state.apiKey
      },
      body: JSON.stringify({
        model: state.model,
        messages: fullMessages,
        stream: true,
        stream_options: { include_usage: true }
      })
    }).then(function (response) {
      if (!response.ok) {
        return response.text().then(function (body) {
          var errMsg = '请求失败 (HTTP ' + response.status + ')';
          try {
            var data = JSON.parse(body);
            if (data.error && data.error.message) errMsg = data.error.message;
          } catch (e) { /* 非 JSON 响应体 */ }
          if (response.status === 401) {
            errMsg = 'API Key 无效或已过期，请在 platform.moonshot.cn 重新获取';
          } else if (response.status === 403) {
            errMsg = 'API Key 权限不足，请确认账户状态';
          } else if (response.status === 429) {
            errMsg = '请求频率超限，请稍后再试';
          }
          throw new Error(errMsg);
        });
      }

      var reader = response.body.getReader();
      var decoder = new TextDecoder('utf-8');
      var buffer = '';
      var fullContent = '';

      function read() {
        reader.read().then(function (result) {
          if (result.done) {
            state.isStreaming = false;
            updateUI('streaming-end', fullContent);
            if (onDone) onDone(fullContent);
            return;
          }

          buffer += decoder.decode(result.value, { stream: true });
          var lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (var i = 0; i < lines.length; i++) {
            var trimmed = lines[i].trim();
            if (!trimmed || trimmed === 'data: [DONE]') continue;
            if (trimmed.indexOf('data: ') === 0) {
              try {
                var chunk = JSON.parse(trimmed.slice(6));
                var delta = chunk.choices && chunk.choices[0] && chunk.choices[0].delta;
                if (delta && delta.content) {
                  fullContent += delta.content;
                  if (onChunk) onChunk(delta.content, fullContent);
                }
              } catch (e) {
                // 跳过解析失败的 chunk
              }
            }
          }

          read();
        }).catch(function (err) {
          state.isStreaming = false;
          updateUI('streaming-end', fullContent);
          if (onError) onError(err);
        });
      }

      read();
    }).catch(function (err) {
      state.isStreaming = false;
      updateUI('error');
      var msg = err.message || '未知错误';
      if (msg === 'Failed to fetch' || msg === 'NetworkError' || msg === 'TypeError') {
        msg = '网络请求失败。如果确认 API Key 正确，可能需要配置 CORS 代理（在设置中填写代理地址）';
      }
      if (onError) onError({ message: msg });
    });
  }

  /**
   * 构建当前设计上下文文本
   */
  function buildContextText() {
    var parts = [];

    // 当前模块信息
    var moduleNames = { pattern: '纹样图库', color: '智能配色', process: '工艺模拟', preview: '3D产品预览' };
    parts.push('当前所在模块：' + (moduleNames[state.currentModule] || state.currentModule));

    // 从各模块获取上下文
    try {
      if (state.currentModule === 'pattern' && window.PatternLib) {
        var sel = window.PatternLib.selectedPattern;
        if (sel != null) {
          parts.push('当前选中纹样：' + (sel.name || '未命名'));
        }
        var pats = window.PatternLib.patternData;
        if (pats && pats.length) {
          parts.push('纹样库总数：' + pats.length + '个');
        }
      }
    } catch (e) {}

    try {
      if (state.currentModule === 'color' && window.ColorEngine) {
        var colors = window.ColorEngine.getPrimaryColor && window.ColorEngine.getPrimaryColor();
        if (colors) {
          parts.push('当前主色：' + colors);
        }
      }
    } catch (e) {}

    try {
      if (state.currentModule === 'process' && window.ProcessSim) {
        var pState = window.ProcessSim.getState && window.ProcessSim.getState();
        if (pState) {
          parts.push('当前染料：' + (pState.dyeName || '未知'));
          parts.push('温度：' + (pState.temperature || '-') + '°C');
          parts.push('浓度：' + (pState.concentration || '-') + '%');
          parts.push('时长：' + (pState.duration || '-') + '分钟');
          parts.push('次数：' + (pState.times || '-') + '次');
        }
      }
    } catch (e) {}

    try {
      if (state.currentModule === 'preview' && window.Preview3D) {
        var p3State = window.Preview3D.getState && window.Preview3D.getState();
        if (p3State) {
          var prodNames = { scarf: '围巾', tshirt: 'T恤', fan: '团扇', bookmark: '书签' };
          parts.push('当前产品：' + (prodNames[p3State.product] || p3State.product));
          parts.push('渲染模式：' + (p3State.fillMode || '平铺'));
          if (p3State.showDimensions) {
            parts.push('规格标注已开启');
          }
        }
      }
    } catch (e) {}

    // 追加额外的上下文数据
    if (state.contextData) {
      var keys = Object.keys(state.contextData);
      for (var i = 0; i < keys.length; i++) {
        parts.push(keys[i] + '：' + state.contextData[keys[i]]);
      }
    }

    return parts.length > 1 ? parts.join('\n') : '';
  }

  /* ==================== 消息管理 ==================== */

  function addUserMessage(text) {
    state.conversations.push({ role: 'user', content: text });
    renderMessages();
  }

  function addAssistantMessage(text) {
    state.conversations.push({ role: 'assistant', content: text });
  }

  function clearConversations() {
    state.conversations = [];
    renderMessages();
  }

  /**
   * 发送用户消息
   */
  function sendMessage(text) {
    if (!text || !text.trim()) return;
    if (state.isStreaming) return;

    text = text.trim();
    addUserMessage(text);

    var messages = state.conversations.slice();
    streamChat(
      messages,
      function (chunk, full) {
        // 流式回调：更新显示
        updateStreamingMessage(full);
      },
      function (fullContent) {
        addAssistantMessage(fullContent);
        renderMessages();
      },
      function (err) {
        addAssistantMessage('抱歉，请求出现错误：' + (err.message || '未知错误'));
        renderMessages();
      }
    );
  }

  /**
   * 停止当前流式输出
   */
  function stopStreaming() {
    state.isStreaming = false;
    updateUI('streaming-stop');
  }

  /* ==================== UI 渲染 ==================== */

  function getEl(id) {
    return document.getElementById(id);
  }

  /**
   * 渲染聊天消息列表
   */
  function renderMessages() {
    var container = getEl('kimi-messages');
    if (!container) return;

    if (state.conversations.length === 0) {
      container.innerHTML = '<div class="kimi-welcome">' +
        '<div class="kimi-welcome-icon">&#x1F3A8;</div>' +
        '<div class="kimi-welcome-title">AI 设计助手</div>' +
        '<div class="kimi-welcome-desc">基于 Kimi 大模型，为宋染非遗设计提供智能辅助</div>' +
        '<div class="kimi-welcome-hints">' +
        getQuickActionHTML() +
        '</div></div>';
      return;
    }

    var html = '';
    for (var i = 0; i < state.conversations.length; i++) {
      var msg = state.conversations[i];
      var isUser = msg.role === 'user';
      html += '<div class="kimi-msg ' + (isUser ? 'kimi-msg-user' : 'kimi-msg-assistant') + '">';
      if (!isUser) {
        html += '<div class="kimi-msg-avatar">AI</div>';
      }
      html += '<div class="kimi-msg-bubble">' + escapeHtml(msg.content) + '</div>';
      if (isUser) {
        html += '<div class="kimi-msg-avatar">我</div>';
      }
      html += '</div>';
    }

    container.innerHTML = html;
    container.scrollTop = container.scrollHeight;
  }

  /**
   * 流式更新最后一条 AI 消息
   */
  function updateStreamingMessage(fullContent) {
    var container = getEl('kimi-messages');
    if (!container) return;

    // 如果还没有 streaming 消息气泡，创建一个
    var streamingBubble = container.querySelector('.kimi-streaming-bubble');
    if (!streamingBubble) {
      var msgDiv = document.createElement('div');
      msgDiv.className = 'kimi-msg kimi-msg-assistant';
      msgDiv.innerHTML = '<div class="kimi-msg-avatar">AI</div>' +
        '<div class="kimi-msg-bubble kimi-streaming-bubble"></div>';
      container.appendChild(msgDiv);
      streamingBubble = msgDiv.querySelector('.kimi-streaming-bubble');
    }

    streamingBubble.textContent = fullContent;
    container.scrollTop = container.scrollHeight;
  }

  /**
   * 获取快捷指令 HTML
   */
  function getQuickActionHTML() {
    var actions = QUICK_ACTIONS[state.currentModule] || QUICK_ACTIONS.pattern;
    var html = '';
    for (var i = 0; i < actions.length; i++) {
      html += '<button class="kimi-quick-btn" data-prompt="' +
        escapeAttr(actions[i].prompt) + '">' + actions[i].label + '</button>';
    }
    return html;
  }

  /**
   * 更新快捷指令按钮
   */
  function updateQuickActions() {
    var container = getEl('kimi-quick-actions');
    if (!container) return;
    container.innerHTML = getQuickActionHTML();

    // 绑定点击事件
    var btns = container.querySelectorAll('.kimi-quick-btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function () {
        var prompt = this.getAttribute('data-prompt');
        var input = getEl('kimi-input');
        if (input) {
          input.value = prompt;
          input.focus();
        }
      });
    }
  }

  /**
   * 更新 UI 状态
   */
  function updateUI(action, data) {
    var sendBtn = getEl('kimi-send-btn');
    var stopBtn = getEl('kimi-stop-btn');
    var input = getEl('kimi-input');
    var moduleLabel = getEl('kimi-module-label');

    switch (action) {
      case 'streaming-start':
        if (sendBtn) sendBtn.style.display = 'none';
        if (stopBtn) stopBtn.style.display = 'flex';
        if (input) input.disabled = true;
        break;
      case 'streaming-end':
      case 'streaming-stop':
        if (sendBtn) sendBtn.style.display = 'flex';
        if (stopBtn) stopBtn.style.display = 'none';
        if (input) input.disabled = false;
        break;
      case 'error':
        if (sendBtn) sendBtn.style.display = 'flex';
        if (stopBtn) stopBtn.style.display = 'none';
        if (input) input.disabled = false;
        break;
      case 'module-change':
        if (moduleLabel) {
          var names = { pattern: '纹样图库', color: '智能配色', process: '工艺模拟', preview: '3D产品预览' };
          moduleLabel.textContent = names[state.currentModule] || state.currentModule;
        }
        updateQuickActions();
        // 如果没有对话记录，更新欢迎页
        if (state.conversations.length === 0) {
          renderMessages();
        }
        break;
    }
  }

  /* ==================== API Key 管理 ==================== */

  function saveApiKey(key) {
    state.apiKey = key.trim();
    try {
      localStorage.setItem('songdye_kimi_key', state.apiKey);
    } catch (e) {}
    var input = getEl('kimi-api-key-input');
    var btn = getEl('kimi-save-key-btn');
    if (input) input.value = state.apiKey;
    if (btn) {
      btn.textContent = state.apiKey ? '已保存' : '保存';
      btn.classList.toggle('active', !!state.apiKey);
    }
    // 显示/隐藏聊天区域
    toggleKeyChatView();
  }

  function saveProxyUrl(url) {
    state.proxyUrl = url.trim();
    try {
      localStorage.setItem('songdye_kimi_proxy', state.proxyUrl);
    } catch (e) {}
    var input = getEl('kimi-proxy-input');
    if (input) input.value = state.proxyUrl;
  }

  function toggleKeyChatView() {
    var chatArea = getEl('kimi-chat-area');
    var keyArea = getEl('kimi-key-area');
    if (chatArea) chatArea.style.display = state.apiKey ? 'block' : 'none';
    if (keyArea) keyArea.style.display = state.apiKey ? 'none' : 'flex';
  }

  function loadApiKey() {
    try {
      state.apiKey = localStorage.getItem('songdye_kimi_key') || '';
      state.proxyUrl = localStorage.getItem('songdye_kimi_proxy') || '';
    } catch (e) {
      state.apiKey = '';
      state.proxyUrl = '';
    }
    return state.apiKey;
  }

  /* ==================== 面板开关 ==================== */

  function togglePanel() {
    var panel = getEl('kimi-assistant-panel');
    var toggleBtn = getEl('kimi-toggle-btn');
    if (!panel) return;

    var isOpen = panel.classList.contains('kimi-panel-open');
    if (isOpen) {
      panel.classList.remove('kimi-panel-open');
      if (toggleBtn) toggleBtn.classList.remove('kimi-btn-active');
    } else {
      panel.classList.add('kimi-panel-open');
      if (toggleBtn) toggleBtn.classList.add('kimi-btn-active');
      // 首次打开时聚焦输入
      setTimeout(function () {
        var input = getEl('kimi-input');
        if (input && !state.apiKey) input = getEl('kimi-api-key-input');
        if (input) input.focus();
      }, 300);
    }
  }

  /* ==================== 模块切换 ==================== */

  function setCurrentModule(module) {
    state.currentModule = module;
    state.contextData = {};
    updateUI('module-change');
  }

  /**
   * 设置额外上下文数据（供外部模块调用）
   */
  function setContextData(data) {
    state.contextData = data || {};
  }

  /* ==================== 工具函数 ==================== */

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ==================== 初始化 ==================== */

  function init() {
    // 加载 API Key
    loadApiKey();

    // 绑定面板开关
    var toggleBtn = getEl('kimi-toggle-btn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', togglePanel);
    }

    // 绑定关闭按钮
    var closeBtn = getEl('kimi-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', togglePanel);
    }

    // 绑定 API Key 保存
    var saveKeyBtn = getEl('kimi-save-key-btn');
    if (saveKeyBtn) {
      saveKeyBtn.addEventListener('click', function () {
        var input = getEl('kimi-api-key-input');
        if (input) saveApiKey(input.value);
      });
    }

    // 初始化 API Key 输入框
    var keyInput = getEl('kimi-api-key-input');
    if (keyInput) {
      keyInput.value = state.apiKey;
      keyInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          saveApiKey(this.value);
        }
      });
    }

    // 初始化 CORS 代理输入框
    var proxyInput = getEl('kimi-proxy-input');
    if (proxyInput) {
      proxyInput.value = state.proxyUrl;
      proxyInput.addEventListener('change', function () {
        saveProxyUrl(this.value);
      });
    }

    // 绑定代理设置按钮（齿轮图标）
    var proxyToggle = getEl('kimi-proxy-toggle');
    if (proxyToggle) {
      proxyToggle.addEventListener('click', function () {
        var box = getEl('kimi-proxy-box');
        if (box) {
          var isHidden = box.style.display === 'none';
          box.style.display = isHidden ? 'block' : 'none';
        }
      });
    }

    // 显示/隐藏聊天区域
    toggleKeyChatView();

    // 绑定发送按钮
    var sendBtn = getEl('kimi-send-btn');
    if (sendBtn) {
      sendBtn.addEventListener('click', function () {
        var input = getEl('kimi-input');
        if (input && input.value.trim()) {
          sendMessage(input.value);
          input.value = '';
        }
      });
    }

    // 绑定停止按钮
    var stopBtn = getEl('kimi-stop-btn');
    if (stopBtn) {
      stopBtn.addEventListener('click', stopStreaming);
    }

    // 绑定输入框回车
    var chatInput = getEl('kimi-input');
    if (chatInput) {
      chatInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          if (this.value.trim() && !state.isStreaming) {
            sendMessage(this.value);
            this.value = '';
          }
        }
      });
    }

    // 绑定清空按钮
    var clearBtn = getEl('kimi-clear-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', clearConversations);
    }

    // 绑定快捷指令
    updateQuickActions();

    // 监听模块切换事件
    if (window.EventBus) {
      window.EventBus.on('module-switched', function (module) {
        setCurrentModule(module);
      });
    }

    // 渲染初始欢迎消息
    renderMessages();

    // 更新模块标签
    updateUI('module-change');
  }

  /* ==================== 公共接口 ==================== */
  window.KimiAssistant = {
    init: init,
    sendMessage: sendMessage,
    stopStreaming: stopStreaming,
    togglePanel: togglePanel,
    setCurrentModule: setCurrentModule,
    setContextData: setContextData,
    clearConversations: clearConversations,
    saveApiKey: saveApiKey,
    saveProxyUrl: saveProxyUrl,
    getState: function () {
      return {
        apiKey: !!state.apiKey,
        proxyUrl: state.proxyUrl,
        module: state.currentModule,
        isStreaming: state.isStreaming,
        messageCount: state.conversations.length
      };
    }
  };

})();
