#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

COMPOSE_CMD=()

print_banner() {
    local -a banner_lines=(
        "  _   _ _   _ ____  _   _"
        " | | | | | | / ___|| | | |"
        " | |_| | | | \\___ \\| |_| |"
        " |  _  | |_| |___) |  _  |"
        " |_| |_|\\___/|____/|_| |_|"
        ""
        " Zero-Knowledge Encrypted Chat Vault"
    )

    echo ""
    echo -e "${CYAN}+-----------------------------------------------------------+${NC}"
    for line in "${banner_lines[@]}"; do
        printf "%b\n" "${CYAN}|$(printf '%-59s' "$line")|${NC}"
    done
    echo -e "${CYAN}+-----------------------------------------------------------+${NC}"
    echo ""
}

choose_compose_cmd() {
    if docker compose version >/dev/null 2>&1; then
        COMPOSE_CMD=(docker compose)
        return
    fi

    if command -v docker-compose >/dev/null 2>&1; then
        COMPOSE_CMD=(docker-compose)
        return
    fi

    echo -e "${RED}[HUSH] ERROR: Neither 'docker compose' nor 'docker-compose' is installed${NC}"
    exit 1
}

docker_deploy() {
    if ! command -v docker >/dev/null 2>&1; then
        echo -e "${RED}[HUSH] ERROR: Docker is not installed${NC}"
        exit 1
    fi

    choose_compose_cmd

    # USE_EXISTING_ENV: 0 = reconfigure, 1 = use existing
    if [ "$USE_EXISTING_ENV" = "1" ]; then
        echo "[HUSH] Redeploying with existing configuration..."
        "${COMPOSE_CMD[@]}" down
        "${COMPOSE_CMD[@]}" build
        "${COMPOSE_CMD[@]}" up -d
        echo ""
        echo -e "${GREEN}[HUSH] Redeployment complete!${NC}"
        echo -e "${GREEN}[HUSH] Access your vault at: https://localhost${NC}"
    else
        export PYTHONPATH="$SCRIPT_DIR/cli:$PYTHONPATH"
        export HUSH_NO_BANNER=1
        python3 -c "
import sys
sys.path.insert(0, 'cli')
from main import main
sys.argv = ['hush', 'deploy', '--skip-env-check']
main()
"
    fi
}

check_existing_env() {
    # Returns: 0 = proceed with fresh/reconfigure, 1 = use existing, 2 = abort
    if [ ! -f .env ]; then
        return 0
    fi

    echo ""
    echo -e "${YELLOW}[HUSH] Existing configuration found.${NC}"
    echo ""
    echo "[HUSH] What would you like to do?"
    echo "       1. Use existing settings"
    echo "       2. Reconfigure (will generate new secrets)"
    echo ""
    read -p "       Select [1-2]: " CONFIG_CHOICE

    if [ "$CONFIG_CHOICE" = "1" ]; then
        echo -e "${GREEN}[HUSH] Using existing configuration${NC}"
        return 1
    elif [ "$CONFIG_CHOICE" = "2" ]; then
        echo -e "${YELLOW}[HUSH] WARNING: This will generate new secrets!${NC}"
        echo -e "${YELLOW}[HUSH] Your old login words will no longer work.${NC}"
        read -p "[HUSH] Type 'CONFIRM' to proceed: " CONFIRM
        if [ "$CONFIRM" != "CONFIRM" ]; then
            echo "[HUSH] Reconfiguration cancelled."
            return 2
        fi
        return 0
    else
        echo -e "${RED}[HUSH] Invalid selection.${NC}"
        return 2
    fi
}

print_banner

check_existing_env
ENV_RESULT=$?

if [ $ENV_RESULT -eq 2 ]; then
    echo "[HUSH] Aborting."
    exit 0
fi

export USE_EXISTING_ENV=$ENV_RESULT
docker_deploy
