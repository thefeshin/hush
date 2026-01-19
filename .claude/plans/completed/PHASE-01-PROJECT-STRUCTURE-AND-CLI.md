# PHASE 01: Project Structure & Deployment CLI

## Overview
This phase establishes the foundational project structure and implements the single-command deployment CLI (`./hush deploy`). This is the entry point for the entire system — nothing else functions without it.

## Objectives
1. Create complete project directory structure
2. Implement the `hush` CLI script (Python)
3. Interactive security configuration prompts
4. Cryptographically secure secret generation
5. Configuration file generation (.env)
6. Validation and error handling

---

## 1. Directory Structure

Create the following structure:

```
hush/
├── hush                          # Main CLI entry point (executable)
├── cli/
│   ├── __init__.py
│   ├── main.py                   # CLI orchestration
│   ├── prompts.py                # Interactive prompts
│   ├── secrets.py                # Secret generation
│   ├── config.py                 # Configuration management
│   └── wordlist.py               # BIP39 wordlist (2048 words)
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── models/
│   │   ├── routers/
│   │   ├── services/
│   │   └── middleware/
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── crypto/
│   │   └── stores/
│   ├── public/
│   ├── package.json
│   ├── vite.config.ts
│   └── Dockerfile
├── nginx/
│   ├── nginx.conf
│   └── ssl/
├── docker-compose.yml
├── .env.example
├── .gitignore
└── PLAN.md
```

---

## 2. CLI Entry Point (`hush`)

Create executable Python script at project root.

### File: `hush`

```python
#!/usr/bin/env python3
"""
HUSH - Single-command deployment CLI
Usage: ./hush deploy
"""

import sys
import os

# Add cli directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'cli'))

from main import main

if __name__ == '__main__':
    main()
```

Make executable: `chmod +x hush`

---

## 3. CLI Main Orchestration

### File: `cli/main.py`

```python
"""
Main CLI orchestration - handles the deploy command flow
"""

import sys
import subprocess
from prompts import SecurityPrompts
from secrets import SecretGenerator
from config import ConfigManager


def print_banner():
    """Print HUSH ASCII banner"""
    print("""
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║     ██╗  ██╗██╗   ██╗███████╗██╗  ██╗                    ║
║     ██║  ██║██║   ██║██╔════╝██║  ██║                    ║
║     ███████║██║   ██║███████╗███████║                    ║
║     ██╔══██║██║   ██║╚════██║██╔══██║                    ║
║     ██║  ██║╚██████╔╝███████║██║  ██║                    ║
║     ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝                    ║
║                                                           ║
║     Zero-Knowledge Encrypted Chat Vault                   ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
    """)


def main():
    """Main entry point"""
    if len(sys.argv) < 2 or sys.argv[1] != 'deploy':
        print("Usage: ./hush deploy")
        print("\nThis is the only command. It does everything.")
        sys.exit(1)

    print_banner()

    # Check for existing deployment
    config_manager = ConfigManager()
    if config_manager.env_exists():
        if not handle_existing_deployment(config_manager):
            sys.exit(0)

    # Step 1: Collect security configuration
    print("\n[HUSH] Configuring security policy...\n")
    prompts = SecurityPrompts()
    security_config = prompts.collect_all()

    # Step 2: Generate secrets
    print("\n[HUSH] Generating cryptographic secrets...\n")
    generator = SecretGenerator()
    secrets = generator.generate_all()

    # Step 3: Write configuration
    print("[HUSH] Writing configuration...\n")
    config_manager.write_env(security_config, secrets)

    # Step 4: Print secrets (ONCE ONLY)
    print_secrets(secrets, security_config)

    # Step 5: Build and run containers
    print("\n[HUSH] Building containers...\n")
    build_result = subprocess.run(
        ['docker-compose', 'build'],
        capture_output=False
    )
    if build_result.returncode != 0:
        print("[HUSH] ERROR: Container build failed")
        sys.exit(1)

    print("\n[HUSH] Starting services...\n")
    run_result = subprocess.run(
        ['docker-compose', 'up', '-d'],
        capture_output=False
    )
    if run_result.returncode != 0:
        print("[HUSH] ERROR: Failed to start services")
        sys.exit(1)

    print("\n" + "=" * 60)
    print("[HUSH] Deployment complete!")
    print("[HUSH] Access your vault at: https://localhost")
    print("=" * 60)


def handle_existing_deployment(config_manager):
    """Handle case where .env already exists"""
    print("[HUSH] Existing deployment detected.\n")

    persist_vault = config_manager.get_persist_vault()

    if persist_vault:
        print("[HUSH] PERSIST_VAULT=true - Secrets will be reused.")
        confirm = input("[HUSH] Continue with existing secrets? [y/N]: ").strip().lower()
        if confirm == 'y':
            # Just rebuild and restart
            subprocess.run(['docker-compose', 'down'])
            subprocess.run(['docker-compose', 'build'])
            subprocess.run(['docker-compose', 'up', '-d'])
            print("\n[HUSH] Redeployment complete!")
            return False
        else:
            print("[HUSH] Aborting. Remove .env manually to reset vault.")
            return False
    else:
        print("[HUSH] PERSIST_VAULT=false - A new vault will be created.")
        print("[HUSH] WARNING: All existing data will become unreadable!")
        confirm = input("[HUSH] Proceed with fresh deployment? [y/N]: ").strip().lower()
        if confirm != 'y':
            print("[HUSH] Aborting.")
            return False
        # Continue with fresh deployment
        subprocess.run(['docker-compose', 'down', '-v'])
        return True


def print_secrets(secrets, config):
    """Print secrets exactly once - never stored in plaintext"""
    print("\n" + "=" * 60)
    print("         HUSH VAULT INITIALIZED")
    print("=" * 60)
    print("\n╔═══════════════════════════════════════════════════════════╗")
    print("║  LOGIN WORDS (SAVE THESE - NOT RECOVERABLE)               ║")
    print("╠═══════════════════════════════════════════════════════════╣")
    print(f"║                                                           ║")

    # Print words in a readable format (3 words per line)
    words = secrets['words']
    for i in range(0, 12, 3):
        line = f"  {i+1:2}. {words[i]:<12}  {i+2:2}. {words[i+1]:<12}  {i+3:2}. {words[i+2]:<12}"
        print(f"║ {line:<57} ║")

    print(f"║                                                           ║")
    print("╚═══════════════════════════════════════════════════════════╝")

    print(f"\nKDF SALT: {secrets['kdf_salt']}")

    print("\nFAILURE POLICY:")
    print(f"  - Max failures: {config['max_auth_failures']}")
    print(f"  - Mode: {config['failure_mode']}")
    print(f"  - Panic mode: {config['panic_mode']}")
    if config['failure_mode'] == 'ip_temp':
        print(f"  - Block duration: {config['ip_block_minutes']} minutes")

    print("\n" + "=" * 60)
    print("  WRITE THESE WORDS DOWN. THEY WILL NOT BE SHOWN AGAIN.")
    print("  LOSING THEM MEANS PERMANENT DATA LOSS.")
    print("=" * 60 + "\n")
```

---

## 4. Interactive Prompts

### File: `cli/prompts.py`

```python
"""
Interactive security configuration prompts
All decisions are locked at deployment time
"""


class SecurityPrompts:
    """Handles all interactive security prompts"""

    def collect_all(self):
        """Collect all security configuration"""
        config = {}

        # Prompt 1: Max failures
        config['max_auth_failures'] = self._prompt_max_failures()

        # Prompt 2: Failure mode
        config['failure_mode'] = self._prompt_failure_mode()

        # Prompt 3: IP block duration (conditional)
        if config['failure_mode'] == 'ip_temp':
            config['ip_block_minutes'] = self._prompt_ip_block_duration()
        else:
            config['ip_block_minutes'] = 0

        # Prompt 4: Panic mode
        config['panic_mode'] = self._prompt_panic_mode()

        # Prompt 5: Vault persistence
        config['persist_vault'] = self._prompt_persistence()

        return config

    def _prompt_max_failures(self):
        """Prompt for max auth failures before action"""
        print("[HUSH] Max failed unlock attempts before action?")
        while True:
            try:
                value = input("       Enter number (default: 5): ").strip()
                if value == '':
                    return 5
                value = int(value)
                if value < 1:
                    print("       Must be at least 1")
                    continue
                if value > 100:
                    print("       Maximum is 100")
                    continue
                return value
            except ValueError:
                print("       Please enter a valid number")

    def _prompt_failure_mode(self):
        """Prompt for action after threshold exceeded"""
        print("\n[HUSH] Action after threshold exceeded:")
        print("       1. Temporary IP block")
        print("       2. Permanent IP block")
        print("       3. Wipe database")
        print("       4. Wipe database + shutdown")

        modes = {
            '1': 'ip_temp',
            '2': 'ip_perm',
            '3': 'db_wipe',
            '4': 'db_wipe_shutdown'
        }

        while True:
            choice = input("       Select [1-4]: ").strip()
            if choice in modes:
                return modes[choice]
            print("       Please select 1, 2, 3, or 4")

    def _prompt_ip_block_duration(self):
        """Prompt for IP block duration in minutes"""
        print("\n[HUSH] IP block duration (minutes)?")
        while True:
            try:
                value = input("       Enter minutes (default: 60): ").strip()
                if value == '':
                    return 60
                value = int(value)
                if value < 1:
                    print("       Must be at least 1 minute")
                    continue
                if value > 10080:  # 1 week
                    print("       Maximum is 10080 (1 week)")
                    continue
                return value
            except ValueError:
                print("       Please enter a valid number")

    def _prompt_panic_mode(self):
        """Prompt for panic mode"""
        print("\n[HUSH] Enable PANIC MODE?")
        print("       (Any auth failure wipes DB + shuts down)")
        while True:
            choice = input("       [y/N]: ").strip().lower()
            if choice in ('', 'n', 'no'):
                return False
            if choice in ('y', 'yes'):
                print("\n       ⚠️  WARNING: Panic mode is EXTREMELY DANGEROUS")
                print("       A single typo will destroy all data!")
                confirm = input("       Type 'CONFIRM' to enable: ").strip()
                if confirm == 'CONFIRM':
                    return True
                print("       Panic mode NOT enabled")
                return False
            print("       Please enter y or n")

    def _prompt_persistence(self):
        """Prompt for vault persistence"""
        print("\n[HUSH] Should this vault survive redeployments?")
        print("       1. No — regenerate secrets every deploy")
        print("       2. Yes — reuse secrets if present")

        while True:
            choice = input("       Select [1-2]: ").strip()
            if choice == '1':
                return False
            if choice == '2':
                return True
            print("       Please select 1 or 2")
```

---

## 5. Secret Generation

### File: `cli/secrets.py`

```python
"""
Cryptographically secure secret generation
Uses only system CSPRNG - no third-party randomness
"""

import secrets
import hashlib
import base64
from wordlist import BIP39_WORDLIST


class SecretGenerator:
    """Generates all deployment secrets"""

    def generate_all(self):
        """Generate all required secrets"""
        words = self._generate_words()
        kdf_salt = self._generate_kdf_salt()
        auth_hash = self._generate_auth_hash(words)
        jwt_secret = self._generate_jwt_secret()

        return {
            'words': words,
            'kdf_salt': kdf_salt,
            'auth_hash': auth_hash,
            'jwt_secret': jwt_secret
        }

    def _generate_words(self):
        """Generate 12 random words from BIP39 wordlist"""
        # Use cryptographically secure random selection
        return [secrets.choice(BIP39_WORDLIST) for _ in range(12)]

    def _generate_kdf_salt(self):
        """Generate 32-byte random salt, base64 encoded"""
        salt_bytes = secrets.token_bytes(32)
        return base64.b64encode(salt_bytes).decode('ascii')

    def _generate_auth_hash(self, words):
        """
        Generate SHA-256 hash of normalized words
        This is what the server stores for authentication
        """
        # Normalize: lowercase, trimmed, single spaces
        normalized = ' '.join(word.lower().strip() for word in words)

        # SHA-256 hash
        hash_bytes = hashlib.sha256(normalized.encode('utf-8')).digest()
        return base64.b64encode(hash_bytes).decode('ascii')

    def _generate_jwt_secret(self):
        """Generate 64-byte secret for JWT signing"""
        return secrets.token_urlsafe(64)
```

---

## 6. Configuration Management

### File: `cli/config.py`

```python
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
        os.chmod(self.env_path, 0o600)
```

---

## 7. BIP39 Wordlist

### File: `cli/wordlist.py`

Create this file with the complete BIP39 wordlist (2048 words). For brevity, showing structure:

```python
"""
BIP39 English wordlist (2048 words)
Used for generating the 12-word passphrase
"""

BIP39_WORDLIST = [
    "abandon", "ability", "able", "about", "above", "absent", "absorb", "abstract",
    "absurd", "abuse", "access", "accident", "account", "accuse", "achieve", "acid",
    # ... (complete 2048 words)
    "zone", "zoo"
]

# Validation
assert len(BIP39_WORDLIST) == 2048, "Wordlist must contain exactly 2048 words"
assert len(set(BIP39_WORDLIST)) == 2048, "Wordlist must contain unique words"
```

---

## 8. Security Considerations

### Secrets Never Stored in Plaintext
- The 12 words are ONLY printed to stdout once
- `.env` contains only the AUTH_HASH (SHA-256 of words)
- KDF_SALT is stored but useless without the words

### Randomness Source
- Uses Python's `secrets` module (CSPRNG)
- Falls back to OS-level entropy (`/dev/urandom` or CryptGenRandom)
- Never uses `random` module

### File Permissions
- `.env` is created with mode 0o600 (owner read/write only)
- Prevents accidental exposure

### Input Validation
- All prompts have bounds checking
- No shell injection possible (no string interpolation in shell commands)

---

## 9. Verification Checklist

After implementing this phase, verify:

- [ ] `./hush deploy` runs without arguments error
- [ ] All 5 prompts appear in order
- [ ] Conditional prompt (IP block duration) only shows when needed
- [ ] 12 words are generated and displayed
- [ ] Words are from BIP39 wordlist
- [ ] `.env` file is created with correct values
- [ ] AUTH_HASH matches SHA-256 of normalized words
- [ ] Panic mode requires "CONFIRM" to enable
- [ ] Existing deployment is detected and handled
- [ ] File permissions are restrictive

---

## 10. Test Commands

```bash
# Test CLI help
./hush

# Test full deployment
./hush deploy

# Verify .env was created
cat .env

# Verify permissions
ls -la .env

# Test redeployment detection
./hush deploy
```

---

## Dependencies

```
# cli/requirements.txt
# No external dependencies - uses only stdlib
```

The CLI uses only Python standard library to minimize attack surface.
