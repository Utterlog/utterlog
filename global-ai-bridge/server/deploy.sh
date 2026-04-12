#!/bin/bash
# AI Bridge 快速部署脚本

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 配置
INSTALL_DIR="/opt/ai-bridge"
SERVICE_NAME="ai-bridge"
USER_NAME="ai-bridge"

echo -e "${GREEN}=== AI Bridge 快速部署脚本 ===${NC}"
echo ""

# 检查 root 权限
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}请使用 sudo 运行此脚本${NC}"
    exit 1
fi

# 检查系统
if [ ! -f /etc/os-release ]; then
    echo -e "${RED}无法识别操作系统${NC}"
    exit 1
fi

source /etc/os-release

# 安装依赖
echo -e "${YELLOW}1. 安装依赖...${NC}"
if command -v apt-get &> /dev/null; then
    # Debian/Ubuntu
    apt-get update
    apt-get install -y wget curl
elif command -v yum &> /dev/null; then
    # CentOS/RHEL
    yum install -y wget curl
elif command -v apk &> /dev/null; then
    # Alpine
    apk add --no-cache wget curl
else
    echo -e "${YELLOW}警告：无法自动安装依赖，请手动安装 wget 和 curl${NC}"
fi

# 创建用户
echo -e "${YELLOW}2. 创建用户...${NC}"
if ! id "$USER_NAME" &>/dev/null; then
    useradd -r -s /bin/false -d "$INSTALL_DIR" "$USER_NAME"
    echo -e "${GREEN}用户 $USER_NAME 已创建${NC}"
else
    echo -e "${GREEN}用户 $USER_NAME 已存在${NC}"
fi

# 创建目录
echo -e "${YELLOW}3. 创建目录...${NC}"
mkdir -p "$INSTALL_DIR"/{static,data}
chown -R "$USER_NAME:$USER_NAME" "$INSTALL_DIR"

# 下载二进制（假设从 GitHub Release 下载）
echo -e "${YELLOW}4. 下载 AI Bridge...${NC}"
ARCH=$(uname -m)
OS=$(uname -s | tr '[:upper:]' '[:lower:]')

# 架构映射
case $ARCH in
    x86_64) ARCH="amd64" ;;
    aarch64|arm64) ARCH="arm64" ;;
    *) echo -e "${RED}不支持的架构: $ARCH${NC}"; exit 1 ;;
esac

# 如果在本地构建，则复制
if [ -f "./ai-bridge" ]; then
    echo "使用本地构建的二进制文件..."
    cp ./ai-bridge "$INSTALL_DIR/"
    cp -r ./static/* "$INSTALL_DIR/static/" 2>/dev/null || true
else
    # 从 GitHub 下载最新版本
    LATEST_VERSION=$(curl -s https://api.github.com/repos/gentpan/ai-bridge/releases/latest | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')
    if [ -z "$LATEST_VERSION" ]; then
        echo -e "${RED}无法获取最新版本信息${NC}"
        exit 1
    fi
    
    DOWNLOAD_URL="https://github.com/gentpan/ai-bridge/releases/download/${LATEST_VERSION}/ai-bridge_${OS}_${ARCH}.tar.gz"
    
    echo "下载: $DOWNLOAD_URL"
    wget -q --show-progress -O /tmp/ai-bridge.tar.gz "$DOWNLOAD_URL"
    tar -xzf /tmp/ai-bridge.tar.gz -C "$INSTALL_DIR"
    rm /tmp/ai-bridge.tar.gz
fi

chmod +x "$INSTALL_DIR/ai-bridge"
chown -R "$USER_NAME:$USER_NAME" "$INSTALL_DIR"

# 创建配置文件
echo -e "${YELLOW}5. 创建配置文件...${NC}"
if [ ! -f "$INSTALL_DIR/.env" ]; then
    cat > "$INSTALL_DIR/.env" << 'EOF'
# AI Bridge 配置
LISTEN_ADDR=:8080
DATA_DIR=./data
NODE_NAME=us-aibridge
NODE_TRAFFIC_MODE=outbound

# 管理员 Token（请修改！）
SITE_TOKEN=change-me-to-a-secure-random-token

# 邮件配置（可选）
# EMAIL_PROVIDER=sendflare
# EMAIL_API_KEY=your-api-key
# EMAIL_FROM_ADDR=noreply@example.com
# EMAIL_FROM_NAME=AI Bridge

# AI 提供商配置
OPENAI_BASE_URL=https://api.openai.com/v1
ANTHROPIC_BASE_URL=https://api.anthropic.com/v1
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
EOF
    chown "$USER_NAME:$USER_NAME" "$INSTALL_DIR/.env"
    echo -e "${YELLOW}请编辑 $INSTALL_DIR/.env 文件，设置你的配置${NC}"
fi

# 创建 systemd 服务
echo -e "${YELLOW}6. 创建 systemd 服务...${NC}"
cat > "/etc/systemd/system/${SERVICE_NAME}.service" << EOF
[Unit]
Description=AI Bridge Gateway
After=network.target

[Service]
Type=simple
User=$USER_NAME
Group=$USER_NAME
WorkingDirectory=$INSTALL_DIR
ExecStart=$INSTALL_DIR/ai-bridge -static ./static
Restart=always
RestartSec=5
Environment=DATA_DIR=$INSTALL_DIR/data

# 安全设置
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$INSTALL_DIR/data

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"

# 启动服务
echo -e "${YELLOW}7. 启动服务...${NC}"
systemctl start "$SERVICE_NAME"

# 检查状态
sleep 2
if systemctl is-active --quiet "$SERVICE_NAME"; then
    echo -e "${GREEN}✓ 服务启动成功！${NC}"
    echo ""
    echo "访问地址:"
    IP=$(hostname -I | awk '{print $1}')
    echo "  - 申请页面: http://$IP:8080/"
    echo "  - 健康检查: http://$IP:8080/healthz"
    echo ""
    echo "管理命令:"
    echo "  - 查看状态: sudo systemctl status $SERVICE_NAME"
    echo "  - 查看日志: sudo journalctl -u $SERVICE_NAME -f"
    echo "  - 重启服务: sudo systemctl restart $SERVICE_NAME"
else
    echo -e "${RED}✗ 服务启动失败${NC}"
    echo "请检查日志: sudo journalctl -u $SERVICE_NAME -n 50"
    exit 1
fi

echo ""
echo -e "${GREEN}=== 部署完成 ===${NC}"
