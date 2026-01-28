"""
Baseline Encryption - AES-256-GCM with PBKDF2 key derivation.
Protects baseline data from tampering and unauthorized access.
"""
import os
import json
import base64
import hashlib
from pathlib import Path
from typing import Optional, Dict, Any

# Try cryptography, fall back to pycryptodome, or use basic HMAC-only mode
try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.backends import default_backend
    HAS_CRYPTO = True
except ImportError:
    try:
        from Crypto.Cipher import AES  # nosec B413 - fallback only, cryptography preferred
        from Crypto.Protocol.KDF import PBKDF2  # nosec B413
        from Crypto.Random import get_random_bytes  # nosec B413
        HAS_CRYPTO = True
        USE_PYCRYPTO = True
    except ImportError:
        HAS_CRYPTO = False
        USE_PYCRYPTO = False


CRYPTO_CONFIG_FILE = Path.home() / '.clawdbot' / 'security' / 'crypto_config.json'


class BaselineEncryption:
    """Handles encryption/decryption of baseline data."""

    def __init__(self):
        self.config = self._load_config()
        self._derived_key: Optional[bytes] = None

    def _load_config(self) -> Dict:
        """Load crypto config (salt, verification hash)."""
        if CRYPTO_CONFIG_FILE.exists():
            try:
                return json.loads(CRYPTO_CONFIG_FILE.read_text())
            except:
                pass
        return {
            'enabled': False,
            'salt': None,
            'verification_hash': None,  # Hash of passphrase for quick verification
        }

    def _save_config(self):
        """Save crypto config."""
        CRYPTO_CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
        CRYPTO_CONFIG_FILE.write_text(json.dumps(self.config, indent=2))

    def _derive_key(self, passphrase: str, salt: bytes) -> bytes:
        """Derive 256-bit key from passphrase using PBKDF2."""
        if not HAS_CRYPTO:
            # Fallback: simple SHA-256 (less secure but functional)
            return hashlib.pbkdf2_hmac('sha256', passphrase.encode(), salt, 100000)

        if 'USE_PYCRYPTO' in dir() and USE_PYCRYPTO:
            return PBKDF2(passphrase, salt, dkLen=32, count=100000)
        else:
            kdf = PBKDF2HMAC(
                algorithm=hashes.SHA256(),
                length=32,
                salt=salt,
                iterations=100000,
                backend=default_backend()
            )
            return kdf.derive(passphrase.encode())

    def is_enabled(self) -> bool:
        """Check if encryption is enabled."""
        return self.config.get('enabled', False)

    def is_unlocked(self) -> bool:
        """Check if we have the derived key in memory."""
        return self._derived_key is not None

    def setup(self, passphrase: str) -> bool:
        """Set up encryption with a new passphrase."""
        if not passphrase or len(passphrase) < 8:
            return False

        # Generate new salt
        salt = os.urandom(32)

        # Derive key
        key = self._derive_key(passphrase, salt)

        # Store verification hash (hash of hash, so we can verify without storing key)
        verification = hashlib.sha256(key).hexdigest()

        self.config = {
            'enabled': True,
            'salt': base64.b64encode(salt).decode(),
            'verification_hash': verification,
        }
        self._save_config()
        self._derived_key = key

        return True

    def unlock(self, passphrase: str) -> bool:
        """Unlock encryption with passphrase."""
        if not self.config.get('enabled'):
            return True  # Not enabled, always "unlocked"

        salt = base64.b64decode(self.config['salt'])
        key = self._derive_key(passphrase, salt)

        # Verify against stored hash
        verification = hashlib.sha256(key).hexdigest()
        if verification != self.config.get('verification_hash'):
            return False

        self._derived_key = key
        return True

    def lock(self):
        """Lock (clear key from memory)."""
        self._derived_key = None

    def disable(self):
        """Disable encryption entirely."""
        self.config = {'enabled': False, 'salt': None, 'verification_hash': None}
        self._save_config()
        self._derived_key = None

    def encrypt(self, data: Dict[str, Any]) -> str:
        """Encrypt data dict to base64 string."""
        if not self._derived_key:
            raise RuntimeError("Encryption not unlocked")

        plaintext = json.dumps(data).encode()
        nonce = os.urandom(12)  # 96-bit nonce for GCM

        if not HAS_CRYPTO:
            # Fallback: just HMAC + base64 (integrity, not confidentiality)
            mac = hashlib.sha256(self._derived_key + plaintext).digest()
            return base64.b64encode(b'HMAC' + mac + plaintext).decode()

        if 'USE_PYCRYPTO' in dir() and USE_PYCRYPTO:
            cipher = AES.new(self._derived_key, AES.MODE_GCM, nonce=nonce)
            ciphertext, tag = cipher.encrypt_and_digest(plaintext)
            return base64.b64encode(nonce + tag + ciphertext).decode()
        else:
            aesgcm = AESGCM(self._derived_key)
            ciphertext = aesgcm.encrypt(nonce, plaintext, None)
            return base64.b64encode(nonce + ciphertext).decode()

    def decrypt(self, encrypted: str) -> Optional[Dict[str, Any]]:
        """Decrypt base64 string to data dict."""
        if not self._derived_key:
            raise RuntimeError("Encryption not unlocked")

        try:
            raw = base64.b64decode(encrypted)

            # Check for HMAC fallback format
            if raw[:4] == b'HMAC':
                mac = raw[4:36]
                plaintext = raw[36:]
                expected_mac = hashlib.sha256(self._derived_key + plaintext).digest()
                if mac != expected_mac:
                    return None  # Tampered
                return json.loads(plaintext)

            if not HAS_CRYPTO:
                return None

            nonce = raw[:12]

            if 'USE_PYCRYPTO' in dir() and USE_PYCRYPTO:
                tag = raw[12:28]
                ciphertext = raw[28:]
                cipher = AES.new(self._derived_key, AES.MODE_GCM, nonce=nonce)
                plaintext = cipher.decrypt_and_verify(ciphertext, tag)
            else:
                ciphertext = raw[12:]
                aesgcm = AESGCM(self._derived_key)
                plaintext = aesgcm.decrypt(nonce, ciphertext, None)

            return json.loads(plaintext)
        except Exception as e:
            print(f"Decryption failed: {e}")
            return None

    def get_status(self) -> Dict:
        """Get encryption status for API."""
        return {
            'available': HAS_CRYPTO,
            'enabled': self.config.get('enabled', False),
            'unlocked': self.is_unlocked(),
            'fallback_mode': not HAS_CRYPTO and self.config.get('enabled', False),
        }


# Singleton
_encryption = None

def get_encryption() -> BaselineEncryption:
    global _encryption
    if _encryption is None:
        _encryption = BaselineEncryption()
    return _encryption
