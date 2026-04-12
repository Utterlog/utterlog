/**
 * Westlife 主题后台管理脚本（重写/优化/注释）
 * @package Westlife
 * @version 1.0.1
 */

(function ($) {
  "use strict";

  // ------------------------------
  // 工具集（仅后台脚本使用，不污染全局）
  const AdminUtils = (() => {
    function ajax(action, data = {}, method = "POST") {
      if (window.WestlifeUtils?.ajax) {
        return window.WestlifeUtils.ajax(action, data);
      }
      const ajaxUrl = window.westlifeAdmin?.ajaxurl || window.ajaxurl;
      const nonce = window.westlifeAdmin?.nonce || "";
      if (!ajaxUrl) {
        return $.Deferred().reject("无效的 ajaxurl").promise();
      }
      return $.ajax({
        url: ajaxUrl,
        type: method,
        data: { action, nonce, ...data },
      });
    }
    function notice(type, message, duration = 3000) {
      const $anchor = $(".wrap > h1").first();
      const $n = $(
        `<div class="notice notice-${type} is-dismissible"><p>${message}</p></div>`
      );
      if ($anchor.length) {
        $n.insertAfter($anchor);
      } else {
        $("body").append($n);
      }
      setTimeout(() => $n.fadeOut(200, () => $n.remove()), duration);
    }
    function setLoading($el, loading, text) {
      if (window.WestlifeUtils?.setLoading) {
        return window.WestlifeUtils.setLoading($el, loading, text);
      }
      const $b = $el && ($el.jquery ? $el : $($el));
      if (!$b || !$b.length) return;
      const $txt = $b.find(".button-text");
      if (loading) {
        $b.prop("disabled", true).addClass("loading");
        if ($txt.length && text) {
          if (!$b.data("orig-text")) $b.data("orig-text", $txt.text());
          $txt.text(text);
        }
      } else {
        $b.prop("disabled", false).removeClass("loading");
        if ($txt.length && $b.data("orig-text")) {
          $txt.text($b.data("orig-text"));
          $b.removeData("orig-text");
        }
      }
    }
    return { ajax, notice, setLoading };
  })();

  // ------------------------------
  // 图片 CDN 配置
  // ------------------------------
  function normalizeCdnBase(url) {
    if (!url) return "";
    url = url.replace(/\/+$/, "");
    if (/^https?:\/\//i.test(url)) return url;
    return (url.indexOf("/") === 0 ? location.origin : "") + url;
  }
  function getCdnConfig() {
    const enabled = !!(
      $("#enable_image_cdn").prop("checked") ||
      window.westlifeAdmin?.cdn?.enabled
    );
    const fromInput = ($("#image_cdn_base").val() || "").trim();
    const base = normalizeCdnBase(
      fromInput || window.westlifeAdmin?.cdn?.base || ""
    );
    return { enabled: enabled && !!base, base };
  }
  function rewriteToCdn(url) {
    const cfg = getCdnConfig();
    if (!cfg.enabled) return url;
    const uploadsBase = (window.westlifeAdmin?.uploads?.baseurl || "").replace(
      /\/$/,
      ""
    );
    if (!uploadsBase) return url;
    if (url.indexOf(uploadsBase) !== 0) return url;
    const rel = url.slice(uploadsBase.length);
    const join = (a, b) =>
      a.replace(/\/$/, "") + "/" + String(b || "").replace(/^\//, "");
    return join(cfg.base, rel);
  }

  // ------------------------------
  // 自定义社交链接管理
  // ------------------------------
  class SocialLinksManager {
    constructor() {
      this.$tbody = $(".custom-social-links"); // <tbody>
      this.bind();
    }
    bind() {
      if (!this.$tbody.length) return;
      $(".add-social-link").on("click", () => this.add());
      $(document).on("click", ".remove-social-link", (e) => {
        $(e.currentTarget).closest(".custom-social-link-item").remove();
        this.reindex();
      });
    }
    add() {
      const idx = this.$tbody.children(".custom-social-link-item").length;
      const tpl = `
        <tr class="custom-social-link-item">
          <th scope="row">
            <div class="social-link-header">
              <span class="link-number">#${idx + 1}</span>
              <button type="button" class="button-link remove-social-link" aria-label="删除此链接">
                <i class="dashicons dashicons-trash"></i>
              </button>
            </div>
          </th>
          <td>
            <div class="social-link-fields">
              <p><input type="text" name="social_custom_links[${idx}][name]" class="regular-text" placeholder="${
        i18n.socialNamePlaceholder
      }"></p>
              <p><input type="text" name="social_custom_links[${idx}][icon]" class="regular-text" placeholder="${
        i18n.socialIconPlaceholder
      }"></p>
              <p><input type="url"  name="social_custom_links[${idx}][url]"  class="regular-text" placeholder="${
        i18n.socialUrlPlaceholder
      }"></p>
            </div>
          </td>
        </tr>
      `;
      this.$tbody.append(tpl);
      this.reindex();
    }
    reindex() {
      this.$tbody.find(".custom-social-link-item").each((i, tr) => {
        const $tr = $(tr);
        $tr.find(".link-number").text("#" + (i + 1));
        $tr.find("input").each(function () {
          const name = $(this)
            .attr("name")
            ?.replace(/\[\d+\]/, `[${i}]`);
          if (name) $(this).attr("name", name);
        });
      });
    }
  }

  // ------------------------------
  // 启动
  // ------------------------------
  $(function () {
    if ($(".custom-social-links").length) new SocialLinksManager();

    // 自动隐藏 WP 核心提示（仅成功/信息类）
    (function autoDismissWpNotices() {
      function apply(ctx) {
        $(".wrap .notice", ctx || document).each(function () {
          const $n = $(this);
          if ($n.data("wlAutodismiss")) return;
          const isError = $n.hasClass("notice-error") || $n.hasClass("error");
          const isSuccess =
            $n.hasClass("notice-success") || $n.hasClass("updated");
          const isInfo = $n.hasClass("notice-info");
          let ms = isSuccess ? 2600 : isInfo ? 4000 : 0;
          if (!ms) return;
          $n.data("wlAutodismiss", 1);
          let timer = setTimeout(() => $n.fadeOut(200, () => $n.remove()), ms);
          $n.on("mouseenter", () => {
            if (timer) {
              clearTimeout(timer);
              timer = 0;
            }
          });
          $n.on("mouseleave", () => {
            if (!timer)
              timer = setTimeout(
                () => $n.fadeOut(200, () => $n.remove()),
                1200
              );
          });
        });
      }
      apply();
      $(document).ajaxComplete(() => apply());
    })();

    // 测试API连接
    $("#test-api-connection").on("click", function () {
      const $btn = $(this);
      const $results = $("#debug-results");
      const $content = $("#debug-content");
      if ($btn.prop("disabled")) return;
      $btn.prop("disabled", true);
      $results.show();
      $content.text("正在测试 API 连接...");
      AdminUtils.ajax("westlife_test_api_connection")
        .done(function (response) {
          if (response.success) {
            $content.text(
              "✅ API 连接正常\n\n" + JSON.stringify(response.data, null, 2)
            );
            AdminUtils.notice("success", "API 连接测试成功");
          } else {
            $content.text(
              "❌ API 连接失败\n\n错误: " + (response.data || "未知错误")
            );
            AdminUtils.notice("error", "API 连接测试失败");
          }
        })
        .fail(function () {
          $content.text("❌ 请求失败，请检查网络连接");
          AdminUtils.notice("error", "测试请求失败");
        })
        .always(function () {
          $btn.prop("disabled", false);
        });
    });

    // 调试缓存状态
    $("#debug-cache-status").on("click", function () {
      const $btn = $(this);
      const $results = $("#debug-results");
      const $content = $("#debug-content");
      if ($btn.prop("disabled")) return;
      $btn.prop("disabled", true);
      $results.show();
      $content.text("正在获取缓存状态...");
      AdminUtils.ajax("westlife_debug_cache")
        .done(function (response) {
          if (response.success) {
            $content.text(
              "🔍 缓存状态调试信息\n\n" + JSON.stringify(response.data, null, 2)
            );
            AdminUtils.notice("success", "缓存状态获取成功");
          } else {
            $content.text(
              "❌ 获取缓存状态失败\n\n错误: " + (response.data || "未知错误")
            );
            AdminUtils.notice("error", "缓存状态获取失败");
          }
        })
        .fail(function () {
          $content.text("❌ 请求失败，请检查网络连接");
          AdminUtils.notice("error", "调试请求失败");
        })
        .always(function () {
          $btn.prop("disabled", false);
        });
    });

    // Umami 连接测试
    $("#test-umami-connection").on("click", function () {
      const $btn = $(this);
      const $result = $("#umami-test-result");
      
      if ($btn.prop("disabled")) return;
      
      const siteId = $("#westlife_umami_site_id").val()?.trim();
      const hostUrl = $("#westlife_umami_host_url").val()?.trim();
      const apiToken = $("#westlife_umami_api_token").val()?.trim();
      
      if (!siteId || !hostUrl || !apiToken) {
        $result.html('<div class="notice notice-error inline"><p>❌ 请先填写完整的 Umami 配置信息</p></div>');
        return;
      }
      
      $btn.prop("disabled", true).text("测试中...");
      $result.html('<div class="notice notice-info inline"><p>⏳ 正在测试 Umami 连接...</p></div>');
      
      AdminUtils.ajax("westlife_test_umami_connection", {
        site_id: siteId,
        host_url: hostUrl,
        api_token: apiToken
      })
        .done(function (response) {
          if (response.success) {
            $result.html('<div class="notice notice-success inline"><p>✅ Umami 连接测试成功！<br>' + (response.data?.message || '配置正确，可以正常获取统计数据。') + '</p></div>');
            AdminUtils.notice("success", "Umami 连接测试成功");
          } else {
            $result.html('<div class="notice notice-error inline"><p>❌ Umami 连接测试失败<br>' + (response.data?.message || response.data || '请检查配置是否正确') + '</p></div>');
            AdminUtils.notice("error", "Umami 连接测试失败");
          }
        })
        .fail(function (xhr) {
          let errorMsg = "请求失败，请检查网络连接";
          try {
            const resp = xhr.responseJSON;
            if (resp?.data?.message) errorMsg = resp.data.message;
          } catch (e) {}
          $result.html('<div class="notice notice-error inline"><p>❌ ' + errorMsg + '</p></div>');
          AdminUtils.notice("error", "Umami 测试请求失败");
        })
        .always(function () {
          $btn.prop("disabled", false).text("测试连接");
        });
    });

    // 图片 CDN 开关与地址输入
    const $cdnToggle = $("#enable_image_cdn");
    const $cdnBase = $("#image_cdn_base");
    $cdnToggle.on("change", function () {
      if (this.checked) {
        if (!$cdnBase.val().trim()) {
          const input = window.prompt(
            i18n.cdnPrompt ||
              "请输入图片 CDN 域名或前缀（例如：https://img.example.com 或 https://img.example.com/wp-content/uploads）",
            "https://"
          );
          if (!input) {
            this.checked = false;
            return;
          }
          const norm = normalizeCdnBase(input);
          if (!norm) {
            AdminUtils.notice("error", i18n.cdnInvalid || "无效的 CDN 地址");
            this.checked = false;
            return;
          }
          $cdnBase.val(norm).trigger("change");
          window.westlifeAdmin = window.westlifeAdmin || {};
          westlifeAdmin.cdn = { enabled: true, base: norm };
          AdminUtils.notice("success", i18n.cdnSaved || "已更新 CDN 地址");
        } else {
          westlifeAdmin.cdn = {
            enabled: true,
            base: normalizeCdnBase($cdnBase.val()) || "",
          };
        }
      } else {
        westlifeAdmin.cdn = {
          enabled: false,
          base: normalizeCdnBase($cdnBase.val()) || "",
        };
      }
    });
    $cdnBase.on("change blur", function () {
      const norm = normalizeCdnBase($(this).val());
      if (norm !== $(this).val()) $(this).val(norm || "");
      westlifeAdmin.cdn = westlifeAdmin.cdn || {};
      westlifeAdmin.cdn.base = norm || "";
    });

    // 全局图片上传工具，供各tab页面调用
    window.westlifeMediaUpload = function (selector = ".upload-image-button") {
      jQuery(document).on("click", selector, function (e) {
        e.preventDefault();

        // 检查 wp.media 是否可用
        if (typeof wp === "undefined" || typeof wp.media === "undefined") {
          if (typeof WestlifeModal !== "undefined") {
            WestlifeModal.alert({
              title: "媒体库加载失败",
              message: "WordPress 媒体库未加载，请刷新页面后重试。",
              type: "warning"
            });
          } else {
            alert("媒体库未加载，请刷新页面重试");
          }
          return;
        }

        var button = jQuery(this);
        var targetInput = button.data("target");

        var frame = wp.media({
          title: "选择图片",
          button: { text: "使用这张图片" },
          multiple: false,
          library: { type: "image" },
        });

        frame.on("select", function () {
          var attachment = frame.state().get("selection").first().toJSON();
          var imageUrl = attachment.url;

          if (targetInput) {
            var $targetInput = jQuery('input[name="' + targetInput + '"]');
            $targetInput.val(imageUrl);
          } else {
            var $prevInput = button.prev("input");
            $prevInput.val(imageUrl);
          }
        });

        frame.open();
      });
    };
  });
})(jQuery);
