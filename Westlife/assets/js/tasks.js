/* Tasks Module Script (Home Page)
 * 轻量实现：
 * - DOM 渲染/刷新按钮
 * - 支持 data-endpoint（返回 JSON 数组） 或使用内置 mock
 * - 任务对象字段: { id, title, progress (0-100), status: 'pending'|'doing'|'done', updated }
 * - ARIA: 列表使用 role=list / listitem (ul/li 本身语义足够)；更新时通过 aria-live 提示
 */
(function () {
  const TASK_BUFFER = 6;
  let wrapper = null;
  let listEl = null;
  let emptyEl = null;
  let endpoint = "";
  let limit = 6;
  let maxItemHeightAttr = 0;
  let loading = false;
  let tasks = [];
  let tasksInitialized = false;

  function setLoading(state) {
    if (!listEl) return;
    loading = state;
    if (state) {
      renderSkeleton();
    }
  }

  function renderSkeleton() {
    if (!listEl) return;
    listEl.innerHTML = "";
    emptyEl && (emptyEl.hidden = true);
    const skel = document.createElement("div");
    skel.className = "hf-task-skeleton";
    const rows = Math.min(limit, 5);
    for (let i = 0; i < rows; i++) {
      const r = document.createElement("div");
      r.className = "hf-task-skel-row";
      skel.appendChild(r);
    }
    const li = document.createElement("li");
    li.appendChild(skel);
    listEl.appendChild(li);
  }

  function humanTime(ts) {
    if (!ts) return "";
    try {
      const d = new Date(ts);
      if (isNaN(d.getTime())) return "";
      const now = Date.now();
      const diff = (now - d.getTime()) / 1000; // s
      if (diff < 60) return "刚刚";
      if (diff < 3600) return Math.floor(diff / 60) + "分钟前";
      if (diff < 86400) return Math.floor(diff / 3600) + "小时前";
      const days = Math.floor(diff / 86400);
      if (days === 1) return "昨天";
      if (days < 7) return days + "天前";
      return (
        d.getFullYear() +
        "-" +
        String(d.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(d.getDate()).padStart(2, "0")
      );
    } catch (e) {
      return "";
    }
  }

  function buildTaskItem(t) {
    const li = document.createElement("li");
    li.className = "hf-task-item";
    li.dataset.status = t.status || "pending";
    // 新：单行头部，左侧标题，右侧 进度+状态
    const header = document.createElement("div");
    header.className = "task-head-row";

    const title = document.createElement("div");
    title.className = "task-title";
    title.textContent = t.title || "未命名任务";
    header.appendChild(title);

    const pct = Math.max(0, Math.min(100, Number(t.progress) || 0));
    const statusLabel = statusText(t.status, pct);
    const right = document.createElement("div");
    right.className = "task-head-meta";
    right.innerHTML =
      '<span class="task-progress-text" aria-label="完成度">' +
      pct +
      '%</span> <span class="task-status-text" aria-label="状态">' +
      statusLabel +
      "</span>";
    header.appendChild(right);
    li.appendChild(header);

    // 更新时间放到进度条上方极简微排版（可选保留，放在 head 下方一行细字）
    if (t.updated) {
      const upd = document.createElement("div");
      upd.className = "task-updated-line";
      upd.textContent = humanTime(t.updated);
      li.appendChild(upd);
    }

    const bar = document.createElement("div");
    bar.className = "task-progress-bar";
    const fill = document.createElement("span");
    fill.style.width = pct + "%";
    bar.appendChild(fill);
    li.appendChild(bar);

    return li;
  }

  function statusText(st, pct) {
    if (st === "done" || pct >= 100) return "已完成";
    if (st === "doing") return pct >= 50 ? "过半" : "进行中";
    if (st === "pending") return "待开始";
    return st || "未知";
  }

  function render() {
    if (!listEl) return;
    listEl.innerHTML = "";
    listEl.classList.remove("is-scrollable");
    listEl.classList.remove(
      "tasks-compact",
      "tasks-compact-2",
      "tasks-compact-3"
    );
    listEl.style.removeProperty("max-height");
    if (!tasks.length) {
      emptyEl && (emptyEl.hidden = false);
      return;
    }
    emptyEl && (emptyEl.hidden = true);
    const frag = document.createDocumentFragment();
    // 始终渲染全部(以便高度测量)，但通过 CSS 限制前三条可见高度
    tasks.forEach((t) => frag.appendChild(buildTaskItem(t)));
    listEl.appendChild(frag);
    lockFirstThreeHeight(); // 统一计算 + 缓冲 + 事件派发
  }

  function lockFirstThreeHeight() {
    if (!listEl) return;
    const items = listEl.querySelectorAll(".hf-task-item");
    if (!items.length) return;
    const itemsArr = Array.from(items);
    const targetBottomEl = itemsArr[Math.min(2, itemsArr.length - 1)];
    const listRect = listEl.getBoundingClientRect();
    const targetRect = targetBottomEl.getBoundingClientRect();
    const raw = targetRect.bottom - listRect.top; // 到第三条底部的实际高度

    // 三条及以下：不限制 max-height，保证完全展示，不加滚动
    if (items.length <= 3) {
      listEl.style.removeProperty("max-height");
      listEl.classList.remove("is-scrollable");
      const ev = new CustomEvent("tasksHeightAdjusted", {
        detail: { maxHeight: null, totalItems: items.length },
      });
      listEl.dispatchEvent(ev);
      // 自适应填充：让 1~3 条任务按可用空间均分高度
      adaptiveFillForThree();
      return;
    }

    // 超过三条：锁定前三条高度（加轻微缓冲防震动），其余滚动
    const maxH = Math.ceil(raw) + TASK_BUFFER;
    listEl.style.maxHeight = maxH + "px";
    listEl.classList.add("is-scrollable");
    const ev = new CustomEvent("tasksHeightAdjusted", {
      detail: { maxHeight: maxH, totalItems: items.length },
    });
    listEl.dispatchEvent(ev);
  }
  // 旧 ensureThreeVisible 逻辑已移除，所有高度控制由 lockFirstThreeHeight 完成

  /**
   * 当任务数量 <=3 时，尝试让其在视口可用垂直空间内均匀拉伸，形成整齐块状布局。
   * 计算目标高度：min(视口剩余空间, 视口高度 * 0.55)，但不小于自然高度；
   * 块高度 = (目标高度 - (itemGap * (n-1))) / n
   */
  function adaptiveFillForThree() {
    const items = listEl.querySelectorAll(".hf-task-item");
    // 清理旧类
    listEl.classList.remove(
      "tasks-fill",
      "tasks-flex-grow",
      "tasks-single-center"
    );
    items.forEach((it) => {
      it.style.removeProperty("flex");
      it.style.removeProperty("--auto-min");
      it.style.removeProperty("min-height");
    });
    if (!items.length || items.length > 3) return;

    // 固定高度映射：1条=100px 2条=75px 3条=60px
    const map = { 1: 100, 2: 75, 3: 60 };
    const h = map[items.length];
    listEl.classList.add("tasks-fixed");
    // 居中：单条/多条都水平居中 + 垂直居中（通过 flex）
    listEl.classList.toggle("tasks-fixed-single", items.length === 1);
    items.forEach((it) => {
      it.style.minHeight = h + "px";
      it.classList.add("task-fixed-item");
    });
  }

  function mockTasks() {
    // 模拟不同状态的任务
    const now = Date.now();
    return [
      {
        id: 1,
        title: "整理近期博客文章分类与标签",
        progress: 100,
        status: "done",
        updated: now - 3600 * 1000,
      },
      {
        id: 2,
        title: "为首页任务模块接入后端接口",
        progress: 45,
        status: "doing",
        updated: now - 7200 * 1000,
      },
      {
        id: 3,
        title: "撰写一篇关于性能优化的长文",
        progress: 20,
        status: "doing",
        updated: now - 5 * 3600 * 1000,
      },
      {
        id: 4,
        title: "优化主题访问统计与缓存策略",
        progress: 60,
        status: "doing",
        updated: now - 86400 * 1000,
      },
      {
        id: 5,
        title: "替换旧的 banner 样式相关代码",
        progress: 100,
        status: "done",
        updated: now - 2 * 86400 * 1000,
      },
      {
        id: 6,
        title: "计划：设计新的夜间配色方案",
        progress: 0,
        status: "pending",
        updated: now - 3 * 86400 * 1000,
      },
    ];
  }

  async function fetchTasks() {
    if (!endpoint) {
      return mockTasks();
    }
    const res = await fetch(
      endpoint + (endpoint.includes("?") ? "&" : "?") + "_=" + Date.now(),
      {
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      }
    );
    if (!res.ok) throw new Error("HTTP " + res.status);
    const json = await res.json();
    if (Array.isArray(json)) return json;
    if (json && Array.isArray(json.tasks)) return json.tasks;
    return [];
  }

  async function load() {
    try {
      setLoading(true);
      const data = await fetchTasks();
      if (!Array.isArray(data)) throw new Error("数据格式错误");
      tasks = data.map(normalizeTask).filter(Boolean);
      // respect data-limit attribute (after mapping)
      if (Number.isFinite(limit) && limit > 0) {
        tasks = tasks.slice(0, limit);
      }
      render();
    } catch (e) {
      console.warn("[tasks]", e);
      showError("加载失败：" + (e.message || "未知错误"));
    } finally {
      setLoading(false);
    }
  }

  function normalizeTask(raw) {
    if (!raw || typeof raw !== "object") return null;
    const id =
      raw.id || raw.ID || raw.slug || Math.random().toString(36).slice(2);
    // support multiple field names: progress / percent / percentage
    let progress = raw.progress;
    if (progress == null) progress = raw.percent;
    if (progress == null) progress = raw.percentage;
    progress = Number(progress);
    if (isNaN(progress)) progress = 0;
    progress = Math.max(0, Math.min(100, progress));
    let status = raw.status;
    if (progress >= 100) status = "done";
    if (!status) status = progress > 0 ? "doing" : "pending";
    return {
      id,
      title: String(raw.title || raw.name || raw.label || "未命名任务"),
      progress,
      status,
      updated: raw.updated || raw.modified || raw.date || raw.timestamp || null,
    };
  }

  // 已移除刷新按钮：保留自动加载逻辑

  // 当窗口尺寸变化时重新锁定高度（节流）
  let rhTimer;
  window.addEventListener(
    "resize",
    function () {
      if (rhTimer) cancelAnimationFrame(rhTimer);
      rhTimer = requestAnimationFrame(lockFirstThreeHeight);
    },
    { passive: true }
  );

  function setup() {
    wrapper = document.getElementById("hf-tasks-wrapper");
    listEl = document.getElementById("task-list-hf");
    emptyEl = document.getElementById("task-empty-hint");
    if (!wrapper || !listEl) return false;
    endpoint = wrapper.getAttribute("data-endpoint") || "";
    limit = parseInt(wrapper.getAttribute("data-limit") || "6", 10);
    maxItemHeightAttr =
      parseInt(wrapper.getAttribute("data-max-item-height") || "0", 10) || 0;
    return true;
  }

  function initTasksModule() {
    if (!setup() || tasksInitialized) return;
    tasksInitialized = true;
    if ("requestIdleCallback" in window) {
      requestIdleCallback(load, { timeout: 1500 });
    } else {
      setTimeout(load, 200);
    }
  }

  function destroyTasksModule() {
    tasksInitialized = false;
    wrapper = null;
    listEl = null;
    emptyEl = null;
    loading = false;
    tasks = [];
  }

  if (window.WestlifeApp && typeof window.WestlifeApp.register === "function") {
    window.WestlifeApp.register({
      name: "tasks",
      match(context) {
        const root = context && context.nodeType === 1 ? context : document;
        return !!root.querySelector("#hf-tasks-wrapper, #task-list-hf");
      },
      init() {
        initTasksModule();
      },
      destroy() {
        destroyTasksModule();
      },
    });
  } else {
    initTasksModule();
  }
})();
