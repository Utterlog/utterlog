<?php
/**
 * LiMhy - 前台首页模板
 * 
 * @package LiMhy
 * @version v3.0
 * @author  Jason（QQ：895443171）
 * @desc    聚合 Banner 区置顶文章与主线信息流呈现，引入三态智能封面引擎
 * @require array $pinned 置顶文章数组
 * @require array $posts  主线文章数组
 */

$bannerPosts = $pinned; 

$covConf = defined('POST_COVER_ENABLED') ? POST_COVER_ENABLED : 1;
if ($covConf === true) $covConf = 1;
if ($covConf === false) $covConf = 0;
?>

<div class="container">

    <?php if (!empty($bannerPosts)): ?>
    <section class="banner-section">
        <div class="banner-wrapper">
            <div class="banner-slider" id="js-banner-slider">
                <?php foreach ($bannerPosts as $bp):
                    $cover = get_post_cover_for_post($bp);
                    if (!$cover) $cover = asset('img/logo.png');
                ?>
                <div class="banner-item">
                    <a href="<?=post_url($bp)?>" class="banner-link-block">
                        <div class="banner-bg">
                            <img src="<?=e($cover)?>" alt="cover"<?= $k === 0 ? ' fetchpriority="high"' : ' loading="lazy"' ?> decoding="async" width="1200" height="480">
                            <div class="banner-overlay"></div>
                        </div>
                        <div class="banner-content">
                            <h2 class="banner-title"><?=e($bp['title'])?></h2>
                        </div>
                    </a>
                </div>
                <?php endforeach; ?>
            </div>

            <div class="banner-dots" id="js-banner-dots">
                <?php foreach ($bannerPosts as $k => $bp): ?>
                <div class="dot <?=$k===0?'active':''?>" data-index="<?=$k?>"></div>
                <?php endforeach; ?>
            </div>
        </div>
    </section>
    <?php endif; ?>

    <section class="post-list" id="js-home-feed" data-home-feed
             data-endpoint="<?= e($feed['endpoint'] ?? url('api/home-posts')) ?>"
             data-next-offset="<?= (int)($feed['next_offset'] ?? count($posts)) ?>"
             data-batch-size="<?= (int)($feed['batch_size'] ?? 8) ?>"
             data-has-more="<?= !empty($feed['has_more']) ? '1' : '0' ?>">
        <?= limhy_render_home_cards($posts) ?>
    </section>

    <div class="feed-loader<?= empty($feed['has_more']) ? ' is-hidden' : '' ?>" id="js-home-feed-loader" aria-live="polite">
        <button type="button" class="feed-loader__button" id="js-home-feed-button">加载更多文章</button>
    </div>
    <div class="feed-loader__sentinel<?= empty($feed['has_more']) ? ' is-hidden' : '' ?>" id="js-home-feed-sentinel" aria-hidden="true"></div>

</div>

<script id="js-home-feed-inline-fix">
(function () {
  var feed = document.querySelector('[data-home-feed]');
  var loader = document.getElementById('js-home-feed-loader');
  var button = document.getElementById('js-home-feed-button');
  var sentinel = document.getElementById('js-home-feed-sentinel');
  if (!feed || !loader || !button || !sentinel) {
    return;
  }

  var state = {
    endpoint: feed.getAttribute('data-endpoint') || '/api/home-posts',
    nextOffset: parseInt(feed.getAttribute('data-next-offset') || '0', 10),
    batchSize: parseInt(feed.getAttribute('data-batch-size') || '8', 10),
    hasMore: feed.getAttribute('data-has-more') === '1',
    loading: false
  };

  function syncUi() {
    if (!state.hasMore) {
      loader.classList.add('is-hidden');
      sentinel.classList.add('is-hidden');
      button.disabled = true;
      return;
    }
    loader.classList.remove('is-hidden');
    sentinel.classList.remove('is-hidden');
    button.disabled = state.loading;
    button.textContent = state.loading ? '加载中...' : '加载更多文章';
  }

  function loadMore() {
    if (state.loading || !state.hasMore) {
      return;
    }
    state.loading = true;
    syncUi();
    var url = state.endpoint + '?offset=' + encodeURIComponent(state.nextOffset) + '&limit=' + encodeURIComponent(state.batchSize) + '&_t=' + Date.now();
    fetch(url, {
      method: 'GET',
      credentials: 'same-origin',
      headers: { 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json' }
    })
      .then(function (res) {
        if (!res.ok) {
          throw new Error('HTTP ' + res.status);
        }
        return res.json();
      })
      .then(function (data) {
        if (!data || !data.ok) {
          throw new Error((data && data.error) || '加载失败');
        }
        if (data.html) {
          feed.insertAdjacentHTML('beforeend', data.html);
        }
        state.nextOffset = parseInt(data.next_offset || state.nextOffset, 10);
        state.hasMore = !!data.has_more;
        feed.setAttribute('data-next-offset', String(state.nextOffset));
        feed.setAttribute('data-has-more', state.hasMore ? '1' : '0');
      })
      .catch(function () {
        if (typeof window.showToast === 'function') {
          window.showToast('加载更多文章失败', 'error');
        }
      })
      .finally(function () {
        state.loading = false;
        syncUi();
      });
  }

  button.addEventListener('click', function () {
    loadMore();
  });

  syncUi();
})();
</script>
