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
