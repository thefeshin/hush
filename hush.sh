#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

print_banner() {
    echo ""
    echo -e "${CYAN}╔═══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║     ██╗  ██╗██╗   ██╗███████╗██╗  ██╗                    ║${NC}"
    echo -e "${CYAN}║     ██║  ██║██║   ██║██╔════╝██║  ██║                    ║${NC}"
    echo -e "${CYAN}║     ███████║██║   ██║███████╗███████║                    ║${NC}"
    echo -e "${CYAN}║     ██╔══██║██║   ██║╚════██║██╔══██║                    ║${NC}"
    echo -e "${CYAN}║     ██║  ██║╚██████╔╝███████║██║  ██║                    ║${NC}"
    echo -e "${CYAN}║     ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝                    ║${NC}"
    echo -e "${CYAN}║     Zero-Knowledge Encrypted Chat Vault                   ║${NC}"
    echo -e "${CYAN}╚═══════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

check_command() {
    if ! command -v $1 &> /dev/null; then
        echo -e "${RED}[HUSH] ✗ $1 not found${NC}"
        return 1
    fi
    echo -e "${GREEN}[HUSH] ✓ $1${NC}"
    return 0
}

docker_deploy() {
    echo ""
    echo -e "${CYAN}[HUSH] Docker deployment selected${NC}"
    echo ""

    if ! command -v docker &> /dev/null; then
        echo -e "${RED}[HUSH] ERROR: Docker is not installed${NC}"
        exit 1
    fi

    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        echo -e "${RED}[HUSH] ERROR: docker-compose is not installed${NC}"
        exit 1
    fi

    # USE_EXISTING_ENV: 0 = reconfigure, 1 = use existing
    if [ "$USE_EXISTING_ENV" = "1" ]; then
        echo "[HUSH] Redeploying with existing configuration..."
        docker-compose down
        docker-compose build
        docker-compose up -d
        echo ""
        echo -e "${GREEN}[HUSH] Redeployment complete!${NC}"
        echo -e "${GREEN}[HUSH] Access your vault at: https://localhost${NC}"
    else
        # Run Python CLI for fresh deployment (generate secrets)
        export PYTHONPATH="$SCRIPT_DIR/cli:$PYTHONPATH"
        python3 -c "
import sys
sys.path.insert(0, 'cli')
from main import main
sys.argv = ['hush', 'deploy', '--skip-env-check']
main()
"
    fi
}

local_deploy() {
    echo ""
    echo -e "${CYAN}[HUSH] Local development selected${NC}"
    echo ""
    echo "[HUSH] Checking prerequisites..."

    MISSING=0
    check_command "python3" || MISSING=1
    check_command "node" || MISSING=1
    check_command "npm" || MISSING=1
    check_command "psql" || MISSING=1

    if [ $MISSING -eq 1 ]; then
        echo ""
        echo -e "${RED}[HUSH] Please install missing prerequisites and try again.${NC}"
        exit 1
    fi

    echo ""

    # Setup PostgreSQL database
    echo -e "${CYAN}[HUSH] Setting up PostgreSQL database...${NC}"

    # Check if database already exists by trying to connect (suppress password prompt with dummy password)
    if PGPASSWORD=hush psql -U hush -d hush -c "SELECT 1;" > /dev/null 2>&1; then
        echo -e "${GREEN}[HUSH] Database 'hush' already exists${NC}"
    else
        echo -e "${YELLOW}[HUSH] Database 'hush' not found. Creating...${NC}"
        echo ""

        # Ask for postgres password with retry loop
        POSTGRES_CONNECTED=0
        RETRY_COUNT=0
        MAX_RETRIES=3

        while [ $POSTGRES_CONNECTED -eq 0 ] && [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
            if [ $RETRY_COUNT -gt 0 ]; then
                echo ""
                echo -e "${RED}[HUSH] Connection failed. Incorrect password or connection issue.${NC}"
                echo ""
            fi

            echo -e "${CYAN}[HUSH] Enter PostgreSQL 'postgres' user password:${NC}"
            echo -e "${CYAN}[HUSH] (Press Enter if postgres user has no password)${NC}"
            read -s POSTGRES_PASSWORD
            export PGPASSWORD="$POSTGRES_PASSWORD"

            echo ""
            echo "[HUSH] Testing postgres connection..."

            # Test connection
            if psql -U postgres -c "SELECT 1;" > /dev/null 2>&1; then
                POSTGRES_CONNECTED=1
                echo -e "${GREEN}[HUSH] Connection successful${NC}"
            else
                RETRY_COUNT=$((RETRY_COUNT + 1))
                if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
                    echo -e "${YELLOW}[HUSH] Attempts remaining: $((MAX_RETRIES - RETRY_COUNT))${NC}"
                fi
            fi
        done

        if [ $POSTGRES_CONNECTED -eq 0 ]; then
            echo ""
            echo -e "${RED}[HUSH] ERROR: Cannot connect to PostgreSQL as 'postgres' user after $MAX_RETRIES attempts!${NC}"
            echo ""
            echo -e "${YELLOW}[HUSH] Common fixes:${NC}"
            echo "  1. Verify postgres password is correct"
            echo "  2. Ensure PostgreSQL is running: sudo systemctl status postgresql"
            echo "  3. Check pg_hba.conf allows password auth for postgres user"
            echo "  4. Try: sudo -u postgres psql (then set password: \\password postgres)"
            echo ""
            echo -e "${YELLOW}[HUSH] Or create database manually:${NC}"
            echo "  sudo -u postgres psql"
            echo "  CREATE USER hush WITH PASSWORD 'hush';"
            echo "  CREATE DATABASE hush OWNER hush;"
            unset PGPASSWORD
            exit 1
        fi

        # Create user
        echo "[HUSH] Creating user 'hush'..."
        USER_RESULT=$(psql -U postgres -c "CREATE USER hush WITH PASSWORD 'hush';" 2>&1)
        USER_EXIT=$?
        if [ $USER_EXIT -ne 0 ] && ! echo "$USER_RESULT" | grep -q "already exists"; then
            echo -e "${RED}[HUSH] ERROR: Failed to create database user!${NC}"
            echo -e "${RED}$USER_RESULT${NC}"
            unset PGPASSWORD
            exit 1
        fi

        if echo "$USER_RESULT" | grep -q "already exists"; then
            echo -e "${YELLOW}[HUSH] User 'hush' already exists${NC}"
        else
            echo -e "${GREEN}[HUSH] User 'hush' created${NC}"
        fi

        # Create database
        echo "[HUSH] Creating database 'hush'..."
        DB_RESULT=$(psql -U postgres -c "CREATE DATABASE hush OWNER hush;" 2>&1)
        DB_EXIT=$?
        if [ $DB_EXIT -ne 0 ] && ! echo "$DB_RESULT" | grep -q "already exists"; then
            echo -e "${RED}[HUSH] ERROR: Failed to create database!${NC}"
            echo -e "${RED}$DB_RESULT${NC}"
            unset PGPASSWORD
            exit 1
        fi

        if echo "$DB_RESULT" | grep -q "already exists"; then
            echo -e "${YELLOW}[HUSH] Database 'hush' already exists${NC}"
        else
            echo -e "${GREEN}[HUSH] Database 'hush' created${NC}"
        fi

        unset PGPASSWORD
        echo -e "${GREEN}[HUSH] Database setup complete${NC}"
    fi

    echo ""

    # Install CLI dependencies
    echo "[HUSH] Installing CLI dependencies..."
    if ! pip3 install -r cli/requirements.txt -q 2>/dev/null && ! pip install -r cli/requirements.txt -q 2>/dev/null; then
        echo -e "${YELLOW}[HUSH] Warning: CLI dependencies may have issues${NC}"
    fi

    # Install backend dependencies
    echo "[HUSH] Installing backend dependencies..."
    if ! pip3 install -r backend/requirements.txt 2>&1 && ! pip install -r backend/requirements.txt 2>&1; then
        echo -e "${RED}[HUSH] ERROR: Failed to install backend dependencies!${NC}"
        exit 1
    fi
    echo -e "${GREEN}[HUSH] Backend dependencies installed${NC}"

    # Install frontend dependencies
    echo "[HUSH] Installing frontend dependencies..."
    cd frontend
    if ! npm install; then
        echo -e "${RED}[HUSH] ERROR: Failed to install frontend dependencies!${NC}"
        cd ..
        exit 1
    fi
    cd ..
    echo -e "${GREEN}[HUSH] Frontend dependencies installed${NC}"

    echo ""

    # Handle configuration based on earlier user choice
    # USE_EXISTING_ENV: 0 = reconfigure, 1 = use existing
    if [ "$USE_EXISTING_ENV" = "0" ]; then
        echo ""
        echo -e "${CYAN}[HUSH] Configuring security policy...${NC}"
        echo ""
        cd cli
        python3 << 'PYTHON_SCRIPT'
from secret_generator import SecretGenerator
from config import ConfigManager
from prompts import SecurityPrompts

# Collect security configuration via interactive prompts
prompts = SecurityPrompts()
config = prompts.collect_all()

# Add deployment mode
config['deployment_mode'] = 'local'

# Generate secrets
generator = SecretGenerator()
secrets = generator.generate_all()

# Write .env
manager = ConfigManager()
manager.write_env(config, secrets)

print()
print('=' * 60)
print('         HUSH VAULT INITIALIZED')
print('=' * 60)
print()
print('LOGIN WORDS (SAVE THESE - NOT RECOVERABLE):')
print()
words = secrets['words']
for i in range(0, 12, 3):
    print(f'  {i+1:2}. {words[i]:<12}  {i+2:2}. {words[i+1]:<12}  {i+3:2}. {words[i+2]:<12}')
print()
print('=' * 60)
print('  WRITE THESE WORDS DOWN. THEY WILL NOT BE SHOWN AGAIN.')
print('=' * 60)
PYTHON_SCRIPT
        cd ..
    else
        echo -e "${GREEN}[HUSH] Using existing configuration${NC}"
    fi

    echo ""
    echo "[HUSH] Starting services..."
    echo ""

    # Start backend
    echo -e "${CYAN}[HUSH] Starting backend on http://localhost:8000${NC}"
    cd backend
    python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8000 &
    BACKEND_PID=$!
    cd ..

    # Wait and check if backend started
    sleep 3
    if ! kill -0 $BACKEND_PID 2>/dev/null; then
        echo ""
        echo -e "${RED}[HUSH] ERROR: Backend failed to start!${NC}"
        echo -e "${YELLOW}[HUSH] Try running manually: cd backend && python3 -m uvicorn app.main:app${NC}"
        exit 1
    fi

    # Start frontend
    echo -e "${CYAN}[HUSH] Starting frontend on http://localhost:3000${NC}"
    cd frontend
    npm run dev &
    FRONTEND_PID=$!
    cd ..

    # Wait and check if frontend started
    sleep 3
    if ! kill -0 $FRONTEND_PID 2>/dev/null; then
        echo ""
        echo -e "${RED}[HUSH] ERROR: Frontend failed to start!${NC}"
        echo -e "${YELLOW}[HUSH] Try running manually: cd frontend && npm run dev${NC}"
        kill $BACKEND_PID 2>/dev/null
        exit 1
    fi

    echo ""
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  HUSH is running!                                         ║${NC}"
    echo -e "${GREEN}║                                                           ║${NC}"
    echo -e "${GREEN}║  Frontend: http://localhost:3000                          ║${NC}"
    echo -e "${GREEN}║  Backend:  http://localhost:8000                          ║${NC}"
    echo -e "${GREEN}║                                                           ║${NC}"
    echo -e "${GREEN}║  Press Ctrl+C to stop all services                        ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
    echo ""

    trap "echo ''; echo '[HUSH] Shutting down...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM
    wait
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

# Main
print_banner

echo "[HUSH] Deployment mode:"
echo "       1. Docker (recommended) - requires Docker Desktop"
echo "       2. Local development - requires PostgreSQL, Python, Node.js"
echo ""
read -p "       Select [1-2]: " MODE

# Validate mode selection first
case $MODE in
    1|2) ;;
    *)
        echo -e "${RED}[HUSH] Invalid selection. Please run again and select 1 or 2.${NC}"
        exit 1
        ;;
esac

# Check for existing .env and get user choice
check_existing_env
ENV_RESULT=$?

if [ $ENV_RESULT -eq 2 ]; then
    echo "[HUSH] Aborting."
    exit 0
fi

# Export for use in deploy functions
export USE_EXISTING_ENV=$ENV_RESULT

case $MODE in
    1) docker_deploy ;;
    2) local_deploy ;;
esac
