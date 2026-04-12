/**
 * LiMhy - 前台运行脚本 v3.0
 * Copyright (c) 2026 Jason. All rights reserved.
 * 
 * Includes: Toast, Navigation, Comment System, Captcha, Pro Lightbox, 
 * Cyber Town, Minesweeper, and Security Probes.
 */
;(function() {
  'use strict';

  var IS_PROCESSING_LIKE = false;

  function showToast(msg, type) {
      type = type || 'info';
      var toast = document.createElement('div');
      toast.className = 'sketch-toast is-' + type;
      var icon = '';
      if (type === 'error') icon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
      if (type === 'success') icon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';
      if (type === 'info') icon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
      toast.innerHTML = icon + '<span>' + msg + '</span>';
      document.body.appendChild(toast);
      void toast.offsetWidth; toast.classList.add('is-visible');
      setTimeout(function() { toast.classList.remove('is-visible'); setTimeout(function() { toast.remove(); }, 300); }, 2500);
  }

  var toggle = document.getElementById('js-nav-toggle'); var nav = document.getElementById('js-nav');
  if (toggle && nav) { toggle.addEventListener('click', function() { nav.classList.toggle('is-open'); toggle.innerHTML = nav.classList.contains('is-open') ? '✕' : '☰'; }); }

  document.addEventListener('click', function(e) {
    var btn = e.target.closest('.js-reply-btn');
    if (btn) {
      e.preventDefault();
      var id = btn.getAttribute('data-id'); var author = btn.getAttribute('data-author');
      var parentInput = document.getElementById('js-parent-id'); var hint = document.getElementById('js-reply-hint'); var replyTo = document.getElementById('js-reply-to'); var form = document.getElementById('comment-form'); var textarea = form ? form.querySelector('textarea') : null;
      if (parentInput) parentInput.value = id; if (hint) hint.style.display = 'flex'; if (replyTo) replyTo.textContent = author;
      if (form) { form.scrollIntoView({ behavior: 'smooth', block: 'center' }); if (textarea) { textarea.focus(); textarea.placeholder = '回复 @' + author + ' ...'; } }
    }
  });

  var cancelBtn = document.getElementById('js-cancel-reply');
  if (cancelBtn) { cancelBtn.addEventListener('click', function() {
      var parentInput = document.getElementById('js-parent-id'); var hint = document.getElementById('js-reply-hint'); var form = document.getElementById('comment-form'); var textarea = form ? form.querySelector('textarea') : null;
      if (parentInput) parentInput.value = '0'; if (hint) hint.style.display = 'none'; if (textarea) textarea.placeholder = '欢迎评论你的想法...';
    });
  }

  var captchaImg = document.getElementById('js-captcha-img');
  var captchaToken = document.getElementById('js-captcha-token');
  var captchaInput = document.querySelector('.captcha-input');
  var commentForm = document.getElementById('comment-form');
  var commentCaptchaLoaded = false;
  var commentCaptchaLoading = false;

  function refreshCaptcha(force) {
    if (!captchaImg || commentCaptchaLoading) return;
    if (!force && commentCaptchaLoaded && captchaImg.getAttribute('src')) return;
    commentCaptchaLoading = true;
    fetch('/api/captcha/new?form=comment', { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
      .then(function(res) { return res.json(); })
      .then(function(data) {
        if (!data || !data.ok) {
          showToast((data && data.error) || '验证码加载失败', 'error');
          return;
        }
        captchaImg.src = data.image;
        if (captchaToken) captchaToken.value = data.token || '';
        if (captchaInput) captchaInput.value = '';
        commentCaptchaLoaded = true;
      })
      .catch(function() {
        showToast('验证码加载失败', 'error');
      })
      .finally(function() {
        commentCaptchaLoading = false;
      });
  }

  function bootstrapCommentCaptcha() {
    if (!captchaImg || commentCaptchaLoaded || commentCaptchaLoading) return;
    refreshCaptcha(true);
  }

  if (captchaImg) {
    captchaImg.addEventListener('click', function() { refreshCaptcha(true); });
    captchaImg.addEventListener('mouseenter', bootstrapCommentCaptcha, { passive: true });
    captchaImg.addEventListener('touchstart', bootstrapCommentCaptcha, { passive: true });
    if (captchaInput) {
      captchaInput.addEventListener('focus', bootstrapCommentCaptcha, { passive: true });
    }
    if (commentForm && 'IntersectionObserver' in window) {
      var commentFormObserver = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          if (entry.isIntersecting) {
            bootstrapCommentCaptcha();
            commentFormObserver.disconnect();
          }
        });
      }, { rootMargin: '160px 0px' });
      commentFormObserver.observe(commentForm);
    } else {
      setTimeout(bootstrapCommentCaptcha, 1200);
    }
  }

  var commentTextarea = document.getElementById('js-comment-textarea');

  function insertTextAtCursor(el, text) {
    if (!el) return;
    var start = typeof el.selectionStart === 'number' ? el.selectionStart : el.value.length;
    var end = typeof el.selectionEnd === 'number' ? el.selectionEnd : el.value.length;
    var val = el.value || '';
    el.value = val.slice(0, start) + text + val.slice(end);
    var next = start + text.length;
    if (el.setSelectionRange) {
      el.focus();
      el.setSelectionRange(next, next);
    }
  }

  if (commentForm) {
    commentForm.addEventListener('submit', function(e) {
      e.preventDefault(); var form = this; var btn = form.querySelector('button[type="submit"]'); var origText = btn.textContent;
      btn.disabled = true; btn.textContent = '发送中';
      fetch(form.action, { method: 'POST', body: new FormData(form), headers: { 'X-Requested-With': 'XMLHttpRequest' } })
      .then(function(res) { return res.json(); })
      .then(function(data) {
        if (data.ok) {
            btn.textContent = '成功'; btn.style.background = '#000'; btn.style.color = '#fff';
            if (commentTextarea) commentTextarea.value = '';
            if (cancelBtn) cancelBtn.click();
            commentCaptchaLoaded = false; refreshCaptcha(true); showToast(data.msg || '评论已发送', 'success'); setTimeout(function() { location.reload(); }, 1000);
        } else { showToast(data.error || '提交失败', 'error'); btn.disabled = false; btn.textContent = origText; if (data.error && data.error.indexOf('验证码') !== -1) { commentCaptchaLoaded = false; refreshCaptcha(true); } }
      }).catch(function() { showToast('网络错误', 'error'); btn.disabled = false; btn.textContent = origText; });
    });
  }


  var slider = document.getElementById('js-banner-slider'); var dotsContainer = document.getElementById('js-banner-dots');
  if (slider && dotsContainer) {
    var items = slider.children; var dots = dotsContainer.children; var count = items.length; var current = 0; var timer = null;
    function gotoSlide(index) { if (index < 0) index = count - 1; if (index >= count) index = 0; current = index; slider.style.transform = 'translateX(-' + (current * 100) + '%)'; for (var i = 0; i < dots.length; i++) { dots[i].classList.remove('active'); } if (dots[current]) dots[current].classList.add('active'); }
    function nextSlide() { gotoSlide(current + 1); } function startAuto() { if (timer) clearInterval(timer); timer = setInterval(nextSlide, 5000); }
    Array.prototype.forEach.call(dots, function(dot) { dot.addEventListener('click', function() { gotoSlide(parseInt(this.getAttribute('data-index'))); startAuto(); }); });
    var touchStartX = 0; slider.addEventListener('touchstart', function(e) { touchStartX = e.changedTouches[0].screenX; }, {passive: true});
    slider.addEventListener('touchend', function(e) { var touchEndX = e.changedTouches[0].screenX; if (touchStartX - touchEndX > 50) nextSlide(); if (touchEndX - touchStartX > 50) gotoSlide(current - 1); startAuto(); }, {passive: true});
    startAuto();
  }




var emojiTrigger = document.getElementById('js-comment-emoji-trigger');
var emojiPanel = document.getElementById('js-comment-emoji-panel');
var emojiClose = document.getElementById('js-comment-emoji-close');
if (emojiTrigger && emojiPanel && commentTextarea) {
  function closeEmojiPanel() { emojiPanel.hidden = true; emojiTrigger.classList.remove('is-open'); }
  function openEmojiPanel() { emojiPanel.hidden = false; emojiTrigger.classList.add('is-open'); }
  emojiTrigger.addEventListener('click', function(e) {
    e.preventDefault();
    if (emojiPanel.hidden) openEmojiPanel(); else closeEmojiPanel();
  });
  if (emojiClose) emojiClose.addEventListener('click', function(e) { e.preventDefault(); closeEmojiPanel(); });
  emojiPanel.addEventListener('click', function(e) {
    var btn = e.target.closest('.js-comment-emoji-item');
    if (!btn) return;
    e.preventDefault();
    insertTextAtCursor(commentTextarea, (btn.getAttribute('data-token') || '') + ' ');
    closeEmojiPanel();
  });
  document.addEventListener('click', function(e) {
    if (!emojiPanel.hidden && !emojiPanel.contains(e.target) && !emojiTrigger.contains(e.target)) closeEmojiPanel();
  });
}

var onlineBadge = document.querySelector('[data-online-badge]') || document.querySelector('.footer-online-badge');
  if (onlineBadge) {
      var onlineBadgeLoaded = false;
      function loadOnlineBadge() {
        if (onlineBadgeLoaded) return;
        onlineBadgeLoaded = true;
        fetch('/api/online-users?_t=' + new Date().getTime(), { headers: { 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'same-origin' })
          .then(function(res) { return res.json(); })
          .then(function(data) {
            if (data && data.ok && data.data) {
              var count = Array.isArray(data.data) ? data.data.length : 0;
              onlineBadge.innerHTML = '<span class="online-dot"></span>' + count + ' 人在线';
            }
          }).catch(function(){});
      }
      if ('requestIdleCallback' in window) {
        requestIdleCallback(loadOnlineBadge, { timeout: 1800 });
      } else {
        setTimeout(loadOnlineBadge, 1200);
      }
      onlineBadge.addEventListener('mouseenter', loadOnlineBadge, { passive: true });
      onlineBadge.addEventListener('touchstart', loadOnlineBadge, { passive: true });
      onlineBadge.style.cursor = 'pointer';
      onlineBadge.addEventListener('click', function() {
          loadOnlineBadge();
          if (document.getElementById('sketch-online-modal')) return;
          var modal = document.createElement('div');
          modal.id = 'sketch-online-modal';
          modal.className = 'sketch-modal is-open';
          document.body.appendChild(modal);
          fetch('/api/component/online-modal?_t=' + new Date().getTime(), { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
            .then(function(res) { return res.text(); })
            .then(function(html) {
                modal.innerHTML = html;
                var closeBtn = modal.querySelector('.sketch-modal-close');
                var overlay = modal.querySelector('.sketch-modal-overlay');
                function closeModal() { modal.remove(); }
                if (closeBtn) closeBtn.addEventListener('click', closeModal);
                if (overlay) overlay.addEventListener('click', closeModal);
            })
            .catch(function() {
                modal.remove();
            });
      });
  }

  const Lightbox = (function() {
      let wrap = null, imgEl = null, counterEl = null, prevBtn = null, nextBtn = null;
      let images = [], currentIndex = 0;
      let scale = 1, posX = 0, posY = 0;
      let isDragging = false, startX = 0, startY = 0;
      let lastTapTime = 0;

      function initDOM() {
          if (wrap) return;
          wrap = document.createElement('div');
          wrap.className = 'sketch-lightbox';
          wrap.innerHTML = `
              <div class="lb-overlay"></div>
              <div class="lb-topbar">
                  <div class="lb-counter">1 / 1</div>
                  <div class="lb-tools">
                      <button class="lb-btn" id="lb-zoom-out" title="缩小">-</button>
                      <button class="lb-btn" id="lb-zoom-in" title="放大">+</button>
                      <button class="lb-btn" id="lb-zoom-reset" title="原始比例">1:1</button>
                      <button class="lb-btn" id="lb-close" title="关闭">✕</button>
                  </div>
              </div>
              <button class="lb-nav lb-prev">‹</button>
              <button class="lb-nav lb-next">›</button>
              <div class="lb-img-container">
                  <img src="" id="lb-img" alt="Gallery Image" draggable="false">
              </div>
          `;
          document.body.appendChild(wrap);

          imgEl = document.getElementById('lb-img');
          counterEl = wrap.querySelector('.lb-counter');
          prevBtn = wrap.querySelector('.lb-prev');
          nextBtn = wrap.querySelector('.lb-next');

          wrap.querySelector('#lb-close').onclick = close;
          wrap.querySelector('.lb-overlay').onclick = close;
          wrap.querySelector('#lb-zoom-in').onclick = () => setScale(scale + 0.3);
          wrap.querySelector('#lb-zoom-out').onclick = () => setScale(scale - 0.3);
          wrap.querySelector('#lb-zoom-reset').onclick = () => { scale = 1; posX = 0; posY = 0; applyTransform(); };
          prevBtn.onclick = prev;
          nextBtn.onclick = next;

          imgEl.addEventListener('mousedown', e => {
              if (e.button !== 0) return;
              isDragging = true;
              startX = e.clientX - posX;
              startY = e.clientY - posY;
              imgEl.style.transition = 'none';
              imgEl.style.cursor = 'grabbing';
          });
          window.addEventListener('mousemove', e => {
              if (!isDragging) return;
              posX = e.clientX - startX;
              posY = e.clientY - startY;
              applyTransform();
          });
          window.addEventListener('mouseup', () => {
              if (isDragging) { isDragging = false; imgEl.style.transition = 'transform 0.2s ease'; imgEl.style.cursor = 'grab'; }
          });

          wrap.addEventListener('wheel', e => {
              e.preventDefault();
              let delta = e.deltaY < 0 ? 0.15 : -0.15;
              setScale(scale + delta);
          }, { passive: false });

          let touchStartX = 0, touchStartY = 0;
          wrap.addEventListener('touchstart', e => {
              if (e.touches.length === 1) {
                  touchStartX = e.touches[0].clientX;
                  touchStartY = e.touches[0].clientY;
                  
                  let currentTime = new Date().getTime();
                  let tapLength = currentTime - lastTapTime;
                  if (tapLength < 300 && tapLength > 0) {
                      e.preventDefault();
                      if (scale > 1) { scale = 1; posX = 0; posY = 0; } else { scale = 2.5; }
                      applyTransform();
                  }
                  lastTapTime = currentTime;
                  
                  if (scale > 1 && e.target === imgEl) {
                      isDragging = true;
                      startX = touchStartX - posX;
                      startY = touchStartY - posY;
                      imgEl.style.transition = 'none';
                  }
              }
          }, { passive: false });

          wrap.addEventListener('touchmove', e => {
              if (isDragging && scale > 1 && e.touches.length === 1) {
                  e.preventDefault();
                  posX = e.touches[0].clientX - startX;
                  posY = e.touches[0].clientY - startY;
                  applyTransform();
              }
          }, { passive: false });

          wrap.addEventListener('touchend', e => {
              if (isDragging) {
                  isDragging = false;
                  imgEl.style.transition = 'transform 0.2s ease';
                  return;
              }

              if (scale === 1) {
                  let touchEndX = e.changedTouches[0].clientX;
                  let dX = touchEndX - touchStartX;
                  if (Math.abs(dX) > 60) {
                      if (dX > 0) prev(); else next();
                  }
              }
          });
          
          document.addEventListener('keydown', e => {
              if (!wrap.classList.contains('is-active')) return;
              if (e.key === 'Escape') close();
              if (e.key === 'ArrowLeft') prev();
              if (e.key === 'ArrowRight') next();
              if (e.key === 'ArrowUp') setScale(scale + 0.2);
              if (e.key === 'ArrowDown') setScale(scale - 0.2);
          });
      }

      function applyTransform() {
          imgEl.style.transform = `translate(${posX}px, ${posY}px) scale(${scale})`;
      }

      function setScale(newScale) {
          scale = Math.max(0.5, Math.min(newScale, 5)); 
          applyTransform();
      }

      function renderCurrent() {
          if (!images[currentIndex]) return;
          
          scale = 1; posX = 0; posY = 0;
          imgEl.style.transition = 'none';
          applyTransform();
          setTimeout(() => imgEl.style.transition = 'transform 0.2s ease, opacity 0.2s ease', 50);

          imgEl.style.opacity = 0;
          let tempImg = new Image();
          tempImg.onload = () => {
              imgEl.src = tempImg.src;
              imgEl.style.opacity = 1;
          };
          tempImg.src = images[currentIndex].src;

          counterEl.textContent = (currentIndex + 1) + ' / ' + images.length;
          prevBtn.style.display = currentIndex > 0 ? 'flex' : 'none';
          nextBtn.style.display = currentIndex < images.length - 1 ? 'flex' : 'none';
      }

      function prev() { if (currentIndex > 0) { currentIndex--; renderCurrent(); } }
      function next() { if (currentIndex < images.length - 1) { currentIndex++; renderCurrent(); } }

      function close() {
          wrap.classList.remove('is-active');
          setTimeout(() => { imgEl.src = ''; }, 300);
          document.body.style.overflow = '';
      }

      return {
          open: function(imgElements, startEl) {
              initDOM();
              images = Array.from(imgElements);
              currentIndex = images.indexOf(startEl);
              if (currentIndex === -1) currentIndex = 0;
              
              document.body.style.overflow = 'hidden';
              wrap.classList.add('is-active');
              renderCurrent();
          }
      };
  })();

  function initArticleGalleries() {
      var proseBlocks = document.querySelectorAll('.post-detail__content.prose, .page-detail__content.prose, .post-detail__content .prose');
      proseBlocks.forEach(function(prose) {
          if (!prose || prose.dataset.galleryEnhanced === '1') return;
          prose.dataset.galleryEnhanced = '1';
          var nodes = Array.prototype.slice.call(prose.children || []);
          var groupImages = [];
          var groupNodes = [];
          var groupAnchor = null;

          function extractGalleryImages(node) {
              if (!node || !node.tagName) return [];
              var tag = node.tagName.toLowerCase();
              var allowedTags = { p: true, figure: true, div: true };
              if (!allowedTags[tag]) return [];
              if (tag === 'figure' && node.querySelector('figcaption')) return [];

              var clone = node.cloneNode(true);
              Array.prototype.slice.call(clone.querySelectorAll('br')).forEach(function(br) { br.remove(); });
              Array.prototype.slice.call(clone.querySelectorAll('img')).forEach(function(img) {
                  img.setAttribute('data-gallery-probe', '1');
              });

              var normalizedHtml = (clone.innerHTML || '')
                  .replace(/<a\b[^>]*>\s*(<img[^>]*data-gallery-probe="1"[^>]*>)\s*<\/a>/gi, '$1')
                  .replace(/<img[^>]*data-gallery-probe="1"[^>]*>/gi, '')
                  .replace(/&nbsp;/gi, '')
                  .trim();
              var plainText = (clone.textContent || '').replace(/\s+/g, '');
              if (normalizedHtml !== '' || plainText !== '') return [];

              var images = [];
              Array.prototype.slice.call(node.querySelectorAll('img')).forEach(function(img) {
                  if (!img || !img.getAttribute('src')) return;
                  images.push(img);
              });
              return images;
          }

          function flushGroup() {
              if (!groupImages.length || !groupAnchor) {
                  groupImages = [];
                  groupNodes = [];
                  groupAnchor = null;
                  return;
              }

              var total = groupImages.length;
              var offset = 0;
              while (offset < total) {
                  var chunk = groupImages.slice(offset, offset + 9);
                  var gallery = document.createElement('div');
                  gallery.className = 'article-gallery article-gallery--count-' + Math.min(chunk.length, 9);
                  chunk.forEach(function(img) {
                      var item = document.createElement('figure');
                      item.className = 'article-gallery__item';
                      item.appendChild(img.cloneNode(true));
                      gallery.appendChild(item);
                  });
                  prose.insertBefore(gallery, groupAnchor);
                  offset += 9;
              }

              groupNodes.forEach(function(node) { node.remove(); });
              groupImages = [];
              groupNodes = [];
              groupAnchor = null;
          }

          nodes.forEach(function(node) {
              if (!node || !node.tagName) return;
              var images = extractGalleryImages(node);
              if (images.length) {
                  if (!groupAnchor) groupAnchor = node;
                  groupNodes.push(node);
                  groupImages = groupImages.concat(images);
              } else {
                  flushGroup();
              }
          });

          flushGroup();
      });
  }

  initArticleGalleries();

  document.addEventListener('click', function(e) {
      if (e.target.tagName.toLowerCase() === 'img') {
          var inProse = e.target.closest('.prose');
          var inGallery = e.target.closest('.sketch-gallery');
          var inArticleGallery = e.target.closest('.article-gallery');
          var container = inArticleGallery || inGallery || inProse;
          
          if (container) {
              var imgs = container.querySelectorAll('img:not(.emoji):not(.avatar)');
              if (imgs.length > 0) {
                  Lightbox.open(imgs, e.target);
              }
          }
      }
  });

  var townMap = document.getElementById('js-town-map'); var townContainer = document.querySelector('.town-container');
  if (townMap && townContainer) {
      var scrollArea = document.querySelector('.town-scroll-area'); var env = window.townEnv || {}; var npcs = [];
      var isDragging = false, startX, startY, scrollLeft, scrollTop;
      if (scrollArea) {
          scrollArea.addEventListener('mousedown', function(e) { isDragging = true; startX = e.pageX - scrollArea.offsetLeft; startY = e.pageY - scrollArea.offsetTop; scrollLeft = scrollArea.scrollLeft; scrollTop = scrollArea.scrollTop; });
          scrollArea.addEventListener('mouseleave', function() { isDragging = false; }); scrollArea.addEventListener('mouseup', function() { isDragging = false; });
          scrollArea.addEventListener('mousemove', function(e) { if (!isDragging) return; e.preventDefault(); var x = e.pageX - scrollArea.offsetLeft; var y = e.pageY - scrollArea.offsetTop; scrollArea.scrollLeft = scrollLeft - (x - startX); scrollArea.scrollTop = scrollTop - (y - startY); });
      }
      if (env.hour < 6 || env.hour >= 18) {
          townContainer.setAttribute('data-night', '1');
          var lights = [[28,38], [72,38], [28,75], [72,75]]; lights.forEach(function(l) { var div = document.createElement('div'); div.className = 'town-light'; div.style.left = l[0] + '%'; div.style.top = l[1] + '%'; townMap.appendChild(div); });
      }

      var billboard = document.createElement('div'); billboard.className = 'town-billboard'; billboard.style.left = '65%'; billboard.style.top = '45%'; billboard.innerHTML = '📜'; billboard.title = '小镇公告';
      billboard.onclick = function(e) {
          e.stopPropagation(); var modal = document.createElement('div'); modal.className = 'town-modal is-active';
          modal.innerHTML = '<div class="town-scroll-paper" style="padding:40px;">加载中...</div>'; document.body.appendChild(modal);
          fetch('/api/component/town-billboard', {headers:{'X-Requested-With':'XMLHttpRequest'}}).then(function(r){return r.text();}).then(function(html){
              modal.innerHTML = html; modal.querySelector('.js-close-modal').onclick = function() { modal.classList.remove('is-active'); setTimeout(function(){ modal.remove(); }, 300); };
          });
      };
      townMap.appendChild(billboard);

      var mayor = document.createElement('div'); mayor.className = 'town-npc is-mayor'; mayor.style.left = '50%'; mayor.style.top = '58%'; mayor.style.zIndex = 58;
      var mayorBubble = document.createElement('div'); mayorBubble.className = 'town-bubble'; mayorBubble.textContent = '小镇管家';
      var mayorImg = document.createElement('img'); mayorImg.src = '/assets/town/npc-8.png';
      mayor.appendChild(mayorBubble); mayor.appendChild(mayorImg); townMap.appendChild(mayor);
      var mayorTalks = ["欢迎来到 " + (env.site_name || '博客小镇')]; if (env.latest_post) mayorTalks.push("新文章《" + env.latest_post + "》看过了吗？"); if (env.latest_comment_author) mayorTalks.push("感谢 " + env.latest_comment_author + " 的精彩评论！");
      setInterval(function() { mayorBubble.textContent = mayorTalks[Math.floor(Math.random() * mayorTalks.length)]; }, 6000);

      var msNpc = document.createElement('div'); msNpc.className = 'town-npc is-game-npc'; msNpc.style.left = '20%'; msNpc.style.top = '65%'; msNpc.style.zIndex = 65;
      var msBubble = document.createElement('div'); msBubble.className = 'town-bubble'; msBubble.innerHTML = '💣 扫雷馆'; msBubble.style.color = '#fff'; msBubble.style.background = '#d97706'; msBubble.style.borderColor = '#92400e';
      var msImg = document.createElement('img'); msImg.src = '/assets/town/npc-3.png';
      msNpc.appendChild(msBubble); msNpc.appendChild(msImg); townMap.appendChild(msNpc);

            function initMinesweeper() {
          var msModal = document.createElement('div'); msModal.className = 'town-modal is-active';
          msModal.innerHTML = '<div class="town-scroll-paper ms-container" style="max-width: 360px; padding: 20px;"><div id="ms-wrap">游戏加载中...</div><div style="margin-top: 15px; font-size: 12px; color: #666; text-align: center;">[左键] 排雷 &nbsp; | &nbsp; [右键/长按] 插旗</div><button class="sketch-btn js-close-modal" style="margin-top: 15px; width: 100%;">退出游戏</button></div>';
          document.body.appendChild(msModal);
          var timerInt = null;
          
          function update(act, r, c) {
              var url = '/api/component/minesweeper?act=' + (act||'init');
              if(r!==undefined) url += '&row='+r+'&col='+c;
              url += '&_t=' + new Date().getTime();
              
              fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
              .then(function(res){return res.text();})
              .then(function(html){
                  var wrap = document.getElementById('ms-wrap'); if(!wrap) return;
                  wrap.innerHTML = html;
                  var face = document.getElementById('js-ms-face'); if(face) face.onclick = function(){ update('init'); };
                  var cells = document.querySelectorAll('.ms-cell');
                  cells.forEach(function(cell){
                      cell.onmousedown = function(e) { if(e.button===2) return; update('reveal', cell.dataset.r, cell.dataset.c); };
                      cell.oncontextmenu = function(e) { e.preventDefault(); update('flag', cell.dataset.r, cell.dataset.c); };
                  });
                  clearInterval(timerInt);
                  var timerEl = document.getElementById('js-ms-timer');
                  if(timerEl) {
                      var start = parseInt(timerEl.dataset.start); var end = parseInt(timerEl.dataset.end);
                      if(start > 0 && end === 0) {
                          timerInt = setInterval(function(){
                              var diff = Math.floor(new Date().getTime()/1000) - start; if(diff > 999) diff = 999;
                              timerEl.textContent = diff < 10 ? '00'+diff : (diff < 100 ? '0'+diff : diff);
                          }, 1000);
                      }
                  }
              });
          }
          
          update('init');
          msModal.querySelector('.js-close-modal').addEventListener('click', function() { clearInterval(timerInt); msModal.classList.remove('is-active'); setTimeout(function(){ msModal.remove(); }, 300); });
      }
      msNpc.addEventListener('click', function(e) { e.stopPropagation(); initMinesweeper(); });

      var emoteMenu = document.createElement('div'); emoteMenu.className = 'emote-menu';
      var emotes = ['💻 敲码', '🎣 摸鱼', '☕ 喝茶'];
      emotes.forEach(function(txt) {
          var b = document.createElement('button'); b.className = 'emote-btn'; b.textContent = txt;
          b.onclick = function(e) {
              e.stopPropagation(); var val = txt.indexOf('❌') !== -1 ? '' : txt;
              fetch('/api/online-users?set_emote=' + encodeURIComponent(val) + '&_t=' + new Date().getTime(), { headers: { 'X-Requested-With': 'XMLHttpRequest' } }).then(function(){ syncTown(); });
              emoteMenu.classList.remove('is-active');
          };
          emoteMenu.appendChild(b);
      });
      document.body.appendChild(emoteMenu); document.addEventListener('click', function() { emoteMenu.classList.remove('is-active'); });

      var safeZone = { minX: 25, maxX: 75, minY: 35, maxY: 80 }; var visitorTalks = ["嘘，我在认真看文章", "这博客真快！", "别点我，怕痒", "你也来摸鱼啊？", "扫雷真好玩！"];
      function hashStr(str) { var hash = 0; for (var i = 0; i < str.length; i++) { hash = ((hash << 5) - hash) + str.charCodeAt(i); hash = hash & hash; } return hash; }

      function syncTown() {
          fetch('/api/online-users?_t=' + new Date().getTime(), { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
          .then(function(res) { return res.json(); }).then(function(data) {
              if (!data.ok || !data.data) return;
              var oldNpcs = npcs.slice(); npcs = [];
              data.data.forEach(function(u, index) {
                  var isSelf = (index === 0); var vid = String(u.ip); var originalText = (isSelf ? '我 (' + u.loc + ')' : u.loc) + (u.emote ? ' [' + u.emote + ']' : '');
                  var existIdx = oldNpcs.findIndex(function(n) { return n.dataset.vid === vid; });
                  if (existIdx > -1) {
                      var npc = oldNpcs[existIdx]; npc.dataset.origText = originalText; if (npc.dataset.talking !== '1') { npc.querySelector('.town-bubble').textContent = originalText; }
                      npcs.push(npc); oldNpcs.splice(existIdx, 1);
                  } else {
                      var npc = document.createElement('div'); npc.className = 'town-npc'; if (isSelf) npc.classList.add('is-self');
                      npc.dataset.vid = vid; npc.dataset.origText = originalText;
                      var skinId = (Math.abs(hashStr(u.ip)) % 7) + 1; var img = document.createElement('img'); img.src = '/assets/town/npc-' + skinId + '.png'; 
                      var bubble = document.createElement('div'); bubble.className = 'town-bubble'; bubble.textContent = originalText;
                      npc.appendChild(bubble); npc.appendChild(img);
                      var pseudoRand = Math.abs(hashStr(u.ip + 'pos')) % 100 / 100; var startPosX = safeZone.minX + pseudoRand * (safeZone.maxX - safeZone.minX); var startPosY = safeZone.minY + ((pseudoRand * 13) % 1) * (safeZone.maxY - safeZone.minY);
                      npc.style.left = startPosX + '%'; npc.style.top = startPosY + '%'; npc.style.zIndex = Math.floor(startPosY); npc.dataset.x = startPosX; npc.dataset.y = startPosY;
                      npc.addEventListener('click', function(e) {
                          e.stopPropagation(); 
                          if (isSelf) {
                              if (emoteMenu.classList.contains('is-active')) { emoteMenu.classList.remove('is-active'); return; }
                              emoteMenu.classList.add('is-active'); var rect = npc.getBoundingClientRect(); var menuRect = emoteMenu.getBoundingClientRect();
                              var left = rect.left + window.scrollX + (rect.width / 2) - (menuRect.width / 2); var top = rect.top + window.scrollY - menuRect.height - 15;
                              var maxLeft = document.documentElement.clientWidth - menuRect.width - 10; if (left > maxLeft) left = maxLeft; if (left < 10) left = 10;
                              if (top < window.scrollY + 10) { top = rect.bottom + window.scrollY + 10; } emoteMenu.style.left = left + 'px'; emoteMenu.style.top = top + 'px';
                          } else {
                              if (npc.dataset.talking === '1') return; npc.dataset.talking = '1';
                              bubble.textContent = visitorTalks[Math.floor(Math.random() * visitorTalks.length)]; bubble.style.color = '#e74c3c'; bubble.style.transform = 'translateX(-50%) scale(1.15)'; 
                              setTimeout(function() { bubble.textContent = npc.dataset.origText; bubble.style.color = '#000'; bubble.style.transform = 'translateX(-50%) scale(1)'; npc.dataset.talking = '0'; }, 2500);
                          }
                      });
                      townMap.appendChild(npc); npcs.push(npc);
                  }
              });
              oldNpcs.forEach(function(n) { n.remove(); });
          });
      }
      syncTown(); setInterval(syncTown, 30000); 

      setInterval(function() {
          npcs.forEach(function(npc) {
              if (Math.random() > 0.4) { npc.classList.remove('is-moving'); return; }
              var currentX = parseFloat(npc.dataset.x); var currentY = parseFloat(npc.dataset.y); var nextX = currentX + (Math.random() * 10 - 5); var nextY = currentY + (Math.random() * 10 - 5);
              nextX = Math.max(safeZone.minX, Math.min(nextX, safeZone.maxX)); nextY = Math.max(safeZone.minY, Math.min(nextY, safeZone.maxY));
              if (nextX < currentX) npc.classList.add('flip-x'); else npc.classList.remove('flip-x');
              npc.classList.add('is-moving'); npc.style.left = nextX + '%'; npc.style.top = nextY + '%'; npc.style.zIndex = Math.floor(nextY); npc.dataset.x = nextX; npc.dataset.y = nextY;
          });
      }, 3000);
  }

  var actionTrail = [];
  document.addEventListener('click', function(e) {
      if (actionTrail.length >= 10) actionTrail.shift();
      var el = e.target; var tag = el.tagName ? el.tagName.toLowerCase() : ''; var id = el.id ? '#' + el.id : ''; var cls = el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').join('.') : '';
      actionTrail.push(tag + id + cls);
  });
  
  var traceSent = false;
  var f12ProbeEnabled = window.LIMHY_F12_PROBE_ENABLED !== false;

  function triggerTrace(reason) {
      if (traceSent) return;
      traceSent = true;
      var guid = '';
      try {
          guid = localStorage.getItem('lm_guid') || (document.cookie.match('(^|;) ?lm_guid=([^;]*)(;|$)')||[])[2] || '';
      } catch(e) {}
      var traceData = {
          url: location.href,
          path: location.pathname || '',
          trail: actionTrail,
          screen: screen.width + 'x' + screen.height,
          reason: reason,
          guid: guid,
          title: document.title || ''
      };
      var body = JSON.stringify(traceData);
      try {
          if (navigator.sendBeacon) {
              navigator.sendBeacon('/api/trace', new Blob([body], { type: 'application/json' }));
              return;
          }
      } catch(e) {}
      fetch('/api/trace', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, body: body, keepalive: true }).catch(function(){});
  }

  function handleSuspiciousAction(reason) {
      if (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || window.innerWidth < 768) {
          return;
      }
      triggerTrace(reason);
  }

  var f12Btn = document.querySelector('.footer-no-f12');
  if (f12Btn) {
      f12Btn.addEventListener('click', function(e) {
          e.preventDefault();
          triggerTrace('页脚探针入口点击');
          alert('开发者调试模式已开放，行为已处于沙盒记录中。');
      });
  }
  
  setInterval(function() { if (window.outerWidth - window.innerWidth > 160 || window.outerHeight - window.innerHeight > 160) { handleSuspiciousAction('PC 视口差分异常'); } }, 2000);
  document.addEventListener('keydown', function(e) { if (e.keyCode === 123 || (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74 || e.keyCode === 67))) { handleSuspiciousAction('键盘热键(F12)触发'); } });
  
  function getCookie(name) { var match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)')); return match ? decodeURIComponent(match[2].replace(/\+/g, '%20')) : ''; }
  var inputAuthor = document.querySelector('input[name="author"]'); var inputEmail = document.querySelector('input[name="email"]'); var inputUrl = document.querySelector('input[name="url"]');
  if (inputAuthor) { var ca = getCookie('comment_author'); if (ca) inputAuthor.value = ca; } if (inputEmail) { var ce = getCookie('comment_email'); if (ce) inputEmail.value = ce; } if (inputUrl) { var cu = getCookie('comment_url'); if (cu) inputUrl.value = cu; }

  document.querySelectorAll('.js-post-portal').forEach(function(card) {
    var startX = 0, startY = 0, isLocked = false;
    card.addEventListener('touchstart', function(e) { startX = e.touches[0].clientX; startY = e.touches[0].clientY; }, {passive: true});
    card.addEventListener('touchend', function(e) {
        if (isLocked) return; var diffX = startX - e.changedTouches[0].clientX; var diffY = startY - e.changedTouches[0].clientY;
        if (Math.abs(diffX) > 80 && Math.abs(diffY) < 50) { fetchSibling(card, diffX > 0 ? 'next' : 'prev'); }
    }, {passive: true});
    function fetchSibling(el, dir) {
        if (isLocked) return; isLocked = true; el.classList.add('is-skeleton');
        var id = el.dataset.id; var cat = el.dataset.cat;
        fetch('/api/sibling-post?id=' + id + '&cat_id=' + cat + '&dir=' + dir, { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
        .then(function(res) { return res.json(); }).then(function(res) {
            if (res.ok) {
                var preloadImg = new Image(); preloadImg.src = res.cover;
                preloadImg.onload = preloadImg.onerror = function() {
                    el.dataset.id = res.id;
                    el.innerHTML = res.html;
                    el.classList.remove('anim-left', 'anim-right'); void el.offsetWidth; 
                    el.classList.add(dir === 'next' ? 'anim-right' : 'anim-left');
                    el.classList.remove('is-skeleton'); isLocked = false;
                };
            } else { el.classList.remove('is-skeleton'); isLocked = false; }
        }).catch(function() { el.classList.remove('is-skeleton'); isLocked = false; });
    }
  });

  var tickerWrap = document.getElementById('js-ticker-wrap'); var tickerList = document.getElementById('js-ticker-list');
  if (tickerWrap && tickerList) {
      var tickerItems = tickerList.querySelectorAll('.ticker-item');
      if (tickerItems.length > 0) {
          var tIndex = 0;
          function playTicker() {
              var currentItem = tickerItems[tIndex]; var textSpan = currentItem.querySelector('span');
              tickerList.style.transition = 'transform 0.4s cubic-bezier(0.25, 1, 0.5, 1)'; tickerList.style.transform = 'translateY(-' + (tIndex * 24) + 'px)';
              setTimeout(function() {
                  var wrapWidth = tickerWrap.clientWidth; var textWidth = textSpan.scrollWidth;
                  if (textWidth > wrapWidth) {
                      var dist = textWidth - wrapWidth + 20; var duration = dist * 18; 
                      setTimeout(function() {
                          textSpan.style.transition = 'transform ' + duration + 'ms linear'; textSpan.style.transform = 'translateX(-' + dist + 'px)';
                          setTimeout(function() { textSpan.style.transition = 'none'; textSpan.style.transform = 'translateX(0)'; nextTicker(); }, duration + 800);
                      }, 1000); 
                  } else { setTimeout(nextTicker, 3500); }
              }, 400);
          }
          function nextTicker() { tIndex++; if (tIndex >= tickerItems.length) { tickerList.style.transition = 'none'; tickerList.style.transform = 'translateY(0)'; tIndex = 0; setTimeout(playTicker, 50); } else { playTicker(); } }
          setTimeout(playTicker, 1000);
      }
  }

  var btnOpenFb = document.getElementById('js-open-feedback'); var modalFb = document.getElementById('feedback-modal');
  if (btnOpenFb && modalFb) {
      var fbCaptchaImg = document.getElementById('js-fb-captcha');
      var fbCaptchaToken = document.getElementById('js-fb-captcha-token');
      var fbForm = document.getElementById('feedback-form');
      function refreshFeedbackCaptcha() {
          if (!fbCaptchaImg) return;
          fetch('/api/captcha/new?form=feedback', { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
          .then(function(res) { return res.json(); })
          .then(function(data) {
              if (!data.ok) {
                  showToast(data.error || '验证码加载失败', 'error');
                  return;
              }
              fbCaptchaImg.src = data.image;
              if (fbCaptchaToken) fbCaptchaToken.value = data.token || '';
              if (fbForm) {
                  var input = fbForm.querySelector('input[name="captcha"]');
                  if (input) input.value = '';
              }
          })
          .catch(function() {
              showToast('验证码加载失败', 'error');
          });
      }
      btnOpenFb.addEventListener('click', function() { modalFb.classList.add('is-open'); refreshFeedbackCaptcha(); });
      document.querySelectorAll('.js-close-feedback').forEach(function(el) { el.addEventListener('click', function() { modalFb.classList.remove('is-open'); }); });
      if (fbCaptchaImg) { fbCaptchaImg.addEventListener('click', refreshFeedbackCaptcha); }
      if (fbForm) {
          fbForm.addEventListener('submit', function(e) {
              e.preventDefault(); var btn = this.querySelector('button[type="submit"]'); var origText = btn.textContent;
              btn.textContent = '提交中'; btn.disabled = true;
              fetch(this.action, { method: 'POST', body: new FormData(this), headers: { 'X-Requested-With': 'XMLHttpRequest' } })
              .then(function(res) { return res.json(); })
              .then(function(res) {
                  if (res.ok) { btn.textContent = '已提交'; btn.style.background = '#10b981'; showToast('反馈提交成功', 'success'); setTimeout(function() { modalFb.classList.remove('is-open'); btn.textContent = origText; btn.disabled = false; btn.style.background = ''; fbForm.reset(); if (fbCaptchaToken) fbCaptchaToken.value = ''; }, 1500);
                  } else { showToast(res.error || '提交失败', 'error'); btn.textContent = origText; btn.disabled = false; refreshFeedbackCaptcha(); }
              })
              .catch(function() {
                  showToast('网络错误', 'error'); btn.textContent = origText; btn.disabled = false;
              });
          });
      }
  }

  document.querySelectorAll('.js-log-like').forEach(function(btn) {
      btn.addEventListener('click', function() {
          if (this.classList.contains('is-liked')) return; var logId = this.getAttribute('data-id'); var countEl = this.querySelector('.like-count'); var self = this;
          this.classList.add('is-liked', 'is-animating'); countEl.textContent = parseInt(countEl.textContent) + 1;
          fetch('/api/log-like', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' }, body: 'log_id=' + logId })
          .then(function(res) { return res.json(); })
          .then(function(res) { if (!res.ok) { self.classList.remove('is-liked', 'is-animating'); countEl.textContent = parseInt(countEl.textContent) - 1; showToast(res.error || '操作失败', 'error'); } });
      });
  });
  
  document.addEventListener('click', function(e) {
      var avatarImg = e.target.closest('.js-avatar-interactive');
      if (avatarImg) {
          var email = avatarImg.dataset.email; var author = avatarImg.dataset.author; var ip = avatarImg.dataset.ip || '未知'; var url = avatarImg.dataset.url || ''; var avatarSrc = avatarImg.src; ip = ip.split(' ')[0];
          showProfileCard(email, author, ip, url, avatarSrc);
      }
  });

  function showProfileCard(email, name, ip, url, avatarSrc) {
      var modal = document.createElement('div'); modal.className = 'profile-card-modal'; document.body.appendChild(modal);
      var params = new URLSearchParams({ email: email || '', name: name || '', ip: ip || '', url: url || '', avatarSrc: avatarSrc || '' });
      fetch('/api/component/profile-card?' + params.toString(), { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
          .then(function(res) { return res.text(); })
          .then(function(html) {
              modal.innerHTML = html; setTimeout(function() { modal.classList.add('is-open'); }, 10);
              var overlay = modal.querySelector('.profile-card-overlay'); if(overlay) overlay.addEventListener('click', function() { modal.classList.remove('is-open'); setTimeout(function() { modal.remove(); }, 300); });
              var likeBox = modal.querySelector('#js-profile-like-box');
              if (likeBox && email) {
                  likeBox.addEventListener('click', function() {
                      if (IS_PROCESSING_LIKE) return; var countEl = document.getElementById('js-p-likes'); var iconEl = this.querySelector('.profile-like-icon');
                      if (countEl.textContent === '9999+') return; var currentLikes = parseInt(countEl.textContent) || 0; IS_PROCESSING_LIKE = true; countEl.textContent = currentLikes + 1;
                      if(iconEl) { iconEl.classList.remove('is-animating'); void iconEl.offsetWidth; iconEl.classList.add('is-animating'); }
                      fetch('/api/user-like', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' }, body: 'email=' + encodeURIComponent(email) })
                      .then(function(res) { if (!res.ok) throw new Error('Security Shield Intercepted'); return res.json(); })
                      .then(function(res) { if (!res.ok) { countEl.textContent = currentLikes; showToast(res.error || '操作失败', 'error'); } else { showToast('点赞成功', 'success'); } })
                      .catch(function(err) { countEl.textContent = currentLikes; showToast('请求过快，已被安全盾拦截', 'error'); })
                      .finally(function() { setTimeout(function() { IS_PROCESSING_LIKE = false; }, 1000); });
                  });
              }
          })
          .catch(function() {
              modal.innerHTML = '<div class="profile-card-overlay"></div><div class="profile-card-content"><div style="text-align:center;padding:40px;color:#999">网络波动，查阅失败</div></div>';
              setTimeout(function() { modal.classList.add('is-open'); }, 10);
              var overlay = modal.querySelector('.profile-card-overlay'); if(overlay) overlay.addEventListener('click', function() { modal.classList.remove('is-open'); setTimeout(function() { modal.remove(); }, 300); });
          });
  }

})();

;(function(window) {
    'use strict';
    
    // 只在相册页运行
    const dataNode = document.getElementById('js-album-data');
    if (!dataNode) return;

    let albumData = [];
    try { albumData = JSON.parse(dataNode.textContent); } catch(e) {}

    let currentPvIndex = 0;
    let isThumbsInit = false;

    // 获取 DOM 节点 (这部分 DOM 由 album.php 静态写死输出)
    const pvOverlay = document.getElementById('pv-overlay');
    const pvImg = document.getElementById('pv-img');
    const pvTitle = document.getElementById('pv-title');
    const pvTime = document.getElementById('pv-time');
    const pvLink = document.getElementById('pv-link');
    const pvThumbs = document.getElementById('pv-thumbs');

    if(!pvOverlay) return;

    function initThumbs() {
        if (isThumbsInit || albumData.length === 0) return;
        let html = '';
        albumData.forEach((pic, idx) => {
            html += `<img src="${pic.src}" class="pv-thumb js-pv-trigger" data-idx="${idx}" id="pv-t-${idx}" loading="lazy">`;
        });
        pvThumbs.innerHTML = html;
        isThumbsInit = true;
    }

    function openPv(index) {
        try {
            if (!albumData[index]) return;
            currentPvIndex = index;
            initThumbs();
            
            const pic = albumData[index];
            
            pvImg.classList.remove('loaded');
            pvImg.onload = () => pvImg.classList.add('loaded');
            pvImg.src = pic.src;
            if (pvImg.complete) pvImg.classList.add('loaded');

            pvTitle.textContent = String(pic.title).replace(/</g, "&lt;").replace(/>/g, "&gt;");
            pvTime.textContent = String(pic.time);
            pvLink.href = String(pic.url);
            
            document.querySelectorAll('.pv-thumb').forEach(el => el.classList.remove('active'));
            const activeThumb = document.getElementById(`pv-t-${index}`);
            if (activeThumb) {
                activeThumb.classList.add('active');
                const scrollLeft = activeThumb.offsetLeft - (pvThumbs.clientWidth / 2) + (activeThumb.clientWidth / 2);
                pvThumbs.scrollTo({ left: scrollLeft, behavior: 'smooth' });
            }
            
            document.body.style.overflow = 'hidden'; 
            pvOverlay.classList.add('is-active');
        } catch(err) {
            console.error("相册唤起失败", err);
        }
    }

    function closePv() {
        pvOverlay.classList.remove('is-active');
        document.body.style.overflow = '';
        setTimeout(() => pvImg.src = '', 300);
    }

    function navPv(delta) {
        let nextIdx = currentPvIndex + delta;
        if (nextIdx < 0) nextIdx = albumData.length - 1;
        if (nextIdx >= albumData.length) nextIdx = 0;
        openPv(nextIdx);
    }

    // 全局事件代理网
    document.addEventListener('click', function(e) {
        const pvTrigger = e.target.closest('.js-pv-trigger');
        if (pvTrigger) {
            e.preventDefault();
            const idx = parseInt(pvTrigger.getAttribute('data-idx'), 10);
            if (!isNaN(idx)) openPv(idx);
            return;
        }
        
        const calTrigger = e.target.closest('.js-cal-trigger');
        if (calTrigger) {
            e.preventDefault();
            const galTab = document.querySelector('.album-tab[data-view="gal"]');
            if(galTab) galTab.click();
            const y = calTrigger.getAttribute('data-y');
            const m = calTrigger.getAttribute('data-m');
            setTimeout(() => {
                const target = document.getElementById(`gal-month-${y}-${m}`);
                if (target) {
                    const yOffset = -80; 
                    const topPos = target.getBoundingClientRect().top + window.pageYOffset + yOffset;
                    window.scrollTo({top: topPos, behavior: 'smooth'});
                }
            }, 100);
            return;
        }

        const expandTrigger = e.target.closest('.js-expand-trigger');
        if (expandTrigger) {
            e.preventDefault();
            expandTrigger.style.display = 'none';
            const y = expandTrigger.getAttribute('data-y');
            const m = expandTrigger.getAttribute('data-m');
            document.querySelectorAll(`.group-${y}-${m}`).forEach(el => {
                el.classList.remove('hidden-gal-item');
                el.style.animation = 'fadeIn 0.3s ease-out';
            });
            return;
        }

        const tabTrigger = e.target.closest('.js-tab-trigger');
        if (tabTrigger) {
            e.preventDefault();
            document.querySelectorAll('.album-tab').forEach(t => t.classList.remove('active'));
            tabTrigger.classList.add('active');
            const viewId = tabTrigger.getAttribute('data-view');
            document.querySelectorAll('.album-view-section').forEach(v => v.classList.remove('active'));
            document.getElementById('view-' + viewId).classList.add('active');
            return;
        }

        if (e.target.closest('.js-pv-close')) {
            e.preventDefault(); closePv(); return;
        }

        const navTrigger = e.target.closest('.js-pv-nav');
        if (navTrigger) {
            e.preventDefault();
            const delta = parseInt(navTrigger.getAttribute('data-delta'), 10);
            navPv(delta); return;
        }
    });

    document.addEventListener('keydown', (e) => {
        if (!pvOverlay.classList.contains('is-active')) return;
        if (e.key === 'Escape') closePv();
        if (e.key === 'ArrowLeft') navPv(-1);
        if (e.key === 'ArrowRight') navPv(1);
    });

    let touchStartX = 0;
    pvOverlay.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].screenX; }, {passive: true});
    pvOverlay.addEventListener('touchend', e => {
        if (!pvOverlay.classList.contains('is-active')) return;
        const touchEndX = e.changedTouches[0].screenX;
        if (touchStartX - touchEndX > 40) navPv(1);
        if (touchEndX - touchStartX > 40) navPv(-1);
    }, {passive: true});


  var homeFeed = document.querySelector('[data-home-feed]');
  var homeFeedLoader = document.getElementById('js-home-feed-loader');
  var homeFeedButton = document.getElementById('js-home-feed-button');
  var homeFeedSentinel = document.getElementById('js-home-feed-sentinel');

  if (homeFeed && homeFeedLoader && homeFeedButton && homeFeedSentinel) {
    var feedState = {
      endpoint: homeFeed.getAttribute('data-endpoint') || '/api/home-posts',
      nextOffset: parseInt(homeFeed.getAttribute('data-next-offset') || '0', 10),
      batchSize: parseInt(homeFeed.getAttribute('data-batch-size') || '8', 10),
      hasMore: homeFeed.getAttribute('data-has-more') === '1',
      loading: false
    };

    function syncHomeFeedUi() {
      if (!feedState.hasMore) {
        homeFeedLoader.classList.add('is-hidden');
        homeFeedSentinel.classList.add('is-hidden');
        return;
      }
      homeFeedLoader.classList.remove('is-hidden');
      homeFeedSentinel.classList.remove('is-hidden');
      homeFeedButton.disabled = feedState.loading;
      homeFeedButton.textContent = feedState.loading ? '加载中...' : '加载更多文章';
    }

    function fetchMoreHomePosts() {
      if (!feedState.hasMore || feedState.loading) {
        return;
      }
      feedState.loading = true;
      syncHomeFeedUi();

      var url = feedState.endpoint + '?offset=' + encodeURIComponent(feedState.nextOffset) + '&limit=' + encodeURIComponent(feedState.batchSize) + '&_t=' + Date.now();
      fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
        .then(function(res) { return res.json(); })
        .then(function(data) {
          if (!data || !data.ok) {
            throw new Error((data && data.error) || '加载失败');
          }
          if (data.html) {
            homeFeed.insertAdjacentHTML('beforeend', data.html);
          }
          feedState.nextOffset = parseInt(data.next_offset || feedState.nextOffset, 10);
          feedState.hasMore = !!data.has_more;
          feedState.loading = false;
          syncHomeFeedUi();
        })
        .catch(function() {
          feedState.loading = false;
          syncHomeFeedUi();
          showToast('加载更多文章失败', 'error');
        });
    }

    homeFeedButton.addEventListener('click', function() {
      fetchMoreHomePosts();
    });

    if ('IntersectionObserver' in window) {
      var homeFeedObserver = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          if (entry.isIntersecting) {
            fetchMoreHomePosts();
          }
        });
      }, {
        rootMargin: '0px 0px 280px 0px'
      });
      homeFeedObserver.observe(homeFeedSentinel);
    }

    syncHomeFeedUi();
  }

})(window);


// === 智能搜索栏伸缩逻辑 ===
document.addEventListener('DOMContentLoaded', function(){
  var toggle = document.getElementById('js-search-toggle');
  var form = document.getElementById('js-site-search');
  var input = document.getElementById('site-search-input');
  
  if (toggle && form && input) {
    // 点击触发：展示搜索框，隐藏触发按钮
    toggle.addEventListener('click', function(e) {
      e.preventDefault();
      form.classList.add('is-open');
      toggle.style.display = 'none';
      setTimeout(function(){ input.focus(); }, 100);
    });
    
    // 全局点击拦截：失焦收起
    document.addEventListener('click', function(e) {
      if (!form.classList.contains('is-open')) return;
      // 如果点击在表单内，或点击在触发按钮上，不收起
      if (form.contains(e.target) || toggle.contains(e.target)) return;
      // 如果输入框内有内容，不收起
      if (input.value.trim() !== '') return;
      
      // 收起表单，恢复触发按钮
      form.classList.remove('is-open');
      toggle.style.display = '';
    });
  }
  

  document.querySelectorAll('[data-code-toggle="1"]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var block = btn.closest('.limhy-code-block');
      if(!block) return;
      var expanded = block.classList.toggle('is-expanded');
      block.classList.toggle('is-collapsed', !expanded);
      btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      btn.textContent = expanded ? '收起代码' : '展开完整代码';
    });
  });

  // 原有的代码块复制逻辑保持不变
  document.querySelectorAll('[data-copy="1"]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var block = btn.closest('.limhy-code-block');
      var code = block ? block.querySelector('code') : null;
      if(!code || !navigator.clipboard) return;
      navigator.clipboard.writeText(code.innerText || code.textContent || '');
      var old = btn.textContent; btn.textContent='已复制';
      setTimeout(function(){ btn.textContent=old; }, 1200);
    });
  });
});
