<?php
namespace itbdw\Ip;

class IpLocation {
    private static $instance;
    private $fp;
    private $firstip;
    private $lastip;
    private $totalip;

    private $dict_isp = [
        '联通',
        '移动',
        '铁通',
        '电信',
        '长城',
        '聚友',
    ];

    private $dict_city_directly = [
        '北京',
        '天津',
        '重庆',
        '上海',
    ];

    private $dict_province = [
        '北京',
        '天津',
        '重庆',
        '上海',
        '河北',
        '山西',
        '辽宁',
        '吉林',
        '黑龙江',
        '江苏',
        '浙江',
        '安徽',
        '福建',
        '江西',
        '山东',
        '河南',
        '湖北',
        '湖南',
        '广东',
        '海南',
        '四川',
        '贵州',
        '云南',
        '陕西',
        '甘肃',
        '青海',
        '台湾',
        '内蒙古',
        '广西',
        '宁夏',
        '新疆',
        '西藏',
        '香港',
        '澳门',
    ];

    private final function __construct($filepath = null) {
        $this->init($filepath);
    }

    private function init($filepath) {
        $filename = $filepath ?: __DIR__ . '/qqwry.dat';

        if (!file_exists($filename)) {
            trigger_error("IP数据库文件打开失败!");
            return;
        }

        if (($this->fp = fopen($filename, 'rb')) !== false) {
            $this->firstip = $this->getlong();
            $this->lastip  = $this->getlong();
            $this->totalip = ($this->lastip - $this->firstip) / 7;
        }
    }

    private function getlong() {
        $result = unpack('Vlong', fread($this->fp, 4));
        return $result['long'];
    }

    public static function getLocation($ip, $filepath = null) {
        if (self::$instance === null) {
            self::$instance = new self($filepath);
        }
        return self::$instance->getAddr($ip);
    }

    private function getAddr($ip) {
        $result = [];

        if (!$this->isValidIpV4($ip)) {
            $result['code'] = -400;
            $result['data']['ip'] = $ip;
            $result['data']['local'] = "错误的IP地址: $ip";
            return $result;
        }

        $location = $this->getlocationfromip($ip);
        if (!$location) {
            $result['error'] = '文件打开失败';
            return $result;
        }

        $location['org_country'] = $location['country'];
        $location['org_area'] = $location['area'];
        $location['isp'] = $this->getIsp($location['area']);
        
        $result['code'] = 200;
        $this->formatResult($result, $location);
        
        return $result;
    }

    /**
     * 格式化最终结果（优化：只保留国内省份/直辖市，不显示市区）
     */
    private function formatResult(&$result, $location) {
        // 获取原始位置信息
        $raw_location = $location['org_country'];
        
        // 特殊IP处理（本机/局域网）
        if ($raw_location == '本机地址' || $raw_location == '局域网') {
            $result['data']['local'] = $raw_location;
            $result['data']['isp'] = $raw_location;
            $result['area'] = $raw_location;
            return;
        }
        
        // 1. 预处理：移除"中国"前缀和连接符
        $location_info = $raw_location;
        if (mb_strpos($location_info, '中国') === 0) {
            $location_info = mb_substr($location_info, 2); // 去掉开头"中国"
        }
        $location_info = str_replace(['–', '-'], '', $location_info); // 清理连接符
        
        // 2. 核心优化：提取省份/直辖市，截断市区信息
        $province_city = ''; // 最终保留的省份/直辖市
        foreach ($this->dict_province as $region) {
            // 匹配省份/直辖市（如"北京"、"江苏"）
            if (mb_strpos($location_info, $region) === 0) {
                $province_city = $region;
                break; // 匹配到立即退出，避免重复匹配
            }
        }
        
        // 若未匹配到（如国外地址），保留原始位置（仅清理连接符）
        if (empty($province_city)) {
            $province_city = $location_info;
        }
        
        // 3. 处理运营商信息（去重+清理）
        $isp = $location['isp'];
        $area = $location['org_area'];
        
        // 运营商去重（优先清理位置信息中的运营商）
        if ($isp && mb_strpos($province_city, $isp) !== false) {
            $province_city = str_replace($isp, '', $province_city);
        }
        // 次要清理地区信息中的运营商
        elseif ($isp && $area && mb_strpos($area, $isp) !== false) {
            $area = str_replace($isp, '', $area);
        }
        $area = str_replace(['–', '-'], '', $area); // 清理运营商区域的连接符
        
        // 4. 组装最终结果
        $result['data']['local'] = $province_city; // 只显示省份/直辖市（无市区）
        $result['data']['isp'] = $isp ?: $area;    // 运营商信息
        $result['area'] = $province_city . ($isp ?: $area); // 完整信息（省份+运营商）
    }

    private function isValidIpV4($ip) {
        return filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) !== false;
    }

    private function getlocationfromip($ip) {
        if (!$this->fp) return null;

        $location['ip'] = $ip;
        $ip = $this->packip($location['ip']);
        
        $l = 0;
        $u = $this->totalip;
        $findip = $this->lastip;
        
        while ($l <= $u) {
            $i = floor(($l + $u) / 2);
            fseek($this->fp, $this->firstip + $i * 7);
            $beginip = strrev(fread($this->fp, 4));
            
            if ($ip < $beginip) {
                $u = $i - 1;
            } else {
                fseek($this->fp, $this->getlong3());
                $endip = strrev(fread($this->fp, 4));
                if ($ip > $endip) {
                    $l = $i + 1;
                } else {
                    $findip = $this->firstip + $i * 7;
                    break;
                }
            }
        }

        fseek($this->fp, $findip);
        $location['beginip'] = long2ip($this->getlong());
        $offset = $this->getlong3();
        fseek($this->fp, $offset);
        $location['endip'] = long2ip($this->getlong());
        $byte = fread($this->fp, 1);
        
        switch (ord($byte)) {
            case 1:
                $countryOffset = $this->getlong3();
                fseek($this->fp, $countryOffset);
                $byte = fread($this->fp, 1);
                switch (ord($byte)) {
                    case 2:
                        fseek($this->fp, $this->getlong3());
                        $location['country'] = $this->getstring();
                        fseek($this->fp, $countryOffset + 4);
                        $location['area'] = $this->getarea();
                        break;
                    default:
                        $location['country'] = $this->getstring($byte);
                        $location['area'] = $this->getarea();
                        break;
                }
                break;
            case 2:
                fseek($this->fp, $this->getlong3());
                $location['country'] = $this->getstring();
                fseek($this->fp, $offset + 8);
                $location['area'] = $this->getarea();
                break;
            default:
                $location['country'] = $this->getstring($byte);
                $location['area'] = $this->getarea();
                break;
        }

        $location['country'] = iconv("GBK", "UTF-8", $location['country']);
        $location['area'] = iconv("GBK", "UTF-8", $location['area']);

        if ($location['country'] == " CZ88.NET" || $location['country'] == "纯真网络") {
            $location['country'] = "无数据";
        }
        if ($location['area'] == " CZ88.NET") {
            $location['area'] = "";
        }

        return $location;
    }

    private function packip($ip) {
        return pack('N', intval($this->ip2long($ip)));
    }

    private function ip2long($ip) {
        $ip_arr = explode('.', $ip);
        return (16777216 * intval($ip_arr[0])) + (65536 * intval($ip_arr[1])) + 
               (256 * intval($ip_arr[2])) + intval($ip_arr[3]);
    }

    private function getlong3() {
        $result = unpack('Vlong', fread($this->fp, 3) . chr(0));
        return $result['long'];
    }

    private function getstring($data = "") {
        $char = fread($this->fp, 1);
        while (ord($char) > 0) {
            $data .= $char;
            $char = fread($this->fp, 1);
        }
        return $data;
    }

    private function getarea() {
        $byte = fread($this->fp, 1);
        switch (ord($byte)) {
            case 0:
                return "";
            case 1:
            case 2:
                fseek($this->fp, $this->getlong3());
                return $this->getstring();
            default:
                return $this->getstring($byte);
        }
    }

    private function getIsp($str) {
        $cleaned_str = str_replace(['–', '-', ' '], '', $str);
        foreach ($this->dict_isp as $v) {
            if (mb_strpos($cleaned_str, $v) !== false) {
                return $v;
            }
        }
        return '';
    }

    public function __destruct() {
        if ($this->fp) {
            fclose($this->fp);
        }
        $this->fp = 0;
    }
}