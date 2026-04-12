/**
 * Hero 背景图加载动画触发
 * 页面加载时自动触发各种动画效果
 */

(function () {
  "use strict";

  let heroAnimationsInitialized = false;

  // 所有 Hero 选择器
  const heroSelectors = [
    ".links-hero",
    ".memos-hero",
    ".feeds-hero",
    ".vm-hero",
    ".about-hero",
    ".archive-hero",
    ".posts-list-hero",
  ];

  // 查找当前页面的 Hero 元素
  function findHeroElement() {
    for (const selector of heroSelectors) {
      const hero = document.querySelector(selector);
      if (hero) {
        return hero;
      }
    }
    return null;
  }

  // 触发加载动画
  function triggerLoadAnimation() {
    const hero = findHeroElement();
    if (!hero) return;

    // 添加加载完成类，触发CSS动画
    // 稍微延迟以确保页面已渲染
    setTimeout(() => {
      hero.classList.add("is-loaded");
    }, 100);

  }

  // 监听主题切换，重新触发动画
  function setupThemeChangeListener() {
    const hero = findHeroElement();
    if (!hero) return;

    // 方法1: MutationObserver 监听 data-theme 变化
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (
          mutation.type === "attributes" &&
          mutation.attributeName === "data-theme"
        ) {
          // 移除类然后重新添加，触发动画
          hero.classList.remove("is-loaded");
          setTimeout(() => {
            hero.classList.add("is-loaded");
          }, 50);
        }
      });
    });

    const targetNode = document.documentElement || document.body;
    observer.observe(targetNode, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    // 方法2: 监听点击主题切换按钮
    const themeToggles = document.querySelectorAll(
      "[data-toggle-theme], .theme-toggle, #theme-toggle"
    );
    themeToggles.forEach((toggle) => {
      toggle.addEventListener("click", function () {
        setTimeout(() => {
          hero.classList.remove("is-loaded");
          setTimeout(() => {
            hero.classList.add("is-loaded");
          }, 50);
        }, 100);
      });
    });
  }

  // 初始化
  function init() {
    if (heroAnimationsInitialized) return;
    heroAnimationsInitialized = true;
    // 页面加载后触发动画
    triggerLoadAnimation();
    
    // 设置主题切换监听
    setupThemeChangeListener();
  }

  function destroy() {
    heroAnimationsInitialized = false;
  }

  if (window.WestlifeApp && typeof window.WestlifeApp.register === "function") {
    window.WestlifeApp.register({
      name: "hero-animations",
      match(context) {
        const root = context && context.nodeType === 1 ? context : document;
        return !!root.querySelector(
          ".links-hero, .memos-hero, .feeds-hero, .vm-hero, .about-hero, .archive-hero, .posts-list-hero"
        );
      },
      init() {
        init();
      },
      destroy() {
        destroy();
      },
    });
  } else {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }
})();
