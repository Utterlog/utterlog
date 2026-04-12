/**
 * WordPress 后台统一弹窗工具类
 * 
 * @package Westlife
 * @since 1.1.0
 */

(function ($) {
  "use strict";

  /**
   * 弹窗管理器
   */
  window.WestlifeModal = {
    /**
     * 显示确认对话框
     * 
     * @param {Object} options 配置选项
     * @param {string} options.title 标题
     * @param {string} options.message 消息内容
     * @param {string} options.type 类型：'warning', 'danger', 'info', 'success'
     * @param {string} options.confirmText 确认按钮文本
     * @param {string} options.cancelText 取消按钮文本
     * @param {Function} options.onConfirm 确认回调
     * @param {Function} options.onCancel 取消回调
     * @returns {Promise} 返回 Promise，确认时 resolve，取消时 reject
     */
    confirm: function (options) {
      const defaults = {
        title: "确认操作",
        message: "您确定要执行此操作吗？",
        type: "warning", // 'warning', 'danger', 'info', 'success'
        confirmText: "确认",
        cancelText: "取消",
        confirmClass: "primary", // 'primary', 'danger', 'success'
        onConfirm: null,
        onCancel: null,
      };

      const config = $.extend({}, defaults, options);

      return new Promise((resolve, reject) => {
        // 创建弹窗 HTML
        const iconMap = {
          warning: '<i class="dashicons dashicons-warning"></i>',
          danger:
            '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 9v3.75M2.697 16.126c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>',
          info: '<i class="dashicons dashicons-info"></i>',
          success: '<i class="dashicons dashicons-yes-alt"></i>',
        };

        const modalHtml = `
          <div class="westlife-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="westlife-modal-title">
            <div class="westlife-modal">
              <div class="westlife-modal-header">
                <div class="westlife-modal-icon ${config.type}">
                  ${iconMap[config.type] || iconMap.warning}
                </div>
                <h3 class="westlife-modal-title" id="westlife-modal-title">${config.title}</h3>
                <p class="westlife-modal-message">${config.message}</p>
              </div>
              <div class="westlife-modal-actions">
                <button type="button" class="westlife-modal-btn ${config.confirmClass}" data-action="confirm">
                  ${config.confirmText}
                </button>
                <button type="button" class="westlife-modal-btn secondary" data-action="cancel">
                  ${config.cancelText}
                </button>
              </div>
            </div>
          </div>
        `;

        // 添加到 body
        const $modal = $(modalHtml).appendTo("body");

        // 显示动画
        setTimeout(() => $modal.addClass("is-visible"), 10);

        // 确认按钮
        $modal.find('[data-action="confirm"]').on("click", function () {
          if (config.onConfirm) {
            config.onConfirm();
          }
          WestlifeModal.close($modal);
          resolve(true);
        });

        // 取消按钮
        $modal.find('[data-action="cancel"]').on("click", function () {
          if (config.onCancel) {
            config.onCancel();
          }
          WestlifeModal.close($modal);
          reject(false);
        });

        // 点击遮罩关闭
        $modal.on("click", function (e) {
          if ($(e.target).hasClass("westlife-modal-overlay")) {
            if (config.onCancel) {
              config.onCancel();
            }
            WestlifeModal.close($modal);
            reject(false);
          }
        });

        // ESC 键关闭
        $(document).on("keydown.westlifeModal", function (e) {
          if (e.key === "Escape") {
            if (config.onCancel) {
              config.onCancel();
            }
            WestlifeModal.close($modal);
            reject(false);
          }
        });
      });
    },

    /**
     * 显示提示对话框（只有确认按钮）
     * 
     * @param {Object} options 配置选项
     * @returns {Promise}
     */
    alert: function (options) {
      const defaults = {
        title: "提示",
        message: "",
        type: "info",
        confirmText: "确定",
        confirmClass: "primary",
        onConfirm: null,
      };

      const config = $.extend({}, defaults, options);

      return new Promise((resolve) => {
        const iconMap = {
          warning: '<i class="dashicons dashicons-warning"></i>',
          danger:
            '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 9v3.75M2.697 16.126c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>',
          info: '<i class="dashicons dashicons-info"></i>',
          success: '<i class="dashicons dashicons-yes-alt"></i>',
        };

        const modalHtml = `
          <div class="westlife-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="westlife-modal-title">
            <div class="westlife-modal">
              <div class="westlife-modal-header">
                <div class="westlife-modal-icon ${config.type}">
                  ${iconMap[config.type] || iconMap.info}
                </div>
                <h3 class="westlife-modal-title" id="westlife-modal-title">${config.title}</h3>
                <p class="westlife-modal-message">${config.message}</p>
              </div>
              <div class="westlife-modal-actions">
                <button type="button" class="westlife-modal-btn ${config.confirmClass}" data-action="confirm">
                  ${config.confirmText}
                </button>
              </div>
            </div>
          </div>
        `;

        const $modal = $(modalHtml).appendTo("body");

        setTimeout(() => $modal.addClass("is-visible"), 10);

        $modal.find('[data-action="confirm"]').on("click", function () {
          if (config.onConfirm) {
            config.onConfirm();
          }
          WestlifeModal.close($modal);
          resolve(true);
        });

        $modal.on("click", function (e) {
          if ($(e.target).hasClass("westlife-modal-overlay")) {
            WestlifeModal.close($modal);
            resolve(true);
          }
        });

        $(document).on("keydown.westlifeModal", function (e) {
          if (e.key === "Escape") {
            WestlifeModal.close($modal);
            resolve(true);
          }
        });
      });
    },

    /**
     * 显示 Toast 通知（自动消失）
     * 
     * @param {string} message 消息内容
     * @param {string} type 类型：'success', 'error', 'warning', 'info'
     * @param {number} duration 显示时长（毫秒），默认 3000
     */
    toast: function (message, type = "info", duration = 3000) {
      const toastHtml = `
        <div class="westlife-toast ${type}">
          ${message}
        </div>
      `;

      const $toast = $(toastHtml).appendTo("body");

      setTimeout(() => {
        $toast.remove();
      }, duration);
    },

    /**
     * 关闭弹窗
     * 
     * @param {jQuery} $modal jQuery 弹窗对象
     */
    close: function ($modal) {
      $(document).off("keydown.westlifeModal");
      $modal.removeClass("is-visible");
      setTimeout(() => {
        $modal.remove();
      }, 300);
    },

    /**
     * 自定义弹窗（完全自定义内容）
     * 
     * @param {Object} options 配置选项
     * @param {string} options.title 标题
     * @param {string} options.content HTML 内容
     * @param {Array} options.buttons 按钮数组 [{text, class, onClick}]
     * @returns {jQuery} 返回弹窗 jQuery 对象
     */
    custom: function (options) {
      const defaults = {
        title: "",
        content: "",
        buttons: [],
      };

      const config = $.extend({}, defaults, options);

      let buttonsHtml = "";
      if (config.buttons.length > 0) {
        config.buttons.forEach((btn) => {
          buttonsHtml += `<button type="button" class="westlife-modal-btn ${
            btn.class || "primary"
          }" data-custom-action>${btn.text || "按钮"}</button>`;
        });
      }

      const modalHtml = `
        <div class="westlife-modal-overlay" role="dialog" aria-modal="true">
          <div class="westlife-modal">
            ${
              config.title
                ? `
              <div class="westlife-modal-header">
                <h3 class="westlife-modal-title">${config.title}</h3>
              </div>
            `
                : ""
            }
            <div class="westlife-modal-content">
              ${config.content}
            </div>
            ${
              buttonsHtml
                ? `
              <div class="westlife-modal-actions">
                ${buttonsHtml}
              </div>
            `
                : ""
            }
          </div>
        </div>
      `;

      const $modal = $(modalHtml).appendTo("body");

      setTimeout(() => $modal.addClass("is-visible"), 10);

      // 绑定按钮事件
      $modal.find('[data-custom-action]').each(function (index) {
        const btn = config.buttons[index];
        $(this).on("click", function () {
          if (btn.onClick) {
            btn.onClick($modal);
          } else {
            WestlifeModal.close($modal);
          }
        });
      });

      // 点击遮罩关闭
      $modal.on("click", function (e) {
        if ($(e.target).hasClass("westlife-modal-overlay")) {
          WestlifeModal.close($modal);
        }
      });

      // ESC 键关闭
      $(document).on("keydown.westlifeModal", function (e) {
        if (e.key === "Escape") {
          WestlifeModal.close($modal);
        }
      });

      return $modal;
    },
  };
})(jQuery);

