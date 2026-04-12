<?php
declare(strict_types=1);

function md(string $md): string
{
    return markdown_to_html($md);
}

function markdown_to_html(string $md): string
{
    $md = str_replace(["\r\n", "\r"], "\n", $md);
    $rawBlocks = [];
    $md = md_capture_raw_code_html($md, $rawBlocks);
    $md = md_capture_raw_html_blocks($md, $rawBlocks);
    $md = md_expand_shortcodes($md, $rawBlocks);
    $lines = explode("\n", $md);
    $len = count($lines);
    $html = '';
    $i = 0;
    while ($i < $len) {
        $line = $lines[$i];
        if (trim($line) === '') { $i++; continue; }
        if (isset($rawBlocks[trim($line)])) {
            $html .= $rawBlocks[trim($line)] . "\n";
            $i++;
            continue;
        }
        if (preg_match('/^`{3,}([a-zA-Z0-9_+-]*)\s*$/', $line, $m)) {
            $lang = strtolower(trim((string)($m[1] ?? '')));
            $code = ''; $i++;
            while ($i < $len && !preg_match('/^`{3,}\s*$/', $lines[$i])) { $code .= $lines[$i] . "\n"; $i++; }
            if ($i < $len) { $i++; }
            $html .= md_render_code_block($code, $lang);
            continue;
        }
        if (preg_match('/^(#{1,6})[ \t\x{3000}]*(.+)$/u', ltrim($line, "\xEF\xBB\xBF \t"), $m)) {
            $level = strlen($m[1]);
            $raw = trim((string)$m[2]);
            $id = md_heading_id($raw);
            $html .= "<h{$level} id=\"{$id}\">" . md_inline($raw) . "</h{$level}>\n";
            $i++; continue;
        }
        if (preg_match('/^(\-{3,}|\*{3,}|_{3,})\s*$/', $line)) { $html .= "<hr>\n"; $i++; continue; }
        if (str_starts_with(ltrim($line), '>')) {
            $block = '';
            while ($i < $len && (str_starts_with(ltrim($lines[$i]), '>') || trim($lines[$i]) !== '')) {
                $block .= preg_replace('/^>\s?/', '', $lines[$i]) . "\n"; $i++;
            }
            $html .= "<blockquote>\n" . markdown_to_html(trim($block)) . "</blockquote>\n";
            continue;
        }
        if (md_is_table($lines, $i, $len)) { $html .= md_parse_table($lines, $i, $len); continue; }
        if (preg_match('/^[ ]{0,3}[\*\-\+]\s+/', $line)) { $html .= md_parse_list($lines, $i, $len, 'ul'); continue; }
        if (preg_match('/^[ ]{0,3}\d+\.\s+/', $line)) { $html .= md_parse_list($lines, $i, $len, 'ol'); continue; }
        $para = '';
        while ($i < $len && trim($lines[$i]) !== '' && !isset($rawBlocks[trim($lines[$i])]) && !preg_match('/^(#{1,6}(?:[ \t\x{3000}]+|(?=\S))|`{3,}|>\s?|[\*\-\+]\s|\d+\.\s|\-{3,}|\*{3,}|_{3,}|\|)/u', $lines[$i])) {
            $para .= $lines[$i] . "\n"; $i++;
        }
        $para = trim($para);
        if ($para !== '') { $html .= '<p>' . md_inline($para) . "</p>\n"; }
    }

    if ($rawBlocks) {
        $html = strtr($html, $rawBlocks);
    }
    return $html;
}


function md_capture_raw_code_html(string $md, array &$rawBlocks = []): string
{
    $md = preg_replace_callback('/<pre\b([^>]*)>([\s\S]*?)<\/pre>/i', function ($m) use (&$rawBlocks) {
        $attrs = (string)($m[1] ?? '');
        $inner = (string)($m[2] ?? '');
        $lang = '';
        if (preg_match('/language-([a-zA-Z0-9_+-]+)/i', $attrs, $mm)) {
            $lang = strtolower((string)$mm[1]);
        }
        if (preg_match('/<code\b([^>]*)>([\s\S]*?)<\/code>/i', $inner, $cm)) {
            $codeAttrs = (string)($cm[1] ?? '');
            if ($lang === '' && preg_match('/language-([a-zA-Z0-9_+-]+)/i', $codeAttrs, $lm)) {
                $lang = strtolower((string)$lm[1]);
            }
            $inner = (string)($cm[2] ?? '');
        }
        $code = html_entity_decode(trim((string)$inner, "\n"), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $html = md_render_code_block($code, $lang);
        $token = '[[LIMHY_RAW_' . md5($html . microtime(true) . random_int(1000, 9999)) . ']]';
        $rawBlocks[$token] = $html;
        return "\n{$token}\n";
    }, $md);

    return preg_replace_callback('/<code\b([^>]*)>([\s\S]*?)<\/code>/i', function ($m) use (&$rawBlocks) {
        $attrs = (string)($m[1] ?? '');
        $lang = '';
        if (preg_match('/language-([a-zA-Z0-9_+-]+)/i', $attrs, $lm)) {
            $lang = strtolower((string)$lm[1]);
        }
        $code = html_entity_decode(trim((string)($m[2] ?? '')), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $html = $lang === '' ? '<code>' . e($code) . '</code>' : md_render_code_block($code, $lang);
        $token = '[[LIMHY_RAW_' . md5($html . microtime(true) . random_int(1000, 9999)) . ']]';
        $rawBlocks[$token] = $html;
        return $token;
    }, $md);
}



function md_capture_raw_html_blocks(string $md, array &$rawBlocks = []): string
{
    $lines = explode("\n", str_replace(["\r\n", "\r"], "\n", $md));
    $result = [];
    $len = count($lines);

    for ($i = 0; $i < $len; $i++) {
        $line = $lines[$i];
        if (!md_is_raw_html_candidate($line)) {
            $result[] = $line;
            continue;
        }

        $blockLines = [$line];
        $depth = md_html_tag_delta($line);
        $j = $i;

        while ($j + 1 < $len) {
            if ($depth <= 0) {
                break;
            }
            $j++;
            $blockLines[] = $lines[$j];
            $depth += md_html_tag_delta($lines[$j]);
        }

        $fragment = trim(implode("\n", $blockLines));
        $sanitized = md_sanitize_raw_html_fragment($fragment);
        if ($sanitized === '') {
            foreach ($blockLines as $rawLine) {
                $result[] = $rawLine;
            }
            $i = $j;
            continue;
        }

        $token = '[[LIMHY_RAW_' . md5($sanitized . microtime(true) . random_int(1000, 9999)) . ']]';
        $rawBlocks[$token] = $sanitized;
        $result[] = $token;
        $i = $j;
    }

    return implode("\n", $result);
}

function md_is_raw_html_candidate(string $line): bool
{
    $trimmed = ltrim($line);
    if ($trimmed === '') {
        return false;
    }
    if (isset($trimmed[0]) && $trimmed[0] !== '<') {
        return false;
    }
    if (preg_match('/^<\/(?:[a-zA-Z][a-zA-Z0-9:-]*)\s*>$/', $trimmed)) {
        return true;
    }
    return preg_match('/^<(?:[a-zA-Z][a-zA-Z0-9:-]*)(?:\s|>|\/)/', $trimmed) === 1;
}

function md_html_tag_delta(string $line): int
{
    preg_match_all('/<\/?\s*([a-zA-Z][a-zA-Z0-9:-]*)([^>]*)>/', $line, $matches, PREG_SET_ORDER);
    if (!$matches) {
        return 0;
    }

    $voidTags = ['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'];
    $delta = 0;
    foreach ($matches as $tagMatch) {
        $fullTag = (string)($tagMatch[0] ?? '');
        $name = strtolower((string)($tagMatch[1] ?? ''));
        if ($name === '') {
            continue;
        }
        if (str_starts_with($fullTag, '</')) {
            $delta--;
            continue;
        }
        $attrPart = (string)($tagMatch[2] ?? '');
        if (in_array($name, $voidTags, true) || preg_match('/\/\s*>$/', $fullTag) === 1 || str_ends_with(trim($attrPart), '/')) {
            continue;
        }
        $delta++;
    }
    return $delta;
}

function md_sanitize_raw_html_fragment(string $html): string
{
    $html = trim($html);
    if ($html === '') {
        return '';
    }

    $html = preg_replace('/<\s*(script|style|iframe|object|embed|form|input|button|textarea|select|option|base|meta|link)\b[\s\S]*?<\s*\/\s*\1\s*>/i', '', $html);
    $html = preg_replace('/<\/?\s*(script|style|iframe|object|embed|form|input|button|textarea|select|option|base|meta|link)\b[^>]*>/i', '', $html);

    $allowedTags = [
        'div','span','section','article','aside','header','footer','main','p','br','hr',
        'strong','em','b','i','u','del','blockquote','ul','ol','li','a','img',
        'pre','code','table','thead','tbody','tfoot','tr','th','td',
        'h1','h2','h3','h4','h5','h6','figure','figcaption',
        'video','audio','source','small','sub','sup','mark','kbd','samp',
        'svg','path','polyline','line','rect','circle','ellipse','polygon','g','defs','stop','lineargradient'
    ];
    $voidTags = ['br','hr','img','source'];
    $globalAttrs = ['class','id','title','role','style'];
    $tagAttrs = [
        'a' => ['href','target','rel'],
        'img' => ['src','alt','loading','width','height'],
        'video' => ['src','controls','autoplay','muted','loop','playsinline','preload','poster','width','height'],
        'audio' => ['src','controls','autoplay','muted','loop','preload'],
        'source' => ['src','type'],
        'svg' => ['viewBox','fill','stroke','stroke-width','stroke-linecap','stroke-linejoin','xmlns','width','height','preserveAspectRatio'],
        'path' => ['d','fill','stroke','stroke-width','stroke-linecap','stroke-linejoin'],
        'polyline' => ['points','fill','stroke','stroke-width','stroke-linecap','stroke-linejoin'],
        'line' => ['x1','y1','x2','y2','stroke','stroke-width','stroke-linecap','stroke-linejoin'],
        'rect' => ['x','y','rx','ry','width','height','fill','stroke','stroke-width'],
        'circle' => ['cx','cy','r','fill','stroke','stroke-width'],
        'ellipse' => ['cx','cy','rx','ry','fill','stroke','stroke-width'],
        'polygon' => ['points','fill','stroke','stroke-width'],
        'g' => ['fill','stroke','stroke-width'],
        'stop' => ['offset','stop-color','stop-opacity'],
        'lineargradient' => ['id','x1','x2','y1','y2','gradientUnits'],
        'th' => ['colspan','rowspan'],
        'td' => ['colspan','rowspan']
    ];

    return preg_replace_callback('/<\s*(\/)?\s*([a-zA-Z][a-zA-Z0-9:-]*)([^>]*)>/', function ($m) use ($allowedTags, $voidTags, $globalAttrs, $tagAttrs) {
        $isClosing = ((string)($m[1] ?? '')) === '/';
        $rawName = (string)($m[2] ?? '');
        $tag = strtolower($rawName);
        if (!in_array($tag, $allowedTags, true)) {
            return '';
        }
        if ($isClosing) {
            return '</' . $rawName . '>';
        }

        $attrs = (string)($m[3] ?? '');
        $isSelfClosing = in_array($tag, $voidTags, true) || preg_match('/\/\s*$/', $attrs) === 1;
        preg_match_all('/([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|\'([^\']*)\'|([^\s"\'=<>`]+)))?/', $attrs, $attrMatches, PREG_SET_ORDER);
        $safeAttrs = [];

        foreach ($attrMatches as $attr) {
            $name = (string)($attr[1] ?? '');
            if ($name === '') {
                continue;
            }
            $lowerName = strtolower($name);
            if (str_starts_with($lowerName, 'on')) {
                continue;
            }
            $isAllowed = in_array($lowerName, $globalAttrs, true)
                || str_starts_with($lowerName, 'data-')
                || str_starts_with($lowerName, 'aria-')
                || in_array($lowerName, array_map('strtolower', $tagAttrs[$tag] ?? []), true);
            if (!$isAllowed) {
                continue;
            }

            $value = (string)($attr[2] ?? $attr[3] ?? $attr[4] ?? '');
            if (in_array($lowerName, ['href','src'], true)) {
                $value = md_sanitize_raw_html_url($value, $tag, $lowerName);
                if ($value === '') {
                    continue;
                }
            } elseif ($lowerName === 'style') {
                $value = md_sanitize_inline_style($value);
                if ($value === '') {
                    continue;
                }
            } else {
                $value = trim($value);
            }

            if ($value === '' && !in_array($lowerName, ['controls','autoplay','muted','loop','playsinline'], true)) {
                continue;
            }

            if ($value === '' && in_array($lowerName, ['controls','autoplay','muted','loop','playsinline'], true)) {
                $safeAttrs[] = $name;
                continue;
            }

            $safeAttrs[] = $name . '="' . e($value) . '"';
        }

        $attrString = $safeAttrs ? ' ' . implode(' ', $safeAttrs) : '';
        return '<' . $rawName . $attrString . ($isSelfClosing ? '>' : '>');
    }, $html) ?? '';
}

function md_sanitize_raw_html_url(string $value, string $tag = '', string $attr = ''): string
{
    $value = trim(html_entity_decode($value, ENT_QUOTES | ENT_HTML5, 'UTF-8'));
    if ($value === '') {
        return '';
    }
    if (preg_match('/^(?:javascript|vbscript|data):/i', $value) === 1) {
        if ($tag === 'img' && $attr === 'src' && preg_match('/^data:image\//i', $value) === 1) {
            return $value;
        }
        return '';
    }
    if ($value[0] === '#' || $value[0] === '/' || preg_match('/^(https?:)?\/\//i', $value) === 1) {
        return $value;
    }
    return preg_match('/^[a-zA-Z0-9._\-\/]+(?:\?[\w\-=&%#.]*)?$/', $value) === 1 ? $value : '';
}

function md_sanitize_inline_style(string $style): string
{
    $style = trim(html_entity_decode($style, ENT_QUOTES | ENT_HTML5, 'UTF-8'));
    if ($style === '') {
        return '';
    }
    $style = preg_replace('/[\x00-\x1F\x7F]/u', '', $style) ?? '';
    if ($style === '') {
        return '';
    }
    if (preg_match('/(?:expression\s*\(|behavior\s*:|javascript:|vbscript:|@import)/i', $style) === 1) {
        return '';
    }
    $safeRules = [];
    foreach (explode(';', $style) as $rule) {
        $rule = trim($rule);
        if ($rule === '' || !str_contains($rule, ':')) {
            continue;
        }
        [$prop, $val] = array_map('trim', explode(':', $rule, 2));
        if ($prop === '' || $val === '') {
            continue;
        }
        if (preg_match('/[^a-zA-Z\-]/', $prop) === 1) {
            continue;
        }
        if (preg_match('/(?:expression\s*\(|behavior\s*:|javascript:|vbscript:|@import)/i', $val) === 1) {
            continue;
        }
        $safeRules[] = strtolower($prop) . ': ' . $val;
    }
    return implode('; ', $safeRules);
}

function md_expand_shortcodes(string $md, array &$rawBlocks = []): string
{
    $langs = ['php','java','html','css','js','javascript','json','sql','bash','shell','xml'];
    foreach ($langs as $lang) {
        $md = preg_replace_callback('/\[' . preg_quote($lang, '/') . '\]([\s\S]*?)\[\/' . preg_quote($lang, '/') . '\]/i', function ($m) use ($lang) {
            return "```" . ($lang === 'javascript' ? 'js' : $lang) . "\n" . trim((string)$m[1], "\n") . "\n```";
        }, $md);
    }
    $md = preg_replace_callback('/\[code(?:\s+lang=["\']?([a-zA-Z0-9_+-]+)["\']?)?\]([\s\S]*?)\[\/code\]/i', function ($m) {
        $lang = strtolower(trim((string)($m[1] ?? '')));
        return "```{$lang}\n" . trim((string)$m[2], "\n") . "\n```";
    }, $md);

    $md = preg_replace_callback('/\[color=([^\]]+)\]([\s\S]*?)\[\/color\]/i', function ($m) use (&$rawBlocks) {
        $color = trim((string)($m[1] ?? ''));
        $text = trim((string)($m[2] ?? ''));
        if ($text === '') return '';
        if (!preg_match('/^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,20}|rgba?\([^\)]+\)|hsla?\([^\)]+\))$/', $color)) {
            $color = '#ff4d4f';
        }
        $html = '<span style="color:' . e($color) . ';">' . md_inline($text) . '</span>';
        $token = '[[LIMHY_RAW_' . md5($html . microtime(true) . random_int(1000, 9999)) . ']]';
        $rawBlocks[$token] = $html;
        return $token;
    }, $md);
    $md = preg_replace_callback('/\[collapse\s+title=(["\"])(.*?)\1\]([\s\S]*?)\[\/collapse\]/i', function ($m) use (&$rawBlocks) {
        $title = trim((string)($m[2] ?? '')) ?: '点击展开内容';
        $bodyRaw = trim((string)($m[3] ?? ''));
        $bodyHtml = md($bodyRaw);
        $html = '<details class="limhy-collapse"><summary class="limhy-collapse__summary">' . e($title) . '</summary><div class="limhy-collapse__content">' . $bodyHtml . '</div></details>';
        $token = '[[LIMHY_RAW_' . md5($html . microtime(true) . random_int(1000, 9999)) . ']]';
        $rawBlocks[$token] = $html;
        return "\n{$token}\n";
    }, $md);
    $md = preg_replace_callback('/\[download\s+([^\]]+)\]/i', function ($m) use (&$rawBlocks) {
        $attrs = md_parse_shortcode_attrs((string)($m[1] ?? ''));
        $title = trim((string)($attrs['title'] ?? '获取程序')) ?: '获取程序';
        $desc = trim((string)($attrs['desc'] ?? '填写资源简介或版本说明'));
        $url  = trim((string)($attrs['url'] ?? '#')) ?: '#';
        $code = trim((string)($attrs['code'] ?? ''));
        $button = trim((string)($attrs['button'] ?? $attrs['btn'] ?? '立即下载体验')) ?: '立即下载体验';
        $accent = trim((string)($attrs['accent'] ?? '#FFC814')) ?: '#FFC814';
        if (!preg_match('/^#[0-9a-fA-F]{3,8}$/', $accent)) $accent = '#FFC814';
        $metaHtml = $code !== '' ? '<div class="limhy-download-card__meta">提取码：' . e($code) . '</div>' : '';
        $html = '<div class="limhy-download-card" style="--download-accent:' . e($accent) . ';"><div class="limhy-download-card__lead"><div class="limhy-download-card__icon" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg></div><div class="limhy-download-card__body"><div class="limhy-download-card__title">' . e($title) . '</div><div class="limhy-download-card__desc">' . e($desc) . '</div>' . $metaHtml . '</div></div><a class="limhy-download-card__btn" href="' . e($url) . '" target="_blank" rel="noopener">' . e($button) . '</a></div>';
        $token = '[[LIMHY_RAW_' . md5($html . microtime(true) . random_int(1000, 9999)) . ']]';
        $rawBlocks[$token] = $html;
        return "\n{$token}\n";
    }, $md);
    $md = preg_replace_callback('/\[video\]([\s\S]*?)\[\/video\]/i', function ($m) use (&$rawBlocks) {
        $raw = trim((string)$m[1]);
        $ratio = '16:9';
        if (str_contains($raw, '|')) {
            [$raw, $ratioRaw] = array_map('trim', explode('|', $raw, 2));
            if (in_array($ratioRaw, ['16:9','9:16','4:3'], true)) { $ratio = $ratioRaw; }
        }
        $padding = $ratio === '9:16' ? '177.78%' : ($ratio === '4:3' ? '75%' : '56.25%');
        $html = '';
        if (preg_match('~(?:https?:)?//(?:www\.)?bilibili\.com/video/(BV[0-9A-Za-z]+|av\d+)~i', $raw, $mm)) {
            $videoId = $mm[1];
            $queryKey = stripos($videoId, 'av') === 0 ? 'aid' : 'bvid';
            $src = 'https://player.bilibili.com/player.html?' . $queryKey . '=' . rawurlencode($videoId) . '&page=1';
            $html = '<div class="limhy-video" style="position:relative;width:100%;padding-top:' . $padding . ';overflow:hidden;border-radius:14px;background:#000;margin:18px 0;"><iframe src="' . e($src) . '" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin" style="position:absolute;inset:0;width:100%;height:100%;border:0;"></iframe></div>';
        } elseif (preg_match('~^https?://[^\s]+\.(mp4|webm|ogg)(\?.*)?$~i', $raw)) {
            $html = '<div class="limhy-video" style="margin:18px 0;"><video controls preload="metadata" style="width:100%;border-radius:14px;background:#000;display:block;"><source src="' . e($raw) . '"></video></div>';
        } else {
            $html = '<p>' . md_inline($raw) . '</p>';
        }
        $token = '[[LIMHY_RAW_' . md5($html . microtime(true) . random_int(1000, 9999)) . ']]';
        $rawBlocks[$token] = $html;
        return "\n{$token}\n";
    }, $md);
    return $md;
}

function md_render_code_block(string $code, string $lang = ''): string
{
    $langLabel = $lang !== '' ? strtoupper($lang) : 'CODE';
    $class = $lang !== '' ? ' language-' . preg_replace('/[^a-zA-Z0-9_+-]/', '', $lang) : '';
    $trimmed = rtrim($code, "
");
    $lineCount = substr_count($trimmed, "
") + 1;
    $isLong = $lineCount > 7;
    $toggle = $isLong ? '<button type="button" class="limhy-code-block__toggle" data-code-toggle="1" aria-expanded="false">展开完整代码</button>' : '';
    return '<div class="limhy-code-block' . ($isLong ? ' is-collapsed' : '') . '"><div class="limhy-code-block__bar"><span class="limhy-code-block__lang">' . e($langLabel) . '</span><div class="limhy-code-block__actions">' . $toggle . '<button type="button" class="limhy-code-block__copy" data-copy="1">复制</button></div></div><div class="limhy-code-block__body"><pre class="limhy-code-block__pre"><code class="' . trim($class) . '">' . e($trimmed) . '</code></pre></div></div>' . "
";
}

function md_inline(string $text): string
{
    $text = htmlspecialchars($text, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $text = preg_replace_callback('/`([^`\n]+)`/', fn($m) => '<code>' . e($m[1]) . '</code>', $text);
    $text = preg_replace_callback('/!\[([^\]]*)\]\(\s*([^\s\)]+).*\)/', fn($m) => '<img src="'.e($m[2]).'" alt="'.e($m[1]).'" loading="lazy">', $text);
    $text = preg_replace_callback('/\[([^\]]+)\]\(\s*([^\s\)]+).*\)/', fn($m) => '<a href="'.e($m[2]).'" target="_blank" rel="noopener">'.$m[1].'</a>', $text);
    $text = preg_replace('/\*\*(.+?)\*\*/s', '<strong>$1</strong>', $text);
    $text = preg_replace('/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/s', '<em>$1</em>', $text);
    $text = preg_replace('/~~(.+?)~~/s', '<del>$1</del>', $text);
    return nl2br($text);
}
function md_parse_shortcode_attrs(string $raw): array
{
    $attrs = [];
    if (preg_match_all('/([a-zA-Z0-9_-]+)\s*=\s*(["\"])(.*?)\2/s', $raw, $matches, PREG_SET_ORDER)) {
        foreach ($matches as $m) {
            $attrs[strtolower((string)$m[1])] = html_entity_decode((string)$m[3], ENT_QUOTES | ENT_HTML5, 'UTF-8');
        }
    }
    return $attrs;
}

function md_heading_id(string $raw): string { return 'h-' . substr(md5($raw), 0, 6); }
function md_parse_list(&$lines, &$i, $len, $tag): string { $p = $tag === 'ul' ? '/^([ ]*)[\*\-\+]\s+(.+)$/' : '/^([ ]*)\d+\.\s+(.+)$/'; $h = "<{$tag}>\n"; while ($i < $len && preg_match($p, $lines[$i], $m)) { $h .= "  <li>" . md_inline(trim($m[2])) . "</li>\n"; $i++; } return $h . "</{$tag}>\n"; }
function md_is_table(&$ls, $i, $len): bool { if ($i+1 >= $len) return false; return str_contains($ls[$i], '|') && preg_match('/^[\-:\s|]+$/', trim($ls[$i+1], "| ")); }
function md_parse_table(&$ls, &$i, $len): string { $head = md_table_cells($ls[$i++]); $aligns = md_table_aligns($ls[$i++]); $h = "<div class=\"md-table-wrap\"><table><thead><tr>"; foreach($head as $ci => $c) { $a = $aligns[$ci] ?? ''; $s = $a ? " style=\"text-align:{$a}\"" : ''; $h .= "<th{$s}>".md_inline($c)."</th>"; } $h .= "</tr></thead><tbody>"; while($i < $len && str_contains($ls[$i], '|') && trim($ls[$i]) !== '') { $cells = md_table_cells($ls[$i++]); $h .= "<tr>"; foreach($cells as $ci => $c) { $a = $aligns[$ci] ?? ''; $s = $a ? " style=\"text-align:{$a}\"" : ''; $h .= "<td{$s}>".md_inline($c)."</td>"; } $h .= "</tr>"; } return $h . "</tbody></table></div>\n"; }
function md_table_cells($l): array { return array_map('trim', explode('|', trim($l, '| '))); }
function md_table_aligns($l): array { $cs = md_table_cells($l); $as = []; foreach($cs as $c) { $left=str_starts_with($c,':'); $right=str_ends_with($c,':'); $as[]=$left&&$right?'center':($right?'right':($left?'left':'')); } return $as; }
