#!/bin/bash

# WASKITA LBS - Telegram Bot Helper Script
# Quick commands untuk manage Telegram integration

set -e

BACKEND_DIR="/app/backend"
SESSION_FILE="$BACKEND_DIR/northarch_session.session"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo ""
echo "================================================"
echo "  WASKITA LBS - Telegram Bot Helper"
echo "================================================"
echo ""

# Function definitions
check_session() {
    echo "Checking Telegram session..."
    if [ -f "$SESSION_FILE" ]; then
        echo -e "${GREEN}✓${NC} Session file found: $SESSION_FILE"
        echo "  Size: $(stat -f%z "$SESSION_FILE" 2>/dev/null || stat -c%s "$SESSION_FILE" 2>/dev/null) bytes"
        echo "  Modified: $(stat -f%Sm "$SESSION_FILE" 2>/dev/null || stat -c%y "$SESSION_FILE" 2>/dev/null)"
        return 0
    else
        echo -e "${RED}✗${NC} Session file not found"
        echo "  Run: $0 init"
        return 1
    fi
}

init_session() {
    echo "Initializing Telegram session..."
    echo ""
    cd "$BACKEND_DIR"
    python3 init_telegram.py
}

test_bot() {
    if ! check_session; then
        echo ""
        echo -e "${RED}Error:${NC} Session not initialized"
        echo "Run: $0 init"
        exit 1
    fi
    
    echo ""
    read -p "Enter phone number to test (e.g., 628123456789): " phone
    
    if [ -z "$phone" ]; then
        echo -e "${RED}Error:${NC} Phone number required"
        exit 1
    fi
    
    echo ""
    cd "$BACKEND_DIR"
    python3 test_bot.py "$phone"
}

view_logs() {
    echo "Viewing backend logs (last 50 lines)..."
    echo ""
    echo "=== BACKEND OUTPUT LOG ==="
    tail -50 /var/log/supervisor/backend.out.log
    echo ""
    echo "=== BACKEND ERROR LOG ==="
    tail -50 /var/log/supervisor/backend.err.log
}

tail_logs() {
    echo "Tailing backend logs (Ctrl+C to exit)..."
    echo ""
    tail -f /var/log/supervisor/backend.out.log /var/log/supervisor/backend.err.log
}

reset_session() {
    echo -e "${YELLOW}Warning:${NC} This will delete the Telegram session"
    read -p "Are you sure? (yes/no): " confirm
    
    if [ "$confirm" = "yes" ]; then
        echo "Deleting session files..."
        rm -f "$BACKEND_DIR"/northarch_session.session*
        echo -e "${GREEN}✓${NC} Session files deleted"
        echo "Run: $0 init to create new session"
    else
        echo "Cancelled"
    fi
}

restart_backend() {
    echo "Restarting backend service..."
    sudo supervisorctl restart backend
    echo -e "${GREEN}✓${NC} Backend restarted"
    echo ""
    sleep 2
    sudo supervisorctl status backend
}

status_check() {
    echo "System Status Check"
    echo ""
    
    echo "=== Telegram Session ==="
    check_session
    echo ""
    
    echo "=== Backend Service ==="
    sudo supervisorctl status backend
    echo ""
    
    echo "=== Environment Variables ==="
    if grep -q "TELEGRAM_API_ID" "$BACKEND_DIR/.env"; then
        echo -e "${GREEN}✓${NC} TELEGRAM_API_ID configured"
    else
        echo -e "${RED}✗${NC} TELEGRAM_API_ID not found in .env"
    fi
    
    if grep -q "TELEGRAM_API_HASH" "$BACKEND_DIR/.env"; then
        echo -e "${GREEN}✓${NC} TELEGRAM_API_HASH configured"
    else
        echo -e "${RED}✗${NC} TELEGRAM_API_HASH not found in .env"
    fi
    echo ""
    
    echo "=== Recent Telegram Activity ==="
    if grep -i "telegram\|telethon" /var/log/supervisor/backend.out.log | tail -5; then
        :
    else
        echo "  No recent Telegram activity in logs"
    fi
}

show_help() {
    echo "Usage: $0 <command>"
    echo ""
    echo "Commands:"
    echo "  init          Initialize Telegram session (first time setup)"
    echo "  test          Test bot communication with a phone number"
    echo "  status        Check system status"
    echo "  logs          View recent backend logs"
    echo "  tail          Tail backend logs in real-time"
    echo "  restart       Restart backend service"
    echo "  reset         Delete session and reset (use with caution)"
    echo "  help          Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 init              # Setup Telegram session"
    echo "  $0 test              # Test bot with phone number"
    echo "  $0 status            # Check if everything is working"
    echo "  $0 logs              # View recent logs"
    echo ""
}

# Main script
case "${1:-}" in
    init)
        init_session
        ;;
    test)
        test_bot
        ;;
    status)
        status_check
        ;;
    logs)
        view_logs
        ;;
    tail)
        tail_logs
        ;;
    restart)
        restart_backend
        ;;
    reset)
        reset_session
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        echo -e "${RED}Error:${NC} Unknown command '${1:-}'"
        echo ""
        show_help
        exit 1
        ;;
esac

echo ""
exit 0
