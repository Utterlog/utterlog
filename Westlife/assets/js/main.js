// 登录按钮 loading 效果（header.php 移除的内联脚本迁移至此）
function initLoginButtonLoading() {
  var loginForm = document.querySelector(".login-form");
  if (!loginForm || loginForm.__WL_LOGIN_LOADING_BOUND__) return;
  loginForm.__WL_LOGIN_LOADING_BOUND__ = true;
  loginForm.addEventListener("submit", function () {
    var btn = loginForm.querySelector(".submit-btn");
    if (!btn) return;
    var loading = btn.querySelector(".loading-icon");
    if (loading) loading.style.display = "inline-block";
    btn.setAttribute("disabled", "disabled");
  });
}

/**
 * Westlife 主题前端主脚本
 * - 统一工具兜底
 */
(function ($, w, d) {
  "use strict";

  // ------------------------------
  // 工具兜底与合并
  // ------------------------------
  const U = w.WestlifeUtils || {};
  const throttle =
    U.throttle ||
    ((fn, wait = 120) => {
      let t = 0,
        id = 0;
      return function (...args) {
        const now = Date.now();
        if (now - t >= wait) {
          t = now;
          fn.apply(this, args);
        } else {
          clearTimeout(id);
          id = setTimeout(() => {
            t = Date.now();
            fn.apply(this, args);
          }, wait - (now - t));
        }
      };
    });
  const ajax =
    U.ajax ||
    function (action, data = {}, method = "POST") {
      const url =
        w.westlifeSettings?.ajaxUrl || w.westlifeSettings?.ajaxurl || w.ajaxurl;

      // 改进 nonce 获取
      const getNonce = () => {
        // 根据 action 获取对应的 nonce
        if (action === "westlife_ajax_login") {
          return (
            document.querySelector('input[name="login_nonce"]')?.value ||
            document.querySelector('input[name="nonce"]')?.value
          );
        }
        if (action === "westlife_forgot_password") {
          return (
            document.querySelector('input[name="forgot_nonce"]')?.value ||
            document.querySelector('input[name="security"]')?.value
          );
        }
        // 默认全局 nonce
        return w.westlifeSettings?.nonce || "";
      };
      return $.ajax({
        url,
        method,
        data: {
          action,
          ...data,
          nonce: getNonce(),
        },
        dataType: "json",
      });
    };
  const icon =
    w.WestlifeIcons && typeof w.WestlifeIcons.icon === "function"
      ? (name, attrs = {}) => w.WestlifeIcons.icon(name, attrs)
      : () => "";
  // 通用按钮 Loading 处理（避免缺失报错）
  // setLoading 兜底实现（若 utils.js 尚未加载或加载顺序在后），保持与新版结构一致：
  //  - .loading-icon 包裹层：移除/添加 u-hidden
  //  - 给包裹层添加/移除 u-spinner（其子 <i> 会旋转）
  //  - .btn-text 在 text === false 时隐藏（u-hidden）
  //  - aria-busy / u-loading 状态
  const setLoading =
    U.setLoading ||
    function (btn, loading = false, text = "加载中…") {
      try {
        const $ = window.jQuery;
        const $el = $ && btn && btn.jquery ? btn : $ ? $(btn) : null;
        const el = $el ? $el[0] : btn;
        if (!el) return;
        const find = (sel) => ($el ? $el.find(sel).first() : null);
        const $iconWrapper = find && find(".loading-icon");
        const $btnText = find && find(".btn-text");
        if (loading) {
          el.classList.add("u-loading");
          el.setAttribute("aria-busy", "true");
          if ($btnText && $btnText.length && text === false) {
            $btnText.addClass("u-hidden");
          }
          // wrapper 处理
          if ($iconWrapper && $iconWrapper.length) {
            $iconWrapper.removeClass("u-hidden").addClass("u-spinner");
          }
          // 显示文字（如果不是 false）: 创建/更新 wl-loading-message
          if (text !== false && typeof text === "string") {
            let $msg = find && find(".wl-loading-message");
            if (!$msg || !$msg.length) {
              if ($) {
                $msg = $(
                  '<div class="wl-loading-message" role="status" aria-live="polite"></div>'
                );
                $el.append($msg);
              }
            }
            if ($msg && $msg.length) $msg.text(text);
          }
        } else {
          el.classList.remove("u-loading");
          el.removeAttribute("aria-busy");
          if ($btnText && $btnText.length) $btnText.removeClass("u-hidden");
          if ($iconWrapper && $iconWrapper.length)
            $iconWrapper.addClass("u-hidden").removeClass("u-spinner");
          if ($el) $el.find(".wl-loading-message").remove();
        }
      } catch (e) {
        if (window && window.console)
          console.debug("[WL] setLoading fallback error", e);
      }
    };
  const showMessage =
    U.showMessage ||
    function (msg, type = "info", duration = 1800) {
      // 尽量走全局 Utils（包含新样式与堆叠逻辑）
      if (
        w.WestlifeUtils &&
        typeof w.WestlifeUtils.showMessage === "function"
      ) {
        try {
          w.WestlifeUtils.showMessage(msg, type, duration);
          return;
        } catch {}
      }
      // 兜底：系统 alert（避免注入旧样式 DOM）
      try {
        alert(`${type.toUpperCase()}: ${msg}`);
      } catch {}
    };

  // ------------------------------
  // 统一的 AJAX 响应处理函数
  // ------------------------------
  function handleAjaxResponse(response, successCallback) {
    // 处理通知
    if (response && response.notification && window.WestlifeUtils) {
      const { text, type, duration } = response.notification;
      window.WestlifeUtils.showMessage(text, type, duration || 3000);
    }

    // 执行成功回调
    if (typeof successCallback === "function") {
      successCallback(response);
    }
  }

  // 增强的 AJAX 函数，自动处理通知
  function ajaxWithNotification(action, data = {}, method = "POST") {
    const url =
      w.westlifeSettings?.ajaxUrl || w.westlifeSettings?.ajaxurl || w.ajaxurl;

    const getNonce = () => {
      if (action === "westlife_ajax_login") {
        return (
          document.querySelector('input[name="login_nonce"]')?.value ||
          document.querySelector('input[name="nonce"]')?.value
        );
      }
      if (action === "westlife_forgot_password") {
        return (
          document.querySelector('input[name="forgot_nonce"]')?.value ||
          document.querySelector('input[name="security"]')?.value
        );
      }
      return w.westlifeSettings?.nonce || "";
    };

    return $.ajax({
      url,
      type: method,
      dataType: "json",
      data: { action, nonce: getNonce(), ...data },
    })
      .done(function (response) {
        // 自动处理通知
        handleAjaxResponse(response);
      })
      .fail(function () {
        // 网络失败时的通知
        if (window.WestlifeUtils && window.WestlifeUtils.showMessage) {
          window.WestlifeUtils.showMessage("网络请求失败，请重试", "error");
        }
      });
  }

  // 合并到全局（不覆盖已存在实现）
  w.WestlifeUtils = Object.assign({}, U, {
    throttle: U.throttle || throttle,
    ajax: U.ajax || ajax,
    ajaxWithNotification: ajaxWithNotification,
    handleAjaxResponse: handleAjaxResponse,
    setLoading: U.setLoading || setLoading,
    showMessage: U.showMessage || showMessage,
  });

  function showConsoleInfo() {}

  // 页面加载后输出一次控制台主题信息
  if (d.readyState === "loading") {
    d.addEventListener("DOMContentLoaded", showConsoleInfo, { once: true });
  } else {
  }

  // 平滑滚动兜底
  function safeScrollTo(target, offset = 0, duration = 360) {
    const api = w.WestlifeUtils?.scrollTo;
    if (typeof api === "function") return api(target, offset, duration);
    try {
      if (typeof target === "number") {
        w.scrollTo({ top: Math.max(0, target - offset), behavior: "smooth" });
        return true;
      }
      const el = target instanceof Element ? target : d.querySelector(target);
      if (!el) return false;
      const top = el.getBoundingClientRect().top + w.pageYOffset - offset;
      w.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      return true;
    } catch {
      return false;
    }
  }

  // ------------------------------
  // BackToTop（修复）
  // ------------------------------
  function initBackToTop() {
    if (w.__WL_BACK2TOP_INITED__) return;
    w.__WL_BACK2TOP_INITED__ = true;

    let legacyBtn =
      d.querySelector(".back-to-top") ||
      d.querySelector("#backToTop") ||
      d.querySelector("#back-to-top");

    if (!legacyBtn) {
      legacyBtn = d.createElement("button");
      legacyBtn.type = "button";
      legacyBtn.className = "back-to-top";
      legacyBtn.setAttribute("aria-label", "返回顶部");
      legacyBtn.setAttribute("title", "回到顶部");
      legacyBtn.innerHTML = icon("arrow-up", { "aria-hidden": "true" });
      d.body.appendChild(legacyBtn);
    }

    function getScrollPercent() {
      const scrollTop =
        w.pageYOffset || d.documentElement.scrollTop || d.body.scrollTop || 0;
      const docH = Math.max(
        d.body.scrollHeight,
        d.documentElement.scrollHeight,
        d.body.offsetHeight,
        d.documentElement.offsetHeight,
        d.body.clientHeight,
        d.documentElement.clientHeight
      );
      const winH =
        w.innerHeight || d.documentElement.clientHeight || d.body.clientHeight;
      const total = Math.max(docH - winH, 1);
      const raw = Math.round((scrollTop / total) * 100);
      const percent = Math.min(100, Math.max(0, raw));
      return percent; // 顶部为 0
    }

    function updateLegacyBtn() {
      if (!legacyBtn) return;
      const pct = getScrollPercent();
      const vis = pct > 0;
      legacyBtn.classList.toggle("is-visible", vis);
      legacyBtn.setAttribute("aria-hidden", vis ? "false" : "true");
    }

    function bindClicks() {
      const act = (e) => {
        e.preventDefault();
        safeScrollTo(0, 0, 420);
      };
      if (legacyBtn && !legacyBtn.__WL_BOUND__) {
        legacyBtn.__WL_BOUND__ = true;
        legacyBtn.addEventListener("click", act);
        legacyBtn.addEventListener("keydown", (e) => {
          const k = (e.key || "").toLowerCase();
          if (k === "enter" || k === " " || k === "spacebar") act(e);
        });
      }
    }

    const onScroll = throttle(function () {
      updateLegacyBtn();
    }, 80);

    w.addEventListener("scroll", onScroll, { passive: true });
    w.addEventListener("load", onScroll, { once: true });
    d.addEventListener("pageshow", () => onScroll(), { once: true });
    bindClicks();
  }

  // ------------------------------
  // 三态主题切换（light → dark → system）
  // ------------------------------
  function initThemeToggle() {
    const wrap = d.querySelector("[data-theme-dropdown]");
    if (!wrap) return;
    const toggleBtn = wrap.querySelector(".theme-dropdown-toggle");
    const menu = wrap.querySelector(".theme-dropdown-menu");
    const options = Array.from(menu.querySelectorAll(".theme-option"));
    const STORAGE_KEY = "theme-mode";

    function systemPrefersDark() {
      return (
        w.matchMedia && w.matchMedia("(prefers-color-scheme: dark)").matches
      );
    }

    function apply(mode, { save = true, animate = true } = {}) {
      const html = d.documentElement;
      let eff = mode;
      if (mode === "system") eff = systemPrefersDark() ? "dark" : "light";
      html.setAttribute("data-theme", eff);
      html.setAttribute("data-theme-mode", mode);
      // 更新按钮图标
      const iconStack = toggleBtn.querySelector(".theme-icon-stack");
      if (iconStack) {
        iconStack.querySelectorAll(".ti").forEach((i) => {
          if (i.dataset.icon === mode) i.setAttribute("data-active", "");
          else i.removeAttribute("data-active");
        });
      }
      toggleBtn.setAttribute("data-mode", mode);
      const currentText = toggleBtn.querySelector(".current-mode-text");
      if (currentText) currentText.textContent = mode;
      options.forEach((o) => {
        const m = o.getAttribute("data-set-theme");
        const active = m === mode;
        o.setAttribute("aria-checked", active ? "true" : "false");
      });
      const labelMap = {
        system: "系统模式",
        light: "浅色模式",
        dark: "深色模式",
      };
      toggleBtn.setAttribute(
        "aria-label",
        "主题：" + (labelMap[mode] || mode) + "，点击展开菜单"
      );
      if (save) {
        try {
          localStorage.setItem(STORAGE_KEY, mode);
        } catch {}
      }
      if (animate) {
        toggleBtn.classList.add("switching");
        clearTimeout(toggleBtn.__aniTimer);
        toggleBtn.__aniTimer = setTimeout(
          () => toggleBtn.classList.remove("switching"),
          520
        );
      }
    }

    function openMenu() {
      if (wrap.classList.contains("open")) return;
      wrap.classList.add("open");
      toggleBtn.setAttribute("aria-expanded", "true");
      menu.setAttribute("data-open", "true");
      placeActiveFocus();
      d.addEventListener("mousedown", onDocDown, true);
      d.addEventListener("keydown", onKey);
    }
    function closeMenu(focusToggle = true) {
      if (!wrap.classList.contains("open")) return;
      wrap.classList.remove("open");
      toggleBtn.setAttribute("aria-expanded", "false");
      menu.removeAttribute("data-open");
      d.removeEventListener("mousedown", onDocDown, true);
      d.removeEventListener("keydown", onKey);
      if (focusToggle) toggleBtn.focus();
    }
    function onDocDown(e) {
      if (!wrap.contains(e.target)) closeMenu(false);
    }
    function onKey(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeMenu();
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const dir = e.key === "ArrowDown" ? 1 : -1;
        moveFocus(dir);
      }
      if (e.key === "Home") {
        e.preventDefault();
        focusOption(0);
      }
      if (e.key === "End") {
        e.preventDefault();
        focusOption(options.length - 1);
      }
      if (e.key === "Enter" || e.key === " ") {
        const el = d.activeElement;
        if (options.includes(el)) {
          e.preventDefault();
          selectOption(el);
        }
      }
    }
    function placeActiveFocus() {
      const cur = toggleBtn.getAttribute("data-mode") || "system";
      const target =
        options.find((o) => o.getAttribute("data-set-theme") === cur) ||
        options[0];
      if (target) target.focus();
    }
    function focusOption(idx) {
      if (idx < 0 || idx >= options.length) return;
      options[idx].focus();
    }
    function moveFocus(delta) {
      const list = options;
      const curIdx = list.indexOf(d.activeElement);
      const next = (curIdx + delta + list.length) % list.length;
      focusOption(next);
    }
    function selectOption(btn) {
      const mode = btn.getAttribute("data-set-theme");
      apply(mode);
      closeMenu();
    }

    toggleBtn.addEventListener("click", (e) => {
      e.preventDefault();
      wrap.classList.contains("open") ? closeMenu() : openMenu();
    });
    toggleBtn.addEventListener("keydown", (e) => {
      const k = (e.key || "").toLowerCase();
      if (k === "arrowdown") {
        e.preventDefault();
        openMenu();
      }
      if (k === "enter" || k === " " || k === "spacebar") {
        e.preventDefault();
        openMenu();
      }
    });
    options.forEach((o) => {
      o.tabIndex = -1;
      o.addEventListener("click", (e) => {
        e.preventDefault();
        selectOption(o);
      });
    });

    // 系统模式监听
    if (w.matchMedia) {
      try {
        const mq = w.matchMedia("(prefers-color-scheme: dark)");
        mq.addEventListener("change", () => {
          const mode = toggleBtn.getAttribute("data-mode");
          if (mode === "system")
            apply("system", { save: false, animate: false });
        });
      } catch {}
    }

    // 初始化
    let initMode = "system";
    try {
      const saved =
        localStorage.getItem(STORAGE_KEY) || localStorage.getItem("theme");
      if (["light", "dark", "system"].includes(saved)) initMode = saved;
    } catch {}
    apply(initMode, { save: false, animate: false });
  }

  // ------------------------------
  // 登录模态
  // ------------------------------
  function setOverlayModalState(modal, active) {
    if (!modal) return;
    modal.classList.toggle("active", !!active);
    modal.setAttribute("aria-hidden", active ? "false" : "true");
  }

  function bindOverlayScrollGuard(modal, innerSelector) {
    if (!modal || modal.__WL_OVERLAY_SCROLL_GUARD__) return;
    modal.__WL_OVERLAY_SCROLL_GUARD__ = true;
    const inner = innerSelector ? modal.querySelector(innerSelector) : null;
    const guard = (e) => {
      if (!modal.classList.contains("active")) return;
      if (inner && inner.contains(e.target)) return;
      e.preventDefault();
    };
    modal.addEventListener("wheel", guard, { passive: false });
    modal.addEventListener("touchmove", guard, { passive: false });
  }

  function initLoginModal() {
    const loginBtn = d.querySelector(".login-button");
    const loginModal = d.querySelector(".login-modal");
    if (!loginBtn || !loginModal) return;

    const closeBtn = loginModal.querySelector(".modal-close");
    const loginForm = loginModal.querySelector(".login-form");
    const togglePassword = loginModal.querySelector(".toggle-password");
    bindOverlayScrollGuard(loginModal, ".login-modal-inner");

    $(loginBtn)
      .off("click.wlLogin")
      .on("click.wlLogin", () => {
        setOverlayModalState(loginModal, true);
        clearLoginError();
      });
    $(closeBtn)
      .off("click.wlLogin")
      .on("click.wlLogin", () => {
        setOverlayModalState(loginModal, false);
        clearLoginError();
      });
    $(loginModal)
      .off("click.wlLogin")
      .on("click.wlLogin", (e) => {
        if (e.target === loginModal) {
          setOverlayModalState(loginModal, false);
          clearLoginError();
        }
      });
    $(togglePassword)
      .off("click.wlLogin")
      .on("click.wlLogin", () => {
        const input = loginModal.querySelector("#password");
        if (!input) return;
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        if (togglePassword) {
          togglePassword.innerHTML = icon(show ? "eye-off" : "eye", {
            "aria-hidden": "true",
          });
        }
      });

    $(loginForm)
      .off("submit.wlLogin")
      .on("submit.wlLogin", async function (e) {
        e.preventDefault();
        const $form = $(this);
        const $btn = $form.find(".submit-btn");
        const $live = $form.find(".login-status-live");
        clearLoginError();
        try {
          $btn.prop("disabled", true);
          if ($live.length) $live.text("正在登录…");
          setLoading($btn, true, false); // false 隐藏文字，仅 spinner
          const payload = {
            log: $form.find('[name="log"]').val(),
            pwd: $form.find('[name="pwd"]').val(),
            rememberme: $form.find('[name="rememberme"]').is(":checked")
              ? "forever"
              : "",
            login_nonce: $form.find('input[name="login_nonce"]').val(), // 关键：字段名要和表单一致
          };

          // 使用统一的 AJAX 处理
          const res = await ajaxWithNotification(
            "westlife_ajax_login",
            payload
          );

          if (res?.success) {
            if ($live.length) $live.text("登录成功，正在跳转…");
            // 若没有后端 notification，补一条成功消息为可见提示
            if (!(res && res.notification) && w.WestlifeUtils?.showMessage) {
              w.WestlifeUtils.showMessage("登录成功", "success", 2000);
            }
            handleAjaxResponse(res, function (data) {
              setTimeout(() => {
                location.href = data.data?.redirect || location.href;
              }, 600);
            });
          } else {
            const msg = res?.data?.message || "登录失败";
            if ($live.length) $live.text(msg);
            showLoginError(msg);
          }
        } catch (err) {
          console.error(err);
          const msg = "请求失败，请稍后重试";
          if ($live.length) $live.text(msg);
          showLoginError(msg);
        } finally {
          setLoading($btn, false);
          $btn.prop("disabled", false);
        }
      });
  }

  // ------------------------------
  // 搜索、站点菜单、随机、锚点
  // ------------------------------
  function initSearch() {
    const modal = d.querySelector(".search-modal");
    if (!modal) return;
    const close = modal.querySelector(".search-close");
    const modalInput = modal.querySelector(".modal-search-field");
    bindOverlayScrollGuard(modal, ".search-modal-inner");

    const openSearchModal = () => {
      setOverlayModalState(modal, true);
      setTimeout(() => modalInput?.focus(), 40);
    };
    const closeSearchModal = () => {
      setOverlayModalState(modal, false);
    };

    if (close && !close.__WL_BOUND__) {
      close.__WL_BOUND__ = true;
      close.addEventListener("click", closeSearchModal);
    }

    // Esc 关闭 & 输入内按 Esc 不清空
    if (!w.__WL_SEARCH_ESC_BOUND__) {
      w.__WL_SEARCH_ESC_BOUND__ = true;
      d.addEventListener("keydown", (e) => {
        if (!modal.classList.contains("active")) return;
        if (e.key === "Escape") {
          e.preventDefault();
          closeSearchModal();
        }
      });
    }

    // 背景点击关闭
    if (!modal.__WL_BG_BOUND__) {
      modal.__WL_BG_BOUND__ = true;
      modal.addEventListener("click", (e) => {
        if (e.target === modal) {
          closeSearchModal();
        }
      });
    }

    // 简易焦点陷阱：打开时将 Tab 循环在输入和关闭按钮之间
    const trapFocus = (e) => {
      if (!modal.classList.contains("active")) return;
      if (e.key !== "Tab") return;
      const focusables = [modalInput, close].filter(Boolean);
      const idx = focusables.indexOf(d.activeElement);
      if (e.shiftKey) {
        if (idx <= 0) {
          e.preventDefault();
          focusables[focusables.length - 1].focus();
        }
      } else {
        if (idx === focusables.length - 1) {
          e.preventDefault();
          focusables[0].focus();
        }
      }
    };
    if (!w.__WL_SEARCH_TRAP_BOUND__) {
      w.__WL_SEARCH_TRAP_BOUND__ = true;
      d.addEventListener("keydown", trapFocus);
    }

    // 键盘快捷键 (Ctrl/⌘ + K 打开)
    if (!w.__WL_SEARCH_KB_BOUND__) {
      w.__WL_SEARCH_KB_BOUND__ = true;
      d.addEventListener(
        "keydown",
        (e) => {
          const key = (e.key || "").toLowerCase();
          if ((e.ctrlKey || e.metaKey) && key === "k") {
            e.preventDefault();
            openSearchModal();
          }
        },
        { passive: false }
      );
    }

    // 移动端点击头部“放大镜”打开搜索弹窗，而不是提交
    if (!w.__WL_SEARCH_CLICK_BOUND__) {
      w.__WL_SEARCH_CLICK_BOUND__ = true;
      const submitBtn = d.querySelector(".search-submit");
      if (submitBtn) {
        submitBtn.addEventListener("click", (e) => {
          const isMobile =
            w.matchMedia && w.matchMedia("(max-width: 768px)").matches;
          if (isMobile) {
            e.preventDefault();
            e.stopPropagation();
            openSearchModal();
          }
        });
      }
    }
  }
  function initSiteMenu() {
    const toggle = d.querySelector(".site-menu-toggle");
    const wrapper = d.querySelector(".site-menu-wrapper");
    const dd = d.querySelector(".site-menu-dropdown");
    if (!toggle || !dd || !wrapper) return;
    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      wrapper.classList.toggle("open");
      dd.classList.toggle("is-open");
    });
    d.addEventListener("click", (e) => {
      if (!wrapper.contains(e.target)) {
        wrapper.classList.remove("open");
        dd.classList.remove("is-open");
      }
    });
  }
  function initRandomPost() {
    const btn = d.querySelector(".random-post");
    if (!btn) return;
    btn.addEventListener("click", (e) => {
      const href = btn.getAttribute("href");
      if (!href) return; // 没有链接就不处理
      // 避免重复触发
      if (btn.classList.contains("u-loading")) {
        e.preventDefault();
        return;
      }
      // 阻止立即跳转，先显示加载动画
      e.preventDefault();
      btn.classList.add("u-loading");
      btn.setAttribute("aria-busy", "true");
      // 1.5s 后再跳转
      setTimeout(() => {
        window.location.href = href;
      }, 1500);
    });
  }
  function initWormholeLink() {
    const link = d.querySelector(".wormhole-link");
    if (!link) return;
    link.addEventListener("click", (e) => {
      const href = link.getAttribute("href");
      if (!href) return;
      // 如果已经在启动，阻止重复
      if (link.classList.contains("is-launching")) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      link.classList.add("is-launching");
      link.setAttribute("aria-busy", "true");

      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        link.classList.remove("is-launching");
        link.removeAttribute("aria-busy");
        d.removeEventListener("visibilitychange", onVisibilityChange, true);
      };
      const onVisibilityChange = () => {
        if (d.visibilityState === "hidden") {
          // 用户切换到新打开的窗口/标签
          cleanup();
        }
      };
      d.addEventListener("visibilitychange", onVisibilityChange, true);

      // 1s 后在新窗口打开（保持原先 target=_blank 行为）
      setTimeout(() => {
        try {
          window.open(
            href,
            link.getAttribute("target") || "_blank",
            "noopener"
          );
        } catch (_) {
          window.location.href = href; // 退化处理
        } finally {
          // 再延迟 60ms，保证视觉上完整转一圈
          setTimeout(cleanup, 60);
        }
      }, 1000);
      // 兜底：若新窗口被拦截或 visibility 未触发，1.3s 强制恢复
      setTimeout(cleanup, 1300);
    });
  }
  function initSmoothAnchor() {
    d.addEventListener("click", (e) => {
      const a = e.target.closest && e.target.closest('a[href^="#"]');
      if (!a || a.getAttribute("href") === "#") return;
      const el = d.querySelector(a.getAttribute("href"));
      if (!el) return;
      e.preventDefault();
      safeScrollTo(el, 80, 360);
    });
  }

  // ------------------------------
  // 缩略图/外链 favicon
  // ------------------------------
  function initPostThumbnails() {
    // 简化：仅使用 IntersectionObserver 给已进入视口的图片加一个标记类（可用于淡入）
    try {
      if ("IntersectionObserver" in w) {
        const io = new IntersectionObserver(
          (entries) => {
            entries.forEach((ent) => {
              if (ent.isIntersecting) {
                ent.target.classList.add("is-entered");
                io.unobserve(ent.target);
              }
            });
          },
          { rootMargin: "120px" }
        );
        d.querySelectorAll("img.post-thumbnail-img:not(.is-entered)").forEach(
          (img) => io.observe(img)
        );
      }
    } catch (e) {
      console.warn("initPostThumbnails simplified error", e);
    }
  }
  function updatePostThumbnailOverlay() {
    d.querySelectorAll(".post-thumbnail-overlay").forEach((ov) => {
      ov.style.background =
        "linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,.2) 30%, rgba(0,0,0,.6) 100%)";
    });
  }

  // ------------------------------
  // 头部滚动隐藏（修复：仅在明显向下滚动且超过阈值时隐藏）
  // ------------------------------

  // ------------------------------
  // 登录 A11y 与 security 重复 ID 修复
  // ------------------------------
  function initLoginModalA11y() {
    const $modal = $(".login-modal");
    if (!$modal.length) return;
    const setHidden = (hidden) => {
      $modal.attr("aria-hidden", hidden ? "true" : "false");
      if (hidden) $modal.find(":focus").trigger("blur");
    };
    setHidden(!$modal.hasClass("active"));
    $(d).on("click", "[data-open-login]", (e) => {
      e.preventDefault();
      $modal.addClass("active");
      setHidden(false);
      $modal
        .find('input[autofocus], input, [tabindex]:not([tabindex="-1"])')
        .first()
        .trigger("focus");
    });
    $(d).on(
      "click",
      "[data-close-login], .login-modal .modal-close, .login-modal .modal-overlay",
      (e) => {
        e.preventDefault();
        setHidden(true);
        $modal.removeClass("active");
      }
    );
  }
  function fixDuplicateSecurityId() {
    const $nodes = $("input#security");
    if ($nodes.length > 1)
      $nodes.each((i, el) => {
        if (i > 0) el.id = "security-" + i;
      });
    const mo = new MutationObserver(() => {
      const nodes = d.querySelectorAll("input#security");
      if (nodes.length > 1)
        nodes.forEach((el, i) => {
          if (i > 0) el.id = "security-" + i;
        });
    });
    mo.observe(d.documentElement, { childList: true, subtree: true });
    w.addEventListener("beforeunload", () => mo.disconnect(), { once: true });
  }

  // ------------------------------
  // 站点功能面板（首页控制面板）
  // ------------------------------
  function initSitePanel() {
    const btn = document.querySelector(".site-panel-toggle");
    const panel = document.getElementById("site-panel");
    if (!btn || !panel) return;

    const OPEN_CLASS = "is-open";
    const BODY_OPEN_CLASS = "site-panel-open";
    const dialog = panel.querySelector(".site-panel-dialog") || panel;
    const backdrop = panel.querySelector(".site-panel-backdrop");

    const getFocusable = () =>
      dialog.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );

    function open() {
      if (panel.classList.contains(OPEN_CLASS)) return;
      panel.classList.add(OPEN_CLASS);
      document.body.classList.add(BODY_OPEN_CLASS);
      document.body.classList.add("panel-open"); // 图标第二态常驻
      btn.setAttribute("aria-expanded", "true");
      panel.setAttribute("aria-hidden", "false");
      const nodes = getFocusable();
      (nodes[0] || dialog).focus();
      try {
        document.dispatchEvent(new CustomEvent("sitePanelOpen"));
      } catch (e) {}
    }

    function close() {
      if (!panel.classList.contains(OPEN_CLASS)) return;
      panel.classList.remove(OPEN_CLASS);
      document.body.classList.remove(BODY_OPEN_CLASS);
      document.body.classList.remove("panel-open"); // 恢复默认图标
      btn.setAttribute("aria-expanded", "false");
      panel.setAttribute("aria-hidden", "true");
      btn.focus();
      try {
        document.dispatchEvent(new CustomEvent("sitePanelClose"));
      } catch (e) {}
    }

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      panel.classList.contains(OPEN_CLASS) ? close() : open();
    });

    panel.addEventListener("click", (e) => {
      if (e.target === backdrop || e.target.closest("[data-close-panel]"))
        close();
    });

    document.addEventListener(
      "click",
      (e) => {
        if (!panel.classList.contains(OPEN_CLASS)) return;
        if (
          !dialog.contains(e.target) &&
          e.target !== btn &&
          !btn.contains(e.target)
        )
          close();
      },
      true
    );

    document.addEventListener("keydown", (e) => {
      if (!panel.classList.contains(OPEN_CLASS)) return;
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== "Tab") return;
      const nodes = Array.from(getFocusable());
      if (!nodes.length) return;
      const first = nodes[0],
        last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });

    window.WestlifePanel = {
      open,
      close,
      isOpen: () => panel.classList.contains(OPEN_CLASS),
    };
  }

  // ------------------------------
  // 初始化入口
  // ------------------------------
  function initTheme() {
    if (w.__WL_MAIN_INITED__) return;
    initWormholeLink();
    w.__WL_MAIN_INITED__ = true;

    try {
      initSiteMenu();
      initSearch();
      initSmoothAnchor();
      initLoginModal();
      initRandomPost();
      updatePostThumbnailOverlay();
      initPostThumbnails();
      initBackToTop();
      initSitePanel(); // 新增：首页控制面板
      initThemeToggle(); // 新增：三态主题切换
      initLoginButtonLoading(); // 新增：登录按钮 loading 效果
      // 已移除 lazysizes 兼容转换：模板直接输出最终图片。
    } catch (e) {
      console.error("初始化失败:", e);
    }

    // ESC 仅关闭搜索/登录/面板
    d.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        const search = d.querySelector(".search-modal");
        const login = d.querySelector(".login-modal");
        if (search?.classList.contains("active")) {
          setOverlayModalState(search, false);
        }
        if (login?.classList.contains("active")) {
          setOverlayModalState(login, false);
        }
        if (w.WestlifePanel?.isOpen?.()) w.WestlifePanel.close();
      }
    });
  }

  if (w.WestlifeApp && typeof w.WestlifeApp.register === "function") {
    w.WestlifeApp.register({
      name: "main-global",
      match() {
        return true;
      },
      init() {
        initTheme();
      },
      destroy() {},
    });
  } else {
    if (d.readyState === "loading")
      d.addEventListener("DOMContentLoaded", initTheme);
    else initTheme();
    d.addEventListener("westlifeUtilsReady", initTheme);
  }

  // 公共提示函数（兜底）
  w.showLoginMessage =
    w.showLoginMessage ||
    function (msg, type) {
      (w.WestlifeUtils?.showMessage || alert)(
        msg || "登录成功",
        type || "success"
      );
    };
  w.showLoginError =
    w.showLoginError ||
    function (msg) {
      (w.WestlifeUtils?.showMessage || alert)(msg || "登录失败", "error");
    };
  w.clearLoginError = w.clearLoginError || function () {};

  // 就绪后修复 A11y/重复ID、初始化缩略图
  $(function () {
    initLoginModalA11y();
    fixDuplicateSecurityId();
    if (typeof w.initPostThumbnails === "function") w.initPostThumbnails();
  });

  // 找回密码交互 - 使用统一通知系统
  (function bindForgotForm($) {
    $(".forgot-form")
      .off("submit.wlForgot")
      .on("submit.wlForgot", function (e) {
        e.preventDefault();
        const $form = $(this);
        const $submit = $form.find(".submit-btn");
        const $live = $form.find(".forgot-status-live");
        $submit.prop("disabled", true);
        if ($live.length) $live.text("正在发送重置请求…");
        setLoading($submit, true, false);
        ajaxWithNotification("westlife_forgot_password", {
          user_login: $("#user_login").val(),
          nonce: $form
            .find('input[name="nonce"], input[name="security"]')
            .val(),
        })
          .done((resp) => {
            if (resp?.success) {
              if ($live.length)
                $live.text("重置邮件已发送，如未收到请稍后再试");
              if (
                !(resp && resp.notification) &&
                w.WestlifeUtils?.showMessage
              ) {
                w.Westlife.Utils.showMessage("邮件已发送", "success", 2600);
              }
              handleAjaxResponse(resp, function () {
                setTimeout(() => {
                  $(".forgot-form").removeClass("active");
                  $(".login-form").removeClass("hide");
                  $(".modal-title").text("登录");
                }, 1200);
              });
            } else {
              if ($live.length) $live.text(resp?.data?.message || "发送失败");
            }
          })
          .fail(() => {
            if ($live.length) $live.text("请求失败，请稍后重试");
          })
          .always(() => {
            setLoading($submit, false);
            $submit.prop("disabled", false);
          });
      });

    $("#showForgotForm")
      .off("click.wlForgot")
      .on("click.wlForgot", function (e) {
        e.preventDefault();
        $(".login-form").addClass("hide");
        $(".forgot-form").addClass("active");
        $(".modal-title").text("找回密码");
      });
    $("#backToLogin")
      .off("click.wlForgot")
      .on("click.wlForgot", function (e) {
        e.preventDefault();
        $(".forgot-form").removeClass("active");
        $(".login-form").removeClass("hide");
        $(".modal-title").text("登录");
      });
  })(jQuery);
})(jQuery, window, document);

// ========================
// Read Tracking
// ========================
(function (w, d) {
  const LS_KEY = "wl_read_posts";
  const COOKIE_KEY = "wl_read_posts"; // 作为备份/跨 tab 应急
  function readCookie(name) {
    const m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : "";
  }
  function writeCookie(name, val, days = 30) {
    const exp = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie =
      name + "=" + encodeURIComponent(val) + ";expires=" + exp + ";path=/";
  }
  function loadSet() {
    let arr = [];
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) arr = JSON.parse(raw) || [];
    } catch {}
    if (!Array.isArray(arr) || !arr.length) {
      // fallback cookie
      const ck = readCookie(COOKIE_KEY);
      if (ck) {
        try {
          arr = JSON.parse(ck) || [];
        } catch {
          arr = [];
        }
      }
    }
    return new Set(arr.filter((x) => Number.isInteger(+x)).map((x) => +x));
  }
  function saveSet(set) {
    const arr = Array.from(set).slice(-500); // 限制长度
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(arr));
    } catch {}
    try {
      writeCookie(COOKIE_KEY, JSON.stringify(arr));
    } catch {}
  }
  function addRead(id) {
    if (!id) return;
    const set = loadSet();
    if (!set.has(id)) {
      set.add(id);
      saveSet(set);
    }
  }
  // 进入文章详情页时记录阅读
  function detectSingle() {
    const single =
      d.body.classList.contains("single") ||
      d.body.classList.contains("single-post");
    if (!single) return;
    const el = d.querySelector('article[id^="post-"]');
    if (!el) return;
    const id = +el.id.replace("post-", "");
    if (id) addRead(id);
    if (!id || typeof window.westlife_ajax === "undefined") return;
    try {
      const onceKey = "wl_read_sync_" + id;
      if (sessionStorage.getItem(onceKey) === "1") return;
      sessionStorage.setItem(onceKey, "1");
    } catch (_) {}
    const visitorCfg = window.westlifeVisitorConfig || {};
    const visitorData = visitorCfg.visitorData || {};
    const homeProfile = visitorCfg.homeProfile || {};
    fetch(window.westlife_ajax.ajax_url, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      },
      body: new URLSearchParams({
        action: "westlife_visitor_track_read",
        nonce: window.westlife_ajax.nonce || "",
        post_id: String(id),
        email: homeProfile.email || visitorData.email || "",
        name: homeProfile.display_name || visitorData.name || "",
        url: visitorData.url || "",
      }).toString(),
    }).catch(function () {});
  }
  // 点击卡片链接后即时变为已读（提升反馈）
  function bindCardClicks() {
    d.querySelectorAll(".post-card a[href]").forEach((a) => {
      if (a.__WL_READ_BOUND__) return;
      a.__WL_READ_BOUND__ = true;
      a.addEventListener(
        "click",
        () => {
          // 找到父 article id
          let p = a.closest('article[id^="post-"]');
          if (p) {
            const id = +p.id.replace("post-", "");
            if (id) {
              addRead(id);
            }
          }
        },
        { passive: true }
      );
    });
  }
  function refresh() {
    bindCardClicks();
  }
  function init() {
    detectSingle();
    refresh();
  }
  // 暴露 API
  try {
    w.WestlifePostBadges = w.WestlifePostBadges || {};
    Object.assign(w.WestlifePostBadges, {
      refresh,
      addRead(id) {
        addRead(id);
      },
      _debugLoadSet: loadSet,
    });
  } catch (_) {}
  if (w.WestlifeApp && typeof w.WestlifeApp.register === "function") {
    w.WestlifeApp.register({
      name: "post-badges",
      match(context) {
        const root = context && context.nodeType === 1 ? context : d;
        return !!root.querySelector(
          ".post-thumbnail-wrapper[data-post-id], .post-card, article[id^='post-']"
        );
      },
      init() {
        init();
        w.addEventListener("pageshow", refresh);
      },
      destroy() {},
    });
  } else {
    if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", init);
    else init();
    w.addEventListener("pageshow", refresh);
  }
})(window, document);

// ========================
// Logout Confirm Dialog
// ========================
(function (w, d) {
  function initLogoutConfirm() {
    const avatarBtn = d.querySelector(".user-profile .user-avatar");
    const dialog = d.querySelector(".logout-confirm");
    if (!avatarBtn || !dialog) return;
    if (dialog.__WL_INIT__) return;
    dialog.__WL_INIT__ = true;
    const cancelBtn = dialog.querySelector(".btn-logout-cancel");
    const confirmBtn = dialog.querySelector(".btn-logout-confirm");
    let lastFocus = null;
    function open() {
      if (dialog.getAttribute("aria-hidden") === "false") return;
      lastFocus = d.activeElement;
      dialog.setAttribute("aria-hidden", "false");
      // 焦点转移
      setTimeout(() => {
        (confirmBtn || cancelBtn || dialog).focus();
      }, 10);
      d.body.classList.add("modal-open");
      w.addEventListener("keydown", onKeyDown);
      setTimeout(() => {
        dialog.classList.add("is-open");
      }, 0);
    }
    function close() {
      if (dialog.getAttribute("aria-hidden") === "true") return;
      dialog.setAttribute("aria-hidden", "true");
      dialog.classList.remove("is-open");
      w.removeEventListener("keydown", onKeyDown);
      d.body.classList.remove("modal-open");
      if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
    }
    function onKeyDown(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
      if (e.key === "Tab") {
        // 简单焦点环
        const focusables = Array.from(
          dialog.querySelectorAll(
            'button, a[href], [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => !el.disabled && el.offsetParent !== null);
        if (!focusables.length) return;
        let idx = focusables.indexOf(d.activeElement);
        if (e.shiftKey) {
          if (idx <= 0) {
            idx = focusables.length - 1;
            e.preventDefault();
            focusables[idx].focus();
          }
        } else {
          if (idx === focusables.length - 1) {
            idx = 0;
            e.preventDefault();
            focusables[idx].focus();
          }
        }
      }
    }
    // 点击头像退出图标：仅当 hover 状态可见时允许触发（简单判断）
    avatarBtn.addEventListener("click", (e) => {
      // 仅当点击在退出图标或其包裹区域时触发
      if (e.target.closest(".icon-hover")) {
        e.preventDefault();
        open();
      }
    });
    // 外层点击关闭（点击遮罩）
    dialog.addEventListener("mousedown", (e) => {
      if (e.target === dialog) close();
    });
    cancelBtn &&
      cancelBtn.addEventListener("click", (e) => {
        e.preventDefault();
        close();
      });
    // confirmBtn 直接跳转（已有href）
  }
  if (w.WestlifeApp && typeof w.WestlifeApp.register === "function") {
    w.WestlifeApp.register({
      name: "logout-confirm",
      match(context) {
        const root = context && context.nodeType === 1 ? context : d;
        return !!root.querySelector(".logout-confirm, .user-profile .user-avatar");
      },
      init() {
        initLogoutConfirm();
      },
      destroy() {},
    });
  } else {
    if (d.readyState === "loading")
      d.addEventListener("DOMContentLoaded", initLogoutConfirm);
    else initLogoutConfirm();
  }
})(window, document);

// ========================
// Home Page Inline Script Migration
// ========================
(function (w, d) {
  function isHome() {
    return (
      d.body.classList.contains("home") ||
      d.body.classList.contains("blog") ||
      d.body.classList.contains("front-page")
    );
  }

  function initHomeInline() {
    if (!d.body || !isHome()) return;
    const corner = d.querySelector(".rss-corner");
    if (!corner || corner.__WL_HOME_INLINE_BOUND__) return;
    corner.__WL_HOME_INLINE_BOUND__ = true;
    const btn = corner.querySelector(".rss-corner-btn");
    const pop = corner.querySelector(".rss-popover");
    const copyBtn = corner.querySelector(".rss-copy-btn");
    const feed =
      corner.getAttribute("data-feed-url") ||
      (copyBtn ? copyBtn.getAttribute("data-copy") : "");
    let hideTimer = null,
      resetTimer = null;
    function openPop() {
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
      if (pop) {
        pop.hidden = false;
        pop.classList.add("open");
      }
    }
    function closePop() {
      if (!pop) return;
      hideTimer = setTimeout(() => {
        pop.classList.remove("open");
        pop.hidden = true;
      }, 220);
    }
    function doCopy() {
      if (!feed) return;
      const done = () => {
        if (copyBtn) {
          const prev = copyBtn.getAttribute("data-prev") || copyBtn.innerHTML;
          copyBtn.setAttribute("data-prev", prev);
          copyBtn.classList.add("copied");
          copyBtn.innerHTML = `${icon("check", {
            "aria-hidden": "true",
          })}<span>已复制</span>`;
          if (resetTimer) clearTimeout(resetTimer);
          resetTimer = setTimeout(() => {
            copyBtn.classList.remove("copied");
            copyBtn.innerHTML = copyBtn.getAttribute("data-prev") || prev;
          }, 2200);
        }
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard
          .writeText(feed)
          .then(done)
          .catch(() => {
            const ta = d.createElement("textarea");
            ta.value = feed;
            d.body.appendChild(ta);
            ta.select();
            try {
              d.execCommand("copy");
            } catch (e) {}
            d.body.removeChild(ta);
            done();
          });
      } else {
        const ta = d.createElement("textarea");
        ta.value = feed;
        d.body.appendChild(ta);
        ta.select();
        try {
          d.execCommand("copy");
        } catch (e) {}
        d.body.removeChild(ta);
        done();
      }
    }
    btn && btn.addEventListener("mouseenter", openPop);
    btn && btn.addEventListener("focus", openPop);
    pop && pop.addEventListener("mouseenter", openPop);
    btn && btn.addEventListener("mouseleave", closePop);
    pop && pop.addEventListener("mouseleave", closePop);
    btn &&
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        doCopy();
      });
    copyBtn &&
      copyBtn.addEventListener("click", (e) => {
        e.preventDefault();
        doCopy();
      });
  }
  if (w.WestlifeApp && typeof w.WestlifeApp.register === "function") {
    w.WestlifeApp.register({
      name: "home-inline",
      match(context) {
        const root = context && context.nodeType === 1 ? context : d;
        return !!root.querySelector(".rss-corner");
      },
      init() {
        initHomeInline();
      },
      destroy() {},
    });
  } else {
    initHomeInline();
  }
})(window, document);
