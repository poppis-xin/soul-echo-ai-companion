(function () {
  const APP_VERSION = window.AI_COMPANION_APP_VERSION || "20260607-cache03";
  const DEEPSEEK_CHAT_URL = "https://api.deepseek.com/chat/completions";
  const FREE_CHAT_URL = "./api/chat.php";
  const STORAGE_KEY = "ai-companion-settings";
  const SESSIONS_STORAGE_KEY = "ai-companion-chat-sessions";
  const MAX_SESSIONS = 40;
  const FREE_CHAT_LIMIT = 10;
  const VALID_MODELS = ["deepseek-v4-flash", "deepseek-v4-pro"];
  const SKILL_BASE_PATH = "./assets/skills/";
  const SKILL_MANIFEST_URL = withAppVersion(`${SKILL_BASE_PATH}manifest.json`);
  const DEFAULT_PERSONA_ID = "celeb_zhang_linghe";
  const LEGACY_DEFAULT_PERSONA_ID = "celeb_tian_xiwei";
  const DEFAULT_EMOTION_LEVEL = "正常使用颜文字、情绪标签和短反馈，让回复有陪伴感";
  const DEFAULT_REPLY_LENGTH = "回复适中，先回应情绪，再给具体建议";

  let personas = [];
  const customSelects = [];
  let notificationAcceptTimer = 0;

  const state = {
    selectedId: "",
    genderFilter: "女",
    currentSessionId: "",
    messages: [],
    loading: false
  };

  const els = {
    body: document.body,
    backdrop: document.getElementById("backdrop"),
    openDrawer: document.getElementById("openDrawer"),
    closeDrawer: document.getElementById("closeDrawer"),
    genderTabs: document.getElementById("genderTabs"),
    personaList: document.getElementById("personaList"),
    personaCount: document.getElementById("personaCount"),
    currentAvatar: document.getElementById("currentAvatar"),
    currentName: document.getElementById("currentName"),
    chatActions: document.querySelector(".chat-actions"),
    historyButton: document.getElementById("historyButton"),
    historyLayer: document.getElementById("historyLayer"),
    historyBackdrop: document.getElementById("historyBackdrop"),
    historyPanel: document.getElementById("historyPanel"),
    historyClose: document.getElementById("historyClose"),
    newSession: document.getElementById("newSession"),
    clearSessions: document.getElementById("clearSessions"),
    historyList: document.getElementById("historyList"),
    notificationArea: document.querySelector(".notification-area"),
    notificationButton: document.getElementById("notificationButton"),
    notificationLayer: document.getElementById("notificationLayer"),
    notificationBackdrop: document.getElementById("notificationBackdrop"),
    notificationMenu: document.getElementById("notificationMenu"),
    notificationAccept: document.getElementById("notificationAccept"),
    headerSettings: document.getElementById("headerSettings"),
    settingsMenu: document.getElementById("settingsMenu"),
    statusPill: document.getElementById("statusPill"),
    messages: document.getElementById("messages"),
    customName: document.getElementById("customName"),
    relationship: document.getElementById("relationship"),
    personality: document.getElementById("personality"),
    emotionLevel: document.getElementById("emotionLevel"),
    replyLength: document.getElementById("replyLength"),
    apiKey: document.getElementById("apiKey"),
    modelName: document.getElementById("modelName"),
    copyPrompt: document.getElementById("copyPrompt"),
    chatForm: document.getElementById("chatForm"),
    userInput: document.getElementById("userInput"),
    sendBtn: document.getElementById("sendBtn"),
    errorText: document.getElementById("errorText")
  };

  function withAppVersion(url) {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}v=${encodeURIComponent(APP_VERSION)}`;
  }

  async function loadSkillManifest() {
    const response = await fetch(SKILL_MANIFEST_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`角色清单加载失败：${response.status}`);
    }

    const manifest = await response.json();
    if (!Array.isArray(manifest.skills) || !manifest.skills.length) {
      throw new Error("角色清单为空，请检查 assets/skills/manifest.json。");
    }

    return manifest.skills;
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = false;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`角色 Skill 加载失败：${src}`));
      document.head.appendChild(script);
    });
  }

  async function loadPersonas() {
    window.AI_COMPANION_SKILLS = window.AI_COMPANION_SKILLS || {};
    const skillItems = await loadSkillManifest();

    for (const item of skillItems) {
      if (!item || !item.id || !item.file) {
        throw new Error("角色清单存在缺少 id 或 file 的条目。");
      }
      await loadScript(withAppVersion(`${SKILL_BASE_PATH}${item.file}`));
    }

    const registry = window.AI_COMPANION_SKILLS || {};
    personas = skillItems.map((item) => registry[item.id]).filter(Boolean);

    if (!personas.length) {
      throw new Error("没有加载到任何角色 Skill 文件。");
    }

    const defaultPersona = getDefaultPersona();
    state.selectedId = defaultPersona.id;
    state.genderFilter = defaultPersona.gender;
  }

  function getDefaultPersona() {
    return personas.find((item) => item.id === DEFAULT_PERSONA_ID) || personas[0];
  }

  function getPersona() {
    return personas.find((item) => item.id === state.selectedId) || getDefaultPersona();
  }

  function getSettings() {
    const persona = getPersona();
    return {
      name: els.customName.value.trim() || persona.name,
      relationship: els.relationship.value,
      personality: els.personality.value.trim(),
      emotionLevel: DEFAULT_EMOTION_LEVEL,
      replyLength: DEFAULT_REPLY_LENGTH,
      apiKey: els.apiKey.value.trim(),
      modelName: els.modelName.value.trim()
    };
  }

  function buildSystemPrompt() {
    const settings = getSettings();
    const persona = getPersona();

    return [
      `你现在扮演一个恋爱陪伴型 AI 角色，名字是「${settings.name}」。`,
      `关系设定：${settings.relationship}。`,
      `性格设定：${settings.personality || persona.personality}`,
      `表情规则：${settings.emotionLevel}。允许使用少量颜文字、情绪标签，比如 [安慰]、[撒娇]、[吃醋]。`,
      `回复长度：${settings.replyLength}。`,
      "对话风格：像真人即时聊天，先回应用户的真实感受，再自然延续恋爱陪伴氛围。",
      "边界：不要假装自己是现实中的真人，不要诱导用户做危险或极端行为，不要输出控制、PUA、骚扰或越界建议。"
    ].join("\n");
  }

  function saveSettings() {
    const data = {
      selectedId: state.selectedId,
      customName: els.customName.value,
      relationship: els.relationship.value,
      personality: els.personality.value,
      emotionLevel: els.emotionLevel.value,
      replyLength: els.replyLength.value,
      apiKey: els.apiKey.value,
      modelName: els.modelName.value
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function loadSettings() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    try {
      const data = JSON.parse(raw);
      const defaultPersona = getDefaultPersona();
      const shouldMigrateDefault = data.selectedId === LEGACY_DEFAULT_PERSONA_ID;
      state.selectedId = shouldMigrateDefault
        ? defaultPersona.id
        : personas.some((persona) => persona.id === data.selectedId)
        ? data.selectedId
        : defaultPersona.id;
      state.genderFilter = getPersona().gender;
      els.customName.value = shouldMigrateDefault ? "" : data.customName || "";
      els.relationship.value = shouldMigrateDefault ? defaultPersona.relationship : data.relationship || els.relationship.value;
      els.personality.value = shouldMigrateDefault ? "" : data.personality || "";
      els.emotionLevel.value = DEFAULT_EMOTION_LEVEL;
      els.replyLength.value = DEFAULT_REPLY_LENGTH;
      els.apiKey.value = data.apiKey || "";
      els.modelName.value = VALID_MODELS.includes(data.modelName)
        ? data.modelName
        : VALID_MODELS[0];
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  function createSessionId() {
    return `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function readSessions() {
    const raw = localStorage.getItem(SESSIONS_STORAGE_KEY);
    if (!raw) return [];

    try {
      const sessions = JSON.parse(raw);
      if (!Array.isArray(sessions)) return [];

      return sessions
        .filter((session) => session && session.id && Array.isArray(session.messages))
        .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
    } catch {
      localStorage.removeItem(SESSIONS_STORAGE_KEY);
      return [];
    }
  }

  function writeSessions(sessions) {
    localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions.slice(0, MAX_SESSIONS)));
  }

  function hasUserMessages(messages = state.messages) {
    return messages.some((message) => message.role === "user" && String(message.content || "").trim());
  }

  function getSessionTitle(messages = state.messages, persona = getPersona()) {
    const firstUserMessage = messages.find((message) => message.role === "user" && String(message.content || "").trim());
    if (!firstUserMessage) return `${persona.name}的新聊天`;

    const content = String(firstUserMessage.content).replace(/\s+/g, " ").trim();
    return content.length > 18 ? `${content.slice(0, 18)}...` : content;
  }

  function formatSessionTime(value) {
    const date = new Date(Number(value) || Date.now());
    return new Intl.DateTimeFormat("zh-CN", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function ensureCurrentSessionId() {
    if (!state.currentSessionId) {
      state.currentSessionId = createSessionId();
    }
    return state.currentSessionId;
  }

  function buildCurrentSession() {
    const persona = getPersona();
    const now = Date.now();
    const existing = readSessions().find((session) => session.id === state.currentSessionId);

    return {
      id: ensureCurrentSessionId(),
      title: getSessionTitle(state.messages, persona),
      personaId: persona.id,
      personaName: els.customName.value.trim() || persona.name,
      personaAvatar: persona.avatar,
      gender: persona.gender,
      relationship: els.relationship.value,
      personality: els.personality.value.trim() || persona.personality,
      messages: state.messages.map((message) => ({
        role: message.role,
        content: message.content
      })),
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };
  }

  function saveCurrentSession() {
    if (!hasUserMessages()) {
      renderHistoryList();
      return;
    }

    try {
      const session = buildCurrentSession();
      const nextSessions = [
        session,
        ...readSessions().filter((item) => item.id !== session.id)
      ];
      writeSessions(nextSessions);
      renderHistoryList();
    } catch {
      setError("浏览器本地历史保存失败，可能是本地存储空间已满。");
    }
  }

  function removeSession(sessionId) {
    const nextSessions = readSessions().filter((session) => session.id !== sessionId);
    writeSessions(nextSessions);
    if (state.currentSessionId === sessionId) {
      resetConversationWithGreeting();
      setError("");
    }
    renderHistoryList();
  }

  function clearAllSessions() {
    localStorage.removeItem(SESSIONS_STORAGE_KEY);
    resetConversationWithGreeting();
    setError("");
    renderHistoryList();
  }

  function sanitizeSessionMessages(messages, persona) {
    const safeMessages = messages
      .filter((message) => ["user", "assistant"].includes(message.role) && typeof message.content === "string")
      .map((message) => ({
        role: message.role,
        content: message.content
      }));

    return safeMessages.length ? safeMessages : [{ role: "assistant", content: persona.greeting }];
  }

  function loadHistorySession(sessionId) {
    const session = readSessions().find((item) => item.id === sessionId);
    if (!session) {
      renderHistoryList();
      return;
    }

    const persona = personas.find((item) => item.id === session.personaId) || getDefaultPersona();
    state.currentSessionId = session.id;
    state.selectedId = persona.id;
    state.genderFilter = persona.gender;
    state.messages = sanitizeSessionMessages(session.messages, persona);

    els.customName.value = session.personaName || persona.name;
    els.relationship.value = session.relationship || persona.relationship;
    els.personality.value = session.personality || persona.personality;
    els.emotionLevel.value = DEFAULT_EMOTION_LEVEL;
    els.replyLength.value = DEFAULT_REPLY_LENGTH;

    saveSettings();
    syncCustomSelects();
    renderPersonaList();
    renderHeader();
    renderMessages();
    setError("");
    setHistoryPanel(false);
  }

  function renderHistoryList() {
    if (!els.historyList) return;

    const sessions = readSessions();
    if (!sessions.length) {
      els.historyList.innerHTML = `
        <div class="history-empty">
          <strong>还没有历史会话</strong>
        </div>
      `;
      return;
    }

    els.historyList.innerHTML = sessions.map((session) => {
      const active = session.id === state.currentSessionId;
      const title = session.title || getSessionTitle(session.messages, getPersona());
      const personaName = session.personaName || session.personaId || "恋爱陪伴 AI";
      const avatar = session.personaAvatar || "♡";

      return `
        <article class="history-card ${active ? "active" : ""}" data-id="${escapeHtml(session.id)}">
          <button class="history-load" type="button" data-action="load" data-id="${escapeHtml(session.id)}">
            <span class="history-avatar">${escapeHtml(avatar)}</span>
            <span class="history-copy">
              <strong>${escapeHtml(title)}</strong>
              <span>${escapeHtml(personaName)} · ${escapeHtml(formatSessionTime(session.updatedAt))}</span>
            </span>
          </button>
          <button class="history-delete" type="button" data-action="delete" data-id="${escapeHtml(session.id)}" aria-label="删除这条历史">删除</button>
        </article>
      `;
    }).join("");
  }

  function getSelectedOptionLabel(select) {
    return select.selectedOptions?.[0]?.textContent || select.options?.[0]?.textContent || "";
  }

  function closeCustomSelects(exceptRoot) {
    customSelects.forEach(({ root, trigger }) => {
      if (root === exceptRoot) return;
      root.classList.remove("open");
      trigger.setAttribute("aria-expanded", "false");
    });
  }

  function syncCustomSelect(select) {
    const item = customSelects.find((selectItem) => selectItem.select === select);
    if (!item) return;

    item.label.textContent = getSelectedOptionLabel(select);
    item.options.forEach((optionButton) => {
      const active = optionButton.dataset.value === select.value;
      optionButton.classList.toggle("active", active);
      optionButton.setAttribute("aria-selected", active ? "true" : "false");
    });
  }

  function syncCustomSelects() {
    customSelects.forEach(({ select }) => syncCustomSelect(select));
  }

  function enhanceSelectControl(select) {
    if (!select || select.hidden || select.dataset.enhanced === "true") return;

    const field = select.closest(".field");
    if (!field) return;

    select.dataset.enhanced = "true";
    select.classList.add("enhanced-select-source");

    const root = document.createElement("div");
    root.className = "custom-select";
    root.dataset.for = select.id;

    const trigger = document.createElement("button");
    trigger.className = "select-trigger";
    trigger.type = "button";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");

    const label = document.createElement("span");
    label.textContent = getSelectedOptionLabel(select);
    trigger.appendChild(label);

    const menu = document.createElement("div");
    menu.className = "select-options";
    menu.setAttribute("role", "listbox");

    const options = Array.from(select.options).map((option) => {
      const optionButton = document.createElement("button");
      optionButton.className = "select-option";
      optionButton.type = "button";
      optionButton.dataset.value = option.value;
      optionButton.textContent = option.textContent;
      optionButton.setAttribute("role", "option");

      optionButton.addEventListener("click", () => {
        select.value = option.value;
        select.dispatchEvent(new Event("input", { bubbles: true }));
        select.dispatchEvent(new Event("change", { bubbles: true }));
        syncCustomSelect(select);
        closeCustomSelects();
      });

      menu.appendChild(optionButton);
      return optionButton;
    });

    trigger.addEventListener("click", (event) => {
      event.stopPropagation();
      const willOpen = !root.classList.contains("open");
      closeCustomSelects(root);
      root.classList.toggle("open", willOpen);
      trigger.setAttribute("aria-expanded", willOpen ? "true" : "false");
    });

    trigger.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeCustomSelects();
        trigger.focus();
      }
    });

    root.append(trigger, menu);
    select.insertAdjacentElement("afterend", root);
    customSelects.push({ select, root, trigger, label, options });
    syncCustomSelect(select);
  }

  function enhanceSelectControls() {
    enhanceSelectControl(els.relationship);
    enhanceSelectControl(els.modelName);
  }

  function renderPersonaList() {
    const filteredPersonas = personas.filter((persona) => persona.gender === state.genderFilter);
    els.personaCount.textContent = `${filteredPersonas.length} 个`;
    els.personaList.innerHTML = filteredPersonas.map((persona) => `
      <button class="persona-card ${persona.id === state.selectedId ? "active" : ""}" type="button" data-id="${escapeHtml(persona.id)}">
        <span class="avatar">${escapeHtml(persona.avatar)}</span>
        <span class="persona-name">${escapeHtml(persona.name)}</span>
        <span class="persona-mark" aria-hidden="true">✓</span>
      </button>
    `).join("");

    els.genderTabs.querySelectorAll(".gender-tab").forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.gender === state.genderFilter);
    });
  }

  function syncTheme(persona) {
    const gender = persona?.gender === "男" ? "male" : "female";
    els.body.classList.toggle("theme-male", gender === "male");
    els.body.classList.toggle("theme-female", gender === "female");
  }

  function renderHeader() {
    const persona = getPersona();
    const name = els.customName.value.trim() || persona.name;
    syncTheme(persona);
    els.currentAvatar.textContent = persona.avatar;
    els.currentName.textContent = name;
  }

  function renderMessages() {
    els.messages.innerHTML = state.messages.map((message, index) => `
      <article class="msg ${message.role}" data-message-index="${index}">
        <div class="bubble">${escapeHtml(message.content)}</div>
      </article>
    `).join("");

    if (state.loading) {
      els.messages.insertAdjacentHTML("beforeend", `
        <article class="msg assistant">
          <div class="typing" aria-label="正在回复"><i></i><i></i><i></i></div>
        </article>
      `);
    }

    els.messages.scrollTop = els.messages.scrollHeight;
  }

  function updateMessageContent(index) {
    const bubble = els.messages.querySelector(`[data-message-index="${index}"] .bubble`);
    if (!bubble || !state.messages[index]) return;
    bubble.textContent = state.messages[index].content;
    els.messages.scrollTop = els.messages.scrollHeight;
  }

  function resetConversationWithGreeting() {
    const persona = getPersona();
    state.currentSessionId = createSessionId();
    state.messages = [{ role: "assistant", content: persona.greeting }];
    renderMessages();
  }

  function applyPersonaDefaults(persona) {
    els.customName.value = persona.name;
    els.relationship.value = persona.relationship;
    els.personality.value = persona.personality;
    syncCustomSelects();
    saveSettings();
    renderHeader();
    resetConversationWithGreeting();
  }

  function setDrawer(open) {
    els.body.classList.toggle("drawer-open", open);
  }

  function setSettingsMenu(open) {
    if (!els.chatActions || !els.headerSettings) return;
    els.chatActions.classList.toggle("menu-open", open);
    els.headerSettings.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function setHistoryPanel(open) {
    if (!els.historyLayer || !els.historyButton) return;
    els.body.classList.toggle("history-open", open);
    els.historyLayer.setAttribute("aria-hidden", open ? "false" : "true");
    els.historyButton.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      closeCustomSelects();
      setNotificationMenu(false);
      setSettingsMenu(false);
      renderHistoryList();
    }
  }

  function stopNotificationAcceptTimer() {
    if (!notificationAcceptTimer) return;
    clearInterval(notificationAcceptTimer);
    notificationAcceptTimer = 0;
  }

  function startNotificationAcceptTimer() {
    if (!els.notificationAccept) return;

    stopNotificationAcceptTimer();
    let remaining = 3;
    els.notificationAccept.disabled = true;
    els.notificationAccept.textContent = `知道啦（${remaining} 秒）`;

    notificationAcceptTimer = setInterval(() => {
      remaining -= 1;
      if (remaining > 0) {
        els.notificationAccept.textContent = `知道啦（${remaining} 秒）`;
        return;
      }

      stopNotificationAcceptTimer();
      els.notificationAccept.disabled = false;
      els.notificationAccept.textContent = "知道啦";
    }, 1000);
  }

  function canDismissNotification() {
    return !els.body.classList.contains("notification-open")
      || !els.notificationAccept
      || !els.notificationAccept.disabled;
  }

  function setNotificationMenu(open) {
    if (!els.notificationArea || !els.notificationButton) return;
    els.notificationArea.classList.toggle("notification-open", open);
    els.body.classList.toggle("notification-open", open);
    els.notificationButton.setAttribute("aria-expanded", open ? "true" : "false");
    if (els.notificationLayer) {
      els.notificationLayer.setAttribute("aria-hidden", open ? "false" : "true");
    }
    if (open) {
      startNotificationAcceptTimer();
    } else {
      stopNotificationAcceptTimer();
    }
  }

  function setLoading(loading) {
    state.loading = loading;
    els.sendBtn.disabled = loading;
    els.statusPill.textContent = loading ? "正在回复" : "等待你开口";
    renderMessages();
  }

  function setError(text) {
    els.errorText.textContent = text || "";
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function autoGrowInput() {
    els.userInput.style.height = "auto";
    els.userInput.style.height = `${Math.min(132, els.userInput.scrollHeight)}px`;
  }

  function buildChatMessages() {
    const history = state.messages
      .filter((message) => message.role === "user" || message.role === "assistant")
      .slice(-14)
      .map((message) => ({
        role: message.role,
        content: message.content
      }));

    return [
      { role: "system", content: buildSystemPrompt() },
      ...history
    ];
  }

  function readSseDelta(block) {
    const lines = block.split(/\r?\n/).filter((line) => line.startsWith("data:"));
    let text = "";

    lines.forEach((line) => {
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") return;

      try {
        const data = JSON.parse(payload);
        const delta = data?.choices?.[0]?.delta?.content;
        if (typeof delta === "string") {
          text += delta;
        }
      } catch {
        // Ignore malformed SSE fragments and keep reading the stream.
      }
    });

    return text;
  }

  async function callModelStream(messages, onStart, onDelta) {
    const settings = getSettings();
    const useOwnKey = Boolean(settings.apiKey);
    const endpoint = useOwnKey ? DEEPSEEK_CHAT_URL : FREE_CHAT_URL;
    const headers = { "Content-Type": "application/json" };

    if (useOwnKey) {
      headers.Authorization = `Bearer ${settings.apiKey}`;
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: settings.modelName,
        messages,
        temperature: 0.82,
        stream: true
      })
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      const message = data?.error?.message || `接口请求失败：${response.status}`;
      throw new Error(message);
    }

    if (!response.body) {
      throw new Error("当前浏览器不支持读取流式响应。");
    }

    onStart();
    const freeRemaining = response.headers.get("X-Free-Quota-Remaining");
    if (!useOwnKey && freeRemaining !== null) {
      els.statusPill.textContent = `赠送剩余 ${freeRemaining}/${FREE_CHAT_LIMIT}`;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let receivedText = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\n\s*\n/);
      buffer = blocks.pop() || "";

      blocks.forEach((block) => {
        const delta = readSseDelta(block);
        if (!delta) return;
        receivedText += delta;
        onDelta(delta);
      });
    }

    if (buffer.trim()) {
      const delta = readSseDelta(buffer);
      if (delta) {
        receivedText += delta;
        onDelta(delta);
      }
    }

    if (!receivedText.trim()) {
      throw new Error("模型没有返回可展示的文本内容。");
    }
  }

  async function sendMessage(text) {
    const content = text.trim();
    if (!content || state.loading) return;

    setError("");
    state.messages.push({ role: "user", content });
    ensureCurrentSessionId();
    saveCurrentSession();
    const requestMessages = buildChatMessages();
    els.userInput.value = "";
    autoGrowInput();
    setLoading(true);

    let assistantIndex = -1;
    let streamStarted = false;
    try {
      await callModelStream(
        requestMessages,
        () => {
          streamStarted = true;
          state.loading = false;
          els.sendBtn.disabled = true;
          els.statusPill.textContent = "流式回复中";
          state.messages.push({ role: "assistant", content: "" });
          assistantIndex = state.messages.length - 1;
          renderMessages();
        },
        (delta) => {
          if (assistantIndex < 0) return;
          state.messages[assistantIndex].content += delta;
          updateMessageContent(assistantIndex);
        }
      );
    } catch (error) {
      if (assistantIndex >= 0 && !state.messages[assistantIndex].content.trim()) {
        state.messages.splice(assistantIndex, 1);
        renderMessages();
      }
      if (error.message.includes("Failed to fetch")) {
        setError("请求失败。请检查网络是否能访问 DeepSeek，或 API Key 是否允许从当前网络调用。");
      } else {
        setError(error.message);
      }
    } finally {
      state.loading = false;
      els.sendBtn.disabled = false;
      els.statusPill.textContent = "等待你开口";
      if (!streamStarted || assistantIndex < 0) {
        renderMessages();
      }
      saveCurrentSession();
    }
  }

  function bindEvents() {
    els.openDrawer.addEventListener("click", () => setDrawer(true));
    els.closeDrawer.addEventListener("click", () => setDrawer(false));
    els.backdrop.addEventListener("click", () => setDrawer(false));

    els.notificationButton.addEventListener("click", (event) => {
      event.stopPropagation();
      closeCustomSelects();
      setHistoryPanel(false);
      setSettingsMenu(false);
      setNotificationMenu(!els.notificationArea.classList.contains("notification-open"));
    });

    els.notificationMenu.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    els.notificationBackdrop.addEventListener("click", () => {
      if (!canDismissNotification()) return;
      setNotificationMenu(false);
    });

    els.notificationAccept.addEventListener("click", (event) => {
      event.stopPropagation();
      if (els.notificationAccept.disabled) return;
      setNotificationMenu(false);
    });

    els.headerSettings.addEventListener("click", (event) => {
      event.stopPropagation();
      closeCustomSelects();
      setHistoryPanel(false);
      setNotificationMenu(false);
      setSettingsMenu(!els.chatActions.classList.contains("menu-open"));
    });

    els.settingsMenu.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    els.historyButton.addEventListener("click", (event) => {
      event.stopPropagation();
      setHistoryPanel(!els.body.classList.contains("history-open"));
    });

    els.historyPanel.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    els.historyBackdrop.addEventListener("click", () => {
      setHistoryPanel(false);
    });

    els.historyClose.addEventListener("click", () => {
      setHistoryPanel(false);
    });

    els.newSession.addEventListener("click", () => {
      resetConversationWithGreeting();
      setError("");
      renderHistoryList();
      setHistoryPanel(false);
    });

    els.clearSessions.addEventListener("click", () => {
      if (!readSessions().length) return;
      if (!window.confirm("确定清空所有历史会话吗？")) return;
      clearAllSessions();
    });

    els.historyList.addEventListener("click", (event) => {
      const target = event.target.closest("[data-action]");
      if (!target) return;

      const sessionId = target.dataset.id;
      if (target.dataset.action === "load") {
        loadHistorySession(sessionId);
        return;
      }

      if (target.dataset.action === "delete") {
        removeSession(sessionId);
      }
    });

    document.addEventListener("click", () => {
      closeCustomSelects();
      if (canDismissNotification()) {
        setNotificationMenu(false);
      }
      setHistoryPanel(false);
      setSettingsMenu(false);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      closeCustomSelects();
      if (canDismissNotification()) {
        setNotificationMenu(false);
      }
      setHistoryPanel(false);
      setSettingsMenu(false);
    });

    els.genderTabs.addEventListener("click", (event) => {
      const tab = event.target.closest(".gender-tab");
      if (!tab) return;
      state.genderFilter = tab.dataset.gender;
      const currentPersona = getPersona();
      if (currentPersona.gender !== state.genderFilter) {
        const nextPersona = personas.find((persona) => persona.gender === state.genderFilter);
        if (nextPersona) {
          state.selectedId = nextPersona.id;
          applyPersonaDefaults(nextPersona);
        }
      }
      renderPersonaList();
    });

    els.personaList.addEventListener("click", (event) => {
      const card = event.target.closest(".persona-card");
      if (!card) return;
      const persona = personas.find((item) => item.id === card.dataset.id);
      if (!persona) return;
      state.selectedId = persona.id;
      state.genderFilter = persona.gender;
      renderPersonaList();
      applyPersonaDefaults(persona);
      if (window.matchMedia("(max-width: 760px)").matches) {
        setDrawer(false);
      }
    });

    [
      els.customName,
      els.relationship,
      els.personality,
      els.emotionLevel,
      els.replyLength,
      els.apiKey,
      els.modelName
    ].forEach((input) => {
      input.addEventListener("input", () => {
        saveSettings();
        renderHeader();
        saveCurrentSession();
      });
    });

    els.userInput.addEventListener("input", autoGrowInput);
    els.userInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        els.chatForm.requestSubmit();
      }
    });

    els.chatForm.addEventListener("submit", (event) => {
      event.preventDefault();
      sendMessage(els.userInput.value);
    });

    if (els.copyPrompt) {
      els.copyPrompt.addEventListener("click", async () => {
        const prompt = buildSystemPrompt();
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(prompt);
        } else {
          const textarea = document.createElement("textarea");
          textarea.value = prompt;
          textarea.style.position = "fixed";
          textarea.style.left = "-9999px";
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand("copy");
          document.body.removeChild(textarea);
        }
        els.copyPrompt.textContent = "已复制";
        setTimeout(() => {
          els.copyPrompt.textContent = "复制当前提示词";
        }, 1200);
      });
    }

  }

  async function init() {
    try {
      setError("");
      await loadPersonas();
      loadSettings();
      const persona = getPersona();
      if (!els.customName.value) els.customName.value = persona.name;
      if (!els.personality.value) els.personality.value = persona.personality;
      els.emotionLevel.value = DEFAULT_EMOTION_LEVEL;
      els.replyLength.value = DEFAULT_REPLY_LENGTH;
      renderPersonaList();
      syncCustomSelects();
      renderHeader();
      resetConversationWithGreeting();
      renderHistoryList();
      enhanceSelectControls();
      syncCustomSelects();
      bindEvents();
    } catch (error) {
      setError(`${error.message} 请通过服务器访问页面，并确认清单文件存在。`);
    }
  }

  init();
}());
