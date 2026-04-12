/**
 * Westlife Turnstile - Cloudflare风格的验证组件
 * 独立的验证码模块
 * @package Westlife
 * @since 2.0.0
 */

(function () {
  "use strict";

  class WestlifeTurnstile {
    constructor(form) {
      this.form = form;
      this.ajaxUrl =
        (window.westlifeComment && window.westlifeComment.ajaxUrl) ||
        (window.westlifeSettings &&
          (westlifeSettings.ajaxUrl || westlifeSettings.ajaxurl)) ||
        window.ajaxurl ||
        "/wp-admin/admin-ajax.php";
      this.nonce =
        (window.westlifeSettings && window.westlifeSettings.nonce) ||
        (window.westlifeComment && window.westlifeComment.ajaxNonce) ||
        (window.westlifeAjax && window.westlifeAjax.nonce) ||
        (window.westlifeComment && window.westlifeComment.nonce) ||
        "";
      this.clickListenerAdded = false;
      this.captchaShown = false;
      this.showCaptchaHandler = null; // 保存监听器函数，以便移除
      this.commentEditor = null; // 保存评论输入框引用

    }

    /**
     * 检查是否需要显示验证码
     */
    async shouldShowCaptcha() {
      // 检查登录状态
      const isLoggedIn =
        window.westlifeSettings?.isLoggedIn ||
        document.body.classList.contains("logged-in");

      if (isLoggedIn) {
        return false;
      }

      // 检查邮箱是否为信任用户
      const emailEl = this.form.querySelector('#email, input[name="email"]');
      const emailVal = (emailEl?.value || "").trim().toLowerCase();

      if (!emailVal) {
        return true; // 没有邮箱，显示验证码
      }

      // 检查本地缓存的评论数
      const localCount = this.getLocalCommentCount(emailVal);

      if (localCount >= 3) {
        return false; // 本地信任用户
      }

      // 异步查询服务器
      try {
        const count = await this.getServerCommentCount(emailVal);

        if (count >= 3) {
          // 更新本地缓存
          this.updateLocalCommentCount(emailVal, count);
          return false; // 服务器信任用户
        }
      } catch (error) {
        console.error("[Turnstile] ✗ 查询评论数失败:", error);
      }

      return true; // 显示验证码
    }

    /**
     * 获取本地缓存的评论数
     */
    getLocalCommentCount(email) {
      try {
        const map = JSON.parse(
          localStorage.getItem("guest_comment_counts") || "{}"
        );
        return Number(map[email]) || 0;
      } catch (_) {
        return 0;
      }
    }

    /**
     * 更新本地缓存的评论数
     */
    updateLocalCommentCount(email, count) {
      try {
        const map = JSON.parse(
          localStorage.getItem("guest_comment_counts") || "{}"
        );
        map[email] = Math.max(Number(map[email]) || 0, count);
        localStorage.setItem("guest_comment_counts", JSON.stringify(map));
      } catch (_) {}
    }

    /**
     * 从服务器获取评论数
     */
    async getServerCommentCount(email) {
      const fd = new FormData();
      fd.append("action", "westlife_get_approved_comment_count");
      fd.append("nonce", this.nonce);
      fd.append("email", email);

      const response = await fetch(this.ajaxUrl, { method: "POST", body: fd });
      const data = await response.json();

      if (
        data &&
        data.success &&
        data.data &&
        typeof data.data.count !== "undefined"
      ) {
        return Number(data.data.count);
      }

      console.warn("[Turnstile] ✗ 服务器返回失败或格式错误:", data);
      return 0;
    }

    /**
     * 注入验证码组件（延迟显示，点击评论框时才显示）
     */
    async inject(options = {}) {
      const shouldShow = await this.shouldShowCaptcha();

      // 移除现有的验证码
      const existingWidgets = this.form.querySelectorAll(
        ".wl-turnstile-widget"
      );
      existingWidgets.forEach((widget) => widget.remove());

      if (!shouldShow) {
        // 移除点击监听器（如果已添加）
        this.removeClickListener();
        return; // 不需要显示验证码
      }

      // 不立即显示，等待用户点击评论框
      if (!this.clickListenerAdded) {
        this.addClickListener();
      }
    }

    /**
     * 添加点击监听器，点击评论框时显示验证码
     */
    addClickListener() {
      this.commentEditor = this.form.querySelector(
        "#comment-editor, #comment, textarea[name='comment']"
      );

      if (!this.commentEditor) {
        console.warn("[Turnstile] 未找到评论输入框");
        return;
      }

      this.showCaptchaHandler = () => {
        // 只显示一次
        if (this.captchaShown) return;
        this.captchaShown = true;

        // 找到提交按钮 - 支持多种选择器
        const submitBtn = this.form.querySelector(
          '.submit-comment, #submit, input[type="submit"], button[type="submit"]'
        );

        if (!submitBtn) {
          console.warn("[Turnstile] 未找到提交按钮");
          return;
        }

        // 创建验证码组件
        const wrapper = document.createElement("div");
        wrapper.className = "wl-turnstile-widget";
        submitBtn.parentNode.insertBefore(wrapper, submitBtn);

        this.renderWidget(wrapper);
      };

      // 监听点击和聚焦事件
      this.commentEditor.addEventListener("click", this.showCaptchaHandler, {
        once: false,
      });
      this.commentEditor.addEventListener("focus", this.showCaptchaHandler, {
        once: false,
      });

      this.clickListenerAdded = true;
    }

    /**
     * 移除点击监听器
     */
    removeClickListener() {
      if (this.commentEditor && this.showCaptchaHandler) {
        this.commentEditor.removeEventListener(
          "click",
          this.showCaptchaHandler
        );
        this.commentEditor.removeEventListener(
          "focus",
          this.showCaptchaHandler
        );
        this.clickListenerAdded = false;
      }
    }

    /**
     * 渲染验证码组件
     */
    renderWidget(wrapper) {
      wrapper.innerHTML = `
        <div class="wl-turnstile-box">
          <div class="wl-turnstile-inner">
            <div class="wl-turnstile-checkbox">
              <input type="checkbox" id="wl-verify-checkbox" class="wl-verify-checkbox" />
              <label for="wl-verify-checkbox" class="wl-checkbox-label">
                <span class="wl-checkbox-icon"></span>
              </label>
            </div>
            <div class="wl-turnstile-text">
              <span class="wl-verify-text">验证您是人类</span>
              <span class="wl-verify-success" style="display:none;">验证成功</span>
            </div>
            <div class="wl-turnstile-spinner"></div>
          </div>
          <div class="wl-turnstile-footer">
            <div class="wl-turnstile-logo">
              <span class="logo-line">WESTLIFE</span>
              <span class="logo-line">SECURITY</span>
            </div>
          </div>
        </div>
      `;

      const checkbox = wrapper.querySelector(".wl-verify-checkbox");
      const spinner = wrapper.querySelector(".wl-turnstile-spinner");
      const textSpan = wrapper.querySelector(".wl-verify-text");
      const successSpan = wrapper.querySelector(".wl-verify-success");
      const box = wrapper.querySelector(".wl-turnstile-box");

      checkbox.addEventListener("change", async () => {
        if (checkbox.checked) {
          await this.verify(box, checkbox, spinner, textSpan, successSpan);
        }
      });
    }

    /**
     * 执行验证
     */
    async verify(box, checkbox, spinner, textSpan, successSpan) {
      // 开始验证动画
      box.classList.add("wl-verifying");
      spinner.style.display = "block";
      textSpan.textContent = "正在验证...";

      try {
        // 请求服务器生成token
        const response = await this.requestToken();

        if (response.success) {
          // 验证成功
          await new Promise((resolve) => setTimeout(resolve, 1200));
          box.classList.remove("wl-verifying");
          box.classList.add("wl-verified");
          spinner.style.display = "none";
          textSpan.style.display = "none";
          successSpan.style.display = "block";
          checkbox.disabled = true;

          // 存储token到隐藏字段
          this.storeToken(response.data.token);
        } else {
          throw new Error("验证失败");
        }
      } catch (error) {
        // 验证失败
        console.error("[Turnstile] 验证失败:", error);
        await new Promise((resolve) => setTimeout(resolve, 800));
        box.classList.remove("wl-verifying");
        box.classList.add("wl-verify-failed");
        spinner.style.display = "none";
        checkbox.checked = false;
        textSpan.textContent = "验证失败，请重试";

        setTimeout(() => {
          box.classList.remove("wl-verify-failed");
          textSpan.textContent = "验证您是人类";
        }, 2000);
      }
    }

    /**
     * 请求服务器生成token
     */
    async requestToken() {
      const fd = new FormData();
      fd.append("action", "westlife_generate_captcha_token");
      fd.append("nonce", this.nonce);
      fd.append("timestamp", Date.now());

      const response = await fetch(this.ajaxUrl, { method: "POST", body: fd });
      return await response.json();
    }

    /**
     * 存储token到隐藏字段
     */
    storeToken(token) {
      let tokenInput = this.form.querySelector(
        'input[name="wl_captcha_token"]'
      );
      if (!tokenInput) {
        tokenInput = document.createElement("input");
        tokenInput.type = "hidden";
        tokenInput.name = "wl_captcha_token";
        this.form.appendChild(tokenInput);
      }
      tokenInput.value = token;
    }

    /**
     * 验证是否已完成验证
     */
    isVerified() {
      const widget = this.form.querySelector(".wl-turnstile-widget");
      if (!widget) {
        return true; // 没有验证码组件，视为已验证
      }

      const verifiedBox = widget.querySelector(".wl-turnstile-box.wl-verified");
      const tokenInput = this.form.querySelector(
        'input[name="wl_captcha_token"]'
      );

      return verifiedBox && tokenInput && tokenInput.value;
    }

    /**
     * 重置验证状态
     */
    reset() {
      const tokenInput = this.form.querySelector(
        'input[name="wl_captcha_token"]'
      );
      if (tokenInput) {
        tokenInput.remove();
      }
      // 移除现有验证码
      const existingWidgets = this.form.querySelectorAll(
        ".wl-turnstile-widget"
      );
      existingWidgets.forEach((widget) => widget.remove());

      // 重置标志，允许再次显示
      this.captchaShown = false;

      // 重新注入验证码（会重新添加监听器）
      this.inject({ skipAsync: true });
    }
  }

  // 暴露到全局
  window.WestlifeTurnstile = WestlifeTurnstile;
})();
