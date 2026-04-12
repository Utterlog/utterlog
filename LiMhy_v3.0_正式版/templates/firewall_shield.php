<?php
/**
 * LiMhy - 安全盾前端验证视图
 * 
 * @package LiMhy
 * @version v3.0
 * @author  Jason（QQ：895443171）
 * @desc    针对异常高频访问启动 5 秒浏览器环境质询
 * @require string $token 校验令牌
 */
?>
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>安全检查 - LiMhy System</title>
<style>
    :root { --bg:#fdfdfd; --text:#000; --border:3px solid #000; --shadow:4px 4px 0 #000; }
    body { background:var(--bg); color:var(--text); font-family:sans-serif; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; }
    .shield-card { background:#fff; border:var(--border); box-shadow:var(--shadow); padding:30px; border-radius:12px; text-align:center; max-width:400px; width:90%; }
    .loader { width:40px; height:40px; border:4px solid #000; border-bottom-color:transparent; border-radius:50%; display:inline-block; animation:spin 1s linear infinite; margin-bottom:20px; }
    @keyframes spin { 0% { transform:rotate(0deg); } 100% { transform:rotate(360deg); } }
    h2 { margin:0 0 10px 0; font-weight:900; }
    p { margin:0; font-size:14px; color:#555; }
</style>
</head>
<body>
<div class="shield-card">
    <div class="loader"></div>
    <h2>环境检测中...</h2>
    <p>请稍候，正在验证您的访问环境。<br>最多需要 5 秒钟。</p>
    
    <form id="challenge-form" method="POST">
        <input type="hidden" name="shield_token" value="<?=$token?>">
    </form>
</div>
<script>
    setTimeout(function() {
        document.getElementById('challenge-form').submit();
    }, 2000);
</script>
</body>
</html>
