<?php
class ipdbv6 {
    public $file;
    public $fd;
    public $total;
    public $db4;
    // 索引区
    public $index_start_offset;
    public $index_end_offset;
    public $offlen;
    public $iplen;
    
    // 省份列表，用于匹配国内地区
    private $provinces = [
        '北京', '天津', '河北', '山西', '内蒙古',
        '辽宁', '吉林', '黑龙江', '上海', '江苏',
        '浙江', '安徽', '福建', '江西', '山东',
        '河南', '湖北', '湖南', '广东', '广西',
        '海南', '重庆', '四川', '贵州', '云南',
        '西藏', '陕西', '甘肃', '青海', '宁夏', '新疆'
    ];

    public function __construct($dbipv4 = null) {
        if (PHP_INT_SIZE < 8) {
            die("本程序不支持PHP_INT_SIZE小于8的环境，请使用64位PHP。Windows系统请使用7.0.0以上版本。");
        }
        if (version_compare(PHP_VERSION, "5.6.3", "<")) {
            die("您的PHP版本过低，请使用5.6.3以上版本。");
        }
        $file = dirname(__FILE__) . "/ipv6wry.db";
        if (!file_exists($file) || !is_readable($file)) {
            throw new Exception("{$file} does not exist, or is not readable");
        }
        $this->file = $file;
        $this->fd = fopen($file, "rb");
        $this->index_start_offset = $this->read8(16);
        $this->offlen = $this->read1(6);
        $this->iplen = $this->read1(7);
        $this->total = $this->read8(8);
        $this->index_end_offset = $this->index_start_offset + ($this->iplen + $this->offlen) * $this->total;
        $this->db4 = $dbipv4; // 修复原代码变量未赋值问题
    }

    public function query($ip) {
        $ip_bin = inet_pton($ip);
        if ($ip_bin === false) {
            throw new Exception("错误或不完整的IP地址: $ip");
        }
        if (strlen($ip_bin) != 16) {
            throw new Exception("错误或不完整的IPv6地址: $ip");
        }
        $ip_num_arr = unpack("J2", $ip_bin);
        $ip_num1 = $ip_num_arr[1];
        $ip_num2 = $ip_num_arr[2];
        $ip_find = $this->find($ip_num1, $ip_num2, 0, $this->total);
        $ip_offset = $this->index_start_offset + $ip_find * ($this->iplen + $this->offlen);
        $ip_offset2 = $ip_offset + $this->iplen + $this->offlen;
        
        // 处理IP起始和结束地址
        $ip_start = inet_ntop(pack("J2", $this->read8($ip_offset), 0));
        try {
            $ip_end = inet_ntop(pack("J2", $this->read8($ip_offset2) - 1, 0));
        } catch (Exception $e) {
            $ip_end = "FFFF:FFFF:FFFF:FFFF::";
        }
        
        // 获取并处理地址信息
        $ip_record_offset = $this->read8($ip_offset + $this->iplen, $this->offlen);
        $ip_addr = $this->read_record($ip_record_offset);
        $processed_addr = $this->processAddress($ip_addr);
        
        return [
            "start" => $ip_start,
            "end" => $ip_end,
            "addr" => $processed_addr,
            "disp" => implode(" ", $processed_addr)
        ];
    }

    /**
     * 处理地址信息，国内只保留省份
     */
    private function processAddress($addr) {
        $combined = implode(' ', $addr);
        
        // 检查是否为国内地址
        if (strpos($combined, '中国') !== false) {
            // 尝试匹配省份
            foreach ($this->provinces as $province) {
                if (strpos($combined, $province) !== false) {
                    return [$province, ''];
                }
            }
        }
        
        // 非国内地址或未匹配到省份则返回原始信息
        return $addr;
    }

    /**
     * 读取记录
     */
    public function read_record($offset) {
        $record = ["", ""];
        $flag = $this->read1($offset);
        if ($flag == 1) {
            $location_offset = $this->read8($offset + 1, $this->offlen);
            return $this->read_record($location_offset); // 修复原代码缺少$this的问题
        } else {
            $record[0] = $this->read_location($offset);
            if ($flag == 2) {
                $record[1] = $this->read_location($offset + $this->offlen + 1);
            } else {
                $record[1] = $this->read_location($offset + strlen($record[0]) + 1);
            }
        }
        return $record;
    }

    /**
     * 读取地区
     */
    public function read_location($offset) {
        if ($offset == 0) {
            return "";
        }
        $flag = $this->read1($offset);
        // 出错
        if ($flag == 0) {
            return "";
        }
        // 仍然为重定向
        if ($flag == 2) {
            $offset = $this->read8($offset + 1, $this->offlen);
            return $this->read_location($offset);
        }
        $location = $this->readstr($offset);
        return $location;
    }

    /**
     * 查找 ip 所在的索引
     */
    public function find($ip_num1, $ip_num2, $l, $r) {
        if ($l + 1 >= $r) {
            return $l;
        }
        $m = intval(($l + $r) / 2);
        $m_ip1 = $this->read8($this->index_start_offset + $m * ($this->iplen + $this->offlen), $this->iplen);
        $m_ip2 = 0;
        if ($this->iplen <= 8) {
            $m_ip1 <<= 8 * (8 - $this->iplen);
        } else {
            $m_ip2 = $this->read8($this->index_start_offset + $m * ($this->iplen + $this->offlen) + 8, $this->iplen - 8);
            $m_ip2 <<= 8 * (16 - $this->iplen);
        }
        if ($this->uint64cmp($ip_num1, $m_ip1) < 0) {
            return $this->find($ip_num1, $ip_num2, $l, $m);
        } elseif ($this->uint64cmp($ip_num1, $m_ip1) > 0) {
            return $this->find($ip_num1, $ip_num2, $m, $r);
        } elseif ($this->uint64cmp($ip_num2, $m_ip2) < 0) {
            return $this->find($ip_num1, $ip_num2, $l, $m);
        } else {
            return $this->find($ip_num1, $ip_num2, $m, $r);
        }
    }

    public function readraw($offset = null, $size = 0) {
        if (!is_null($offset)) {
            fseek($this->fd, $offset);
        }
        return fread($this->fd, $size);
    }

    public function read1($offset = null) {
        if (!is_null($offset)) {
            if ($this->fd) {
                fseek($this->fd, $offset);
            }
        }
        $a = $this->fd ? fread($this->fd, 1) : '';
        $unpacked = unpack("C", $a);
        return $unpacked ? $unpacked[1] : 0;
    }

    public function read8($offset = null, $size = 8) {
        if (!is_null($offset) && $this->fd) {
            fseek($this->fd, $offset);
        }
        $a = $this->fd ? fread($this->fd, $size) : '';
        $a .= "\0\0\0\0\0\0\0\0"; // 补全8字节
        $unpacked = unpack("P", $a);
        return $unpacked ? $unpacked[1] : 0;
    }

    public function readstr($offset = null) {
        if (!is_null($offset)) {
            fseek($this->fd, $offset);
        }
        $str = "";
        $currentOffset = $offset;
        while (true) {
            $chr = $this->read1($currentOffset);
            if ($chr == 0) {
                break;
            }
            $str .= chr($chr);
            $currentOffset++;
        }
        return $str;
    }

    public function ip2num($ip) {
        return unpack("N", inet_pton($ip))[1];
    }

    public function inet_ntoa($nip) {
        $ip = [];
        for ($i = 3; $i > 0; $i--) {
            $ip_seg = intval($nip / pow(256, $i));
            $ip[] = $ip_seg;
            $nip -= $ip_seg * pow(256, $i);
        }
        $ip[] = $nip;
        return join(".", $ip);
    }

    public function uint64cmp($a, $b) {
        if ($a >= 0 && $b >= 0 || $a < 0 && $b < 0) {
            return $a <=> $b;
        } elseif ($a >= 0 && $b < 0) {
            return -1;
        } else { // $a < 0 && $b >= 0
            return 1;
        }
    }

    public function __destruct() {
        if ($this->fd) {
            fclose($this->fd);
        }
    }
}
?>