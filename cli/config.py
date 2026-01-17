"""
Configuration file management
Handles .env file operations
"""

import os
from pathlib import Path


class ConfigManager:
    """Manages configuration files"""

    def __init__(self):
        self.project_root = Path(__file__).parent.parent
        self.env_path = self.project_root / '.env'

    def env_exists(self):
        """Check if .env file exists"""
        return self.env_path.exists()

    def get_persist_vault(self):
        """Read PERSIST_VAULT from existing .env"""
        if not self.env_exists():
            return False

        with open(self.env_path, 'r') as f:
            for line in f:
                if line.startswith('PERSIST_VAULT='):
                    value = line.split('=', 1)[1].strip().lower()
                    return value == 'true'
        return False

    def write_env(self, config, secrets):
        """Write .env file with all configuration"""
        content = f"""# HUSH Vault Configuration
# Generated at deployment - DO NOT EDIT MANUALLY

# Authentication (server-side only)
AUTH_HASH={secrets['auth_hash']}
KDF_SALT={secrets['kdf_salt']}
JWT_SECRET={secrets['jwt_secret']}

# Security Policy
MAX_AUTH_FAILURES={config['max_auth_failures']}
FAILURE_MODE={config['failure_mode']}
IP_BLOCK_MINUTES={config['ip_block_minutes']}
PANIC_MODE={str(config['panic_mode']).lower()}
PERSIST_VAULT={str(config['persist_vault']).lower()}

# Database
DATABASE_URL=postgresql://hush:hush@postgres:5432/hush

# Application
BACKEND_HOST=0.0.0.0
BACKEND_PORT=8000
"""

        with open(self.env_path, 'w') as f:
            f.write(content)

        # Set restrictive permissions (owner read/write only)
        # Note: os.chmod may not work fully on Windows, but setting it anyway
        try:
            os.chmod(self.env_path, 0o600)
        except OSError:
            pass  # Windows may not support Unix permissions
