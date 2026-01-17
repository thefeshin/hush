"""
BIP39 English wordlist (2048 words)
Used for generating the 12-word passphrase
Uses the official mnemonic package for the wordlist
"""

from mnemonic import Mnemonic

# Get the official BIP39 English wordlist
_mnemo = Mnemonic("english")
BIP39_WORDLIST = _mnemo.wordlist

# Validation
assert len(BIP39_WORDLIST) == 2048, "Wordlist must contain exactly 2048 words"
assert len(set(BIP39_WORDLIST)) == 2048, "Wordlist must contain unique words"
