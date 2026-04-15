#!/bin/bash
#
# scripts/deploy.sh — One-click deployment for inSona Admin
#
# Usage: sudo bash scripts/deploy.sh
#
# This script automates the full deployment flow:
#   1. Check prerequisites (docker, docker compose, git)
#   2. Interactive configuration (gateway IP, port, deploy dir, repo URL)
#   3. Clone or navigate to project directory
#   4. Generate .env file
#   5. Create required directories
#   6. Build and start with docker compose
#   7. Wait for healthy status
#   8. Verify deployment and report
#

set -e

# ─── Colors (optional, degrade gracefully) ───
if [[ -t 1 ]]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    NC='\033[0m'
else
    RED='' GREEN='' YELLOW='' BLUE='' NC=''
fi

log_info()  { echo -e "${BLUE}[INFO]${NC} $*"; }
log_ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

# ─── Error handler ───
trap 'log_error "Deployment failed at line $LINENO. Check docker compose logs: docker compose logs --tail=50"; exit 1' ERR

# ─── Step 1: Prerequisites check ───
log_info "Checking prerequisites..."

command -v docker >/dev/null 2>&1 || { log_error "Docker is required but not installed. Please install Docker first."; exit 1; }
log_ok "Docker: $(docker --version)"

docker compose version >/dev/null 2>&1 || { log_error "Docker Compose (v2) is required but not installed. Please install Docker Compose v2+."; exit 1; }
log_ok "Docker Compose: $(docker compose version | head -1)"

command -v git >/dev/null 2>&1 || { log_error "Git is required but not installed. Please install Git first."; exit 1; }
log_ok "Git: $(git --version)"

command -v curl >/dev/null 2>&1 || { log_error "curl is required but not installed. Please install curl first."; exit 1; }

log_ok "All prerequisites met."
echo ""

# ─── Step 2: Interactive configuration ───
echo "============================================"
echo "  inSona Admin — Deployment Configuration"
echo "============================================"
echo ""

# Show network interface hints for GATEWAY_IP
log_info "Detected network interfaces:"
if command -v ip >/dev/null 2>&1; then
    ip -4 addr show scope global 2>/dev/null | grep -oP 'inet \K[\d.]+' | while read -r ip_addr; do
        echo "    $ip_addr"
    done
elif command -v ifconfig >/dev/null 2>&1; then
    ifconfig 2>/dev/null | grep -E 'inet ' | grep -v '127.0.0.1' | awk '{print "    "$2}'
else
    echo "    (unable to detect — please enter manually)"
fi
echo ""

# Gateway IP (required)
read -p "Gateway IP (e.g., 192.168.1.100): " GATEWAY_IP
if [[ -z "$GATEWAY_IP" ]]; then
    log_error "Gateway IP is required. Aborting."
    exit 1
fi

# Gateway Port (default 8091)
read -p "Gateway port [8091]: " GATEWAY_PORT
GATEWAY_PORT=${GATEWAY_PORT:-8091}

# Deploy directory (default /opt/insona-admin)
read -p "Deploy directory [/opt/insona-admin]: " DEPLOY_DIR
DEPLOY_DIR=${DEPLOY_DIR:-/opt/insona-admin}

# Git repo URL (optional)
read -p "Git repo URL (leave empty if already cloned): " REPO_URL

echo ""
log_info "Configuration summary:"
echo "    Gateway IP:   $GATEWAY_IP"
echo "    Gateway Port: $GATEWAY_PORT"
echo "    Deploy Dir:   $DEPLOY_DIR"
if [[ -n "$REPO_URL" ]]; then
    echo "    Repo URL:     $REPO_URL"
else
    echo "    Repo URL:     (using existing directory)"
fi
echo ""

# ─── Step 3: Clone or navigate ───
if [[ -n "$REPO_URL" ]]; then
    if [[ -d "$DEPLOY_DIR" ]]; then
        log_warn "Directory $DEPLOY_DIR already exists, skipping clone."
        log_info "Pulling latest changes..."
        cd "$DEPLOY_DIR"
        git pull || log_warn "git pull failed, continuing with existing code."
    else
        log_info "Cloning repository to $DEPLOY_DIR..."
        git clone "$REPO_URL" "$DEPLOY_DIR"
        cd "$DEPLOY_DIR"
    fi
else
    if [[ ! -d "$DEPLOY_DIR" ]]; then
        log_error "Directory $DEPLOY_DIR does not exist and no repo URL provided."
        log_error "Please provide a repo URL or create the directory with project files."
        exit 1
    fi
    log_info "Using existing directory: $DEPLOY_DIR"
    cd "$DEPLOY_DIR"
fi

# Verify docker-compose.yml exists
if [[ ! -f "docker-compose.yml" ]]; then
    log_error "docker-compose.yml not found in $DEPLOY_DIR. Is this the correct project directory?"
    exit 1
fi

# ─── Step 4: Generate .env ───
if [[ -f ".env" ]]; then
    log_warn ".env file already exists."
    read -p "Overwrite existing .env? (y/N): " OVERWRITE
    if [[ "$OVERWRITE" != "y" && "$OVERWRITE" != "Y" ]]; then
        log_info "Keeping existing .env file."
    else
        log_info "Regenerating .env file..."
        cat > .env << ENVEOF
DATABASE_URL="file:/app/data/dev.db"
GATEWAY_IP="$GATEWAY_IP"
GATEWAY_PORT=$GATEWAY_PORT
LOG_PATH=/app/data/logs/energy.log
ENVEOF
        log_ok ".env file generated."
    fi
else
    log_info "Generating .env file..."
    cat > .env << ENVEOF
DATABASE_URL="file:/app/data/dev.db"
GATEWAY_IP="$GATEWAY_IP"
GATEWAY_PORT=$GATEWAY_PORT
LOG_PATH=/app/data/logs/energy.log
ENVEOF
    log_ok ".env file generated."
fi

# ─── Step 5: Create required directories ───
log_info "Creating required directories..."
mkdir -p ./data
chmod 755 ./data
mkdir -p ./data/logs
chmod 755 ./data/logs
log_ok "Directories created: ./data, ./data/logs"

# ─── Step 6: Build and start ───
echo ""
log_info "Building and starting containers..."
log_info "This may take 2-5 minutes for the first build..."
echo ""

docker compose up -d --build

log_ok "Containers started."
echo ""

# ─── Step 7: Wait for healthy status ───
log_info "Waiting for service to become healthy..."

TIMEOUT=120
ELAPSED=0
INTERVAL=5
HEALTHY=false

while [[ $ELAPSED -lt $TIMEOUT ]]; do
    # Check docker compose health status
    HEALTH_STATUS=$(docker compose ps --format '{{.State}}' 2>/dev/null | head -1 || echo "")

    if [[ "$HEALTH_STATUS" == *"healthy"* ]]; then
        HEALTHY=true
        break
    fi

    # Fallback: check HTTP response
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null || echo "000")
    if [[ "$HTTP_CODE" == "200" || "$HTTP_CODE" == "301" || "$HTTP_CODE" == "302" ]]; then
        HEALTHY=true
        break
    fi

    sleep $INTERVAL
    ELAPSED=$((ELAPSED + INTERVAL))
    echo -n "."
done

echo ""

if [[ "$HEALTHY" == "true" ]]; then
    log_ok "Service is healthy (${ELAPSED}s)"
else
    log_warn "Health check timed out after ${TIMEOUT}s. Service may still be starting."
    log_info "Check status with: docker compose ps"
    log_info "Check logs with: docker compose logs --tail=50"
fi

# ─── Step 8: Verify and report ───
echo ""
echo "============================================"
echo "  Deployment Summary"
echo "============================================"
echo ""

# Show container status
log_info "Container status:"
docker compose ps
echo ""

# Get server IP for URL
SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "<server-ip>")

log_ok "Deployment complete!"
echo ""
echo "  Access URL: http://${SERVER_IP}:3000"
echo "  Local URL:  http://localhost:3000"
echo ""

# ─── Post-deployment reminders ───
echo "============================================"
echo "  Next Steps"
echo "============================================"
echo ""

log_info "1. Verify gateway connection:"
echo "   docker compose logs --tail=20 | grep Gateway"
echo ""

log_info "2. Configure log rotation (recommended):"
if [[ -f "deploy/logrotate.conf" ]]; then
    echo "   sudo cp deploy/logrotate.conf /etc/logrotate.d/insona-admin"
    echo "   sudo logrotate -d /etc/logrotate.d/insona-admin  # verify config"
else
    echo "   (logrotate config not found at deploy/logrotate.conf)"
fi
echo ""

log_info "3. Enable auto-start on boot (optional):"
if [[ -f "deploy/insona-admin.service" ]]; then
    echo "   sudo cp deploy/insona-admin.service /etc/systemd/system/"
    echo "   sudo systemctl daemon-reload"
    echo "   sudo systemctl enable insona-admin"
    echo "   sudo systemctl start insona-admin"
else
    echo "   (systemd service file not found at deploy/insona-admin.service)"
fi
echo ""

log_info "4. Common operations:"
echo "   View logs:       docker compose logs -f"
echo "   Restart:         docker compose restart"
echo "   Stop:            docker compose down"
echo "   Update:          git pull && docker compose up -d --build"
echo ""

log_ok "inSona Admin is now running!"
