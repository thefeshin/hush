"""
Main CLI orchestration - handles the deploy command flow
"""

import sys
import os
import subprocess
import shutil
import platform


def get_compose_command():
    """Return available compose command."""
    if shutil.which('docker'):
        result = subprocess.run(['docker', 'compose', 'version'], capture_output=True, text=True)
        if result.returncode == 0:
            return ['docker', 'compose']

    if shutil.which('docker-compose'):
        return ['docker-compose']

    return None


def get_platform():
    """Detect current platform"""
    system = platform.system().lower()
    if system == 'windows':
        return 'windows'
    elif system == 'darwin':
        return 'macos'
    else:
        return 'linux'


def ensure_dependencies():
    """Install required CLI dependencies if missing"""
    try:
        from mnemonic import Mnemonic
        return True
    except ImportError:
        print("[HUSH] Installing required dependencies...")
        cli_dir = os.path.dirname(os.path.abspath(__file__))
        requirements_path = os.path.join(cli_dir, 'requirements.txt')

        result = subprocess.run(
            [sys.executable, '-m', 'pip', 'install', '-r', requirements_path, '-q'],
            capture_output=True,
            text=True
        )

        if result.returncode != 0:
            print(f"[HUSH] ERROR: Failed to install dependencies")
            print(f"[HUSH] Run manually: pip install -r cli/requirements.txt")
            return False

        print("[HUSH] Dependencies installed.")
        return True


def ensure_ssl_certificates():
    """Generate SSL certificates if they don't exist"""
    cli_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(cli_dir)
    ssl_dir = os.path.join(project_root, 'nginx', 'ssl')
    cert_path = os.path.join(ssl_dir, 'cert.pem')
    key_path = os.path.join(ssl_dir, 'key.pem')

    # Check if certificates already exist
    if os.path.exists(cert_path) and os.path.exists(key_path):
        # Verify they're not empty
        if os.path.getsize(cert_path) > 0 and os.path.getsize(key_path) > 0:
            return True

    print("[HUSH] Generating SSL certificates...")

    # Ensure directory exists
    os.makedirs(ssl_dir, exist_ok=True)

    # Find OpenSSL
    openssl_cmd = shutil.which('openssl')

    if not openssl_cmd:
        current_platform = get_platform()
        print("[HUSH] ERROR: OpenSSL not found.")
        if current_platform == 'windows':
            print("[HUSH] Install Git for Windows (includes OpenSSL) or download from slproweb.com")
        elif current_platform == 'macos':
            print("[HUSH] OpenSSL should be pre-installed. Try: brew install openssl")
        else:
            print("[HUSH] Install with: apt install openssl OR yum install openssl")
        return False

    # Generate self-signed certificate
    result = subprocess.run([
        openssl_cmd, 'req', '-x509', '-newkey', 'rsa:4096', '-nodes',
        '-keyout', key_path,
        '-out', cert_path,
        '-days', '365',
        '-subj', '/CN=localhost'
    ], capture_output=True, text=True)

    if result.returncode != 0:
        print(f"[HUSH] ERROR: SSL generation failed")
        print(f"[HUSH] {result.stderr}")
        return False

    print("[HUSH] SSL certificates generated.")
    return True


def run_setup():
    """Run all prerequisite checks and setup"""
    print("[HUSH] Checking prerequisites...")

    # Step 1: Install dependencies if needed
    if not ensure_dependencies():
        return False

    # Step 2: Generate SSL certificates if needed
    if not ensure_ssl_certificates():
        return False

    return True


# Import after potential dependency installation
def get_modules():
    """Import modules after ensuring dependencies are installed"""
    from prompts import SecurityPrompts
    from secret_generator import SecretGenerator
    from config import ConfigManager
    return SecurityPrompts, SecretGenerator, ConfigManager


def print_banner():
    """Print HUSH ASCII banner"""
    import sys
    import io

    # Force UTF-8 output on Windows
    if sys.platform == 'win32':
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

    banner = """
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
    """
    try:
        print(banner)
    except UnicodeEncodeError:
        # Fallback for terminals that can't handle Unicode
        print("""
+-----------------------------------------------------------+
|                                                           |
|     H   H  U   U  SSSS  H   H                             |
|     H   H  U   U  S     H   H                             |
|     HHHHH  U   U  SSSS  HHHHH                             |
|     H   H  U   U     S  H   H                             |
|     H   H   UUU   SSSS  H   H                             |
|                                                           |
|     Zero-Knowledge Encrypted Chat Vault                   |
|                                                           |
+-----------------------------------------------------------+
        """)


def main():
    """Main entry point"""
    if len(sys.argv) < 2 or sys.argv[1] != 'deploy':
        print("Usage: ./hush deploy")
        print("\nThis is the only command. It does everything.")
        sys.exit(1)

    # Check for --skip-env-check flag (used when shell script already handled the prompt)
    skip_env_check = '--skip-env-check' in sys.argv

    # Run prerequisite setup (dependencies + SSL certs)
    if not run_setup():
        sys.exit(1)

    # Import modules after dependencies are installed
    SecurityPrompts, SecretGenerator, ConfigManager = get_modules()

    if os.getenv("HUSH_NO_BANNER") != "1":
        print_banner()

    # Check for existing deployment (unless shell script already handled it)
    config_manager = ConfigManager()
    if not skip_env_check and config_manager.env_exists():
        if not handle_existing_deployment(config_manager, ConfigManager):
            sys.exit(0)

    # Step 1: Collect security configuration
    print("[HUSH] Configuring security policy...")
    prompts = SecurityPrompts()
    security_config = prompts.collect_all()

    # Step 2: Generate secrets
    print("[HUSH] Generating cryptographic secrets...")
    generator = SecretGenerator()
    secrets = generator.generate_all()

    # Step 3: Write configuration (temporarily - will delete on failure)
    print("[HUSH] Writing configuration...")
    config_manager.write_env(security_config, secrets)

    compose_cmd = get_compose_command()
    if not compose_cmd:
        print("[HUSH] ERROR: Neither 'docker compose' nor 'docker-compose' is available")
        config_manager.delete_env()
        sys.exit(1)

    # Step 4: Build containers (BEFORE showing secrets)
    print("[HUSH] Building containers...")
    build_result = subprocess.run(
        [*compose_cmd, 'build'],
        capture_output=False
    )
    if build_result.returncode != 0:
        print("[HUSH] ERROR: Container build failed")
        # Delete the generated config on build failure
        config_manager.delete_env()
        print("[HUSH] Configuration deleted due to build failure")
        sys.exit(1)

    # Step 5: Start services
    print("[HUSH] Starting services...")
    run_result = subprocess.run(
        [*compose_cmd, 'up', '-d'],
        capture_output=False
    )
    if run_result.returncode != 0:
        print("[HUSH] ERROR: Failed to start services")
        # Delete the generated config on service start failure
        config_manager.delete_env()
        print("[HUSH] Configuration deleted due to service start failure")
        sys.exit(1)

    # Step 6: Print secrets (ONLY AFTER successful deployment)
    print_secrets(secrets, security_config)

    print("\n" + "=" * 60)
    print("[HUSH] Deployment complete!")
    print("[HUSH] Access your vault at: https://localhost")
    print("=" * 60)


def handle_existing_deployment(config_manager, ConfigManager):
    """Handle case where .env already exists"""
    print("[HUSH] Existing deployment detected.\n")

    compose_cmd = get_compose_command()
    if not compose_cmd:
        print("[HUSH] ERROR: Neither 'docker compose' nor 'docker-compose' is available")
        return False

    persist_vault = config_manager.get_persist_vault()

    if persist_vault:
        print("[HUSH] PERSIST_VAULT=true - Secrets will be reused.")
        confirm = input("[HUSH] Continue with existing secrets? [y/N]: ").strip().lower()
        if confirm == 'y':
            # Just rebuild and restart
            subprocess.run([*compose_cmd, 'down'])
            subprocess.run([*compose_cmd, 'build'])
            subprocess.run([*compose_cmd, 'up', '-d'])
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
        subprocess.run([*compose_cmd, 'down', '-v'])
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
    compose_cmd = get_compose_command()
    if not compose_cmd:
        print("[HUSH] ERROR: Neither 'docker compose' nor 'docker-compose' is available")
        return False
