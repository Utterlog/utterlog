<div class="container music-page-container">

    <!-- 1. 顶部搜索卡片 -->
    <div class="music-search-card">
        <input type="text" id="js-m-input" placeholder="搜索想听的歌手或歌曲名" value="">
        <img src="/assets/img/ss.png" alt="search" class="music-banner-ss" id="js-m-search-btn">
    </div>

    <!-- 2. 历史搜索记录 -->
    <div class="music-history-box" id="js-m-history-box" style="display:none;">
        <h3>历史搜索</h3>
        <div class="music-history-tags" id="js-m-history-wrap"></div>
    </div>

    <!-- 3. 搜索结果展示区 -->
    <div class="music-results-card">
        <img src="/assets/img/jg1.png" class="music-banner-jg1">
        
        <div class="music-results-header">
            <span class="music-results-header-text"> <span id="js-m-result-title">搜索结果</span> &middot; <?= e($quote) ?></span>
        </div>
        
        <div class="music-list" id="js-m-list">
            <div class="music-loading">🎸 正在调试琴弦加载中...</div>
        </div>
    </div>

    <!-- 4. 底部播放器 -->
    <div class="music-player-fixed">
        <img src="/assets/img/bftg.png" class="music-banner-bftg">
        
        <img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI0NSIgZmlsbD0iIzIyMiIvPjxjaXJjbGUgY3g9IjUwIiBjeT0iNTAiIHI9IjE1IiBmaWxsPSIjZWVlIi8+PGNpcmNsZSBjeD0iNTAiIGN5PSI1MCIgcj0iNSIgZmlsbD0iIzExMSIvPjwvc3ZnPg==" class="player-avatar" id="js-p-avatar">
        <div class="player-info-box">
            <div class="player-current-name" id="js-p-title">欢迎来到LiMhy音乐台</div>
            <div class="player-current-artist" id="js-p-artist">点击上方歌曲开始播放</div>
        </div>
        <img src="/assets/img/bf.svg" class="player-control-btn" id="js-p-ctrl">
        
        <audio id="js-p-audio" style="display:none;" preload="auto"></audio>
    </div>

</div>

<script>
document.addEventListener('DOMContentLoaded', function() {
    var listWrap = document.getElementById('js-m-list');
    var input = document.getElementById('js-m-input');
    var searchBtn = document.getElementById('js-m-search-btn');
    var audio = document.getElementById('js-p-audio');
    var ctrlBtn = document.getElementById('js-p-ctrl');
    var avatar = document.getElementById('js-p-avatar');
    var historyBox = document.getElementById('js-m-history-box');
    var historyWrap = document.getElementById('js-m-history-wrap');
    var resTitle = document.getElementById('js-m-result-title');
    
    var iconPlay = '/assets/img/bf.svg';
    var iconPause = '/assets/img/zt.svg';

    function getLocalHistory() {
        var historyStr = (document.cookie.match(/(?:^|; )lm_music_history=([^;]*)/) || [0,''])[1];
        if (!historyStr) return [];
        var arr = decodeURIComponent(historyStr).split('||');
        return arr.filter(function(item) { return item.trim() !== ''; });
    }

    function renderHistoryUI() {
        var arr = getLocalHistory();
        if(arr.length > 0) {
            historyBox.style.display = 'block';
            historyWrap.innerHTML = '';
            arr.forEach(function(tag) {
                var span = document.createElement('span');
                span.className = 'music-tag js-m-tag';
                span.innerText = tag;
                span.onclick = function() { input.value = tag; doSearch(tag); };
                historyWrap.appendChild(span);
            });
        } else {
            historyBox.style.display = 'none';
        }
    }

    function doSearch(keyword) {
        if(!keyword) return;
        listWrap.innerHTML = '<div class="music-loading">🎧 正在从磁带中读取...</div>';
        resTitle.innerText = (keyword === '热门歌曲' || keyword === '热门推荐') ? '热门推荐' : '搜索结果';

        if (keyword !== '热门歌曲' && keyword !== '热门推荐') {
            var arr = getLocalHistory();
            arr = arr.filter(function(item) { return item !== keyword; });
            arr.unshift(keyword);
            arr = arr.slice(0,8);
            document.cookie = 'lm_music_history=' + encodeURIComponent(arr.join('||')) + ';path=/;max-age='+(86400*30);
            
            renderHistoryUI();
        }

        var formData = new FormData();
        formData.append('action', 'search');
        formData.append('keyword', keyword);

        fetch('/api/music', { method: 'POST', body: formData, headers:{'X-Requested-With': 'XMLHttpRequest'} })
        .then(function(r){return r.json()})
        .then(function(res) { if(res.ok) listWrap.innerHTML = res.html; })
        .catch(function(){ listWrap.innerHTML = '<div class="music-loading">网络断了，信号塔维修中</div>'; });
    }

    searchBtn.onclick = function() { doSearch(input.value.trim()); };
    input.onkeypress = function(e) { if(e.keyCode === 13) doSearch(input.value.trim()); };

    listWrap.addEventListener('click', function(e) {
        var item = e.target.closest('.js-music-play');
        if(item) {
            var id = item.getAttribute('data-id');
            var source = item.getAttribute('data-src');
            var picId = item.getAttribute('data-pic');
            var currCover = item.getAttribute('data-cover'); 
            
            document.getElementById('js-p-title').innerText = item.getAttribute('data-name');
            document.getElementById('js-p-artist').innerText = item.getAttribute('data-artist');
            avatar.src = currCover;
            
            avatar.style.animation = 'none'; avatar.offsetHeight; avatar.style.animation = null;

            var fd = new FormData(); 
            fd.append('action', 'get_url'); 
            fd.append('id', id); 
            fd.append('source', source);
            fd.append('pic_id', picId);
            fd.append('cover', currCover); 

            fetch('/api/music', { method: 'POST', body: fd, headers:{'X-Requested-With': 'XMLHttpRequest'} })
            .then(function(r){return r.json()})
            .then(function(res) {
                if(res.ok && res.url) {
                    audio.src = res.url;
                    if (res.cover) {
                        avatar.src = res.cover;
                        item.querySelector('.music-item-cover').src = res.cover; 
                    }
                    audio.play();
                } else {
                    alert('获取歌曲失败或该资源因版权限制无法播放');
                }
            });
        }
    });

    audio.onplay = function() { ctrlBtn.src = iconPause; avatar.classList.add('is-playing'); };
    audio.onpause = function() { ctrlBtn.src = iconPlay; avatar.classList.remove('is-playing'); };
    audio.onended = function() { ctrlBtn.src = iconPlay; avatar.classList.remove('is-playing'); };
    ctrlBtn.onclick = function() { if(audio.src) { audio.paused ? audio.play() : audio.pause(); } };

    renderHistoryUI();
    var historyTags = getLocalHistory();
    var initKeyword = historyTags.length > 0 ? historyTags[0] : '热门歌曲';
    
    input.value = (initKeyword === '热门歌曲' || initKeyword === '热门推荐') ? '' : initKeyword;
    doSearch(initKeyword);
});
</script>