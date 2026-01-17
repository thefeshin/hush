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
                print("\n       WARNING: Panic mode is EXTREMELY DANGEROUS")
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
        print("       1. No - regenerate secrets every deploy")
        print("       2. Yes - reuse secrets if present")

        while True:
            choice = input("       Select [1-2]: ").strip()
            if choice == '1':
                return False
            if choice == '2':
                return True
            print("       Please select 1 or 2")
