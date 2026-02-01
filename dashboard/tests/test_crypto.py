"""
Tests for crypto.py - Baseline encryption.
"""
import pytest
import json
from pathlib import Path
from unittest.mock import patch, MagicMock

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from crypto import BaselineEncryption, HAS_CRYPTO


class TestBaselineEncryption:
    """Tests for BaselineEncryption class."""

    def test_init_no_config(self, temp_dir):
        """Test initialization without existing config."""
        with patch('crypto.CRYPTO_CONFIG_FILE', temp_dir / 'crypto_config.json'):
            enc = BaselineEncryption()
            assert enc.is_enabled() is False
            assert enc.is_unlocked() is False

    def test_setup_creates_config(self, temp_dir):
        """Test setup creates config file."""
        config_file = temp_dir / 'crypto_config.json'
        with patch('crypto.CRYPTO_CONFIG_FILE', config_file):
            enc = BaselineEncryption()
            result = enc.setup('testpassword123')
            
            assert result is True
            assert enc.is_enabled() is True
            assert enc.is_unlocked() is True
            assert config_file.exists()

    def test_setup_requires_min_length(self, temp_dir):
        """Test setup requires minimum passphrase length."""
        with patch('crypto.CRYPTO_CONFIG_FILE', temp_dir / 'crypto_config.json'):
            enc = BaselineEncryption()
            result = enc.setup('short')
            
            assert result is False
            assert enc.is_enabled() is False

    def test_lock_clears_key(self, temp_dir):
        """Test lock clears derived key from memory."""
        with patch('crypto.CRYPTO_CONFIG_FILE', temp_dir / 'crypto_config.json'):
            enc = BaselineEncryption()
            enc.setup('testpassword123')
            assert enc.is_unlocked() is True
            
            enc.lock()
            assert enc.is_unlocked() is False

    def test_unlock_with_correct_passphrase(self, temp_dir):
        """Test unlock with correct passphrase."""
        config_file = temp_dir / 'crypto_config.json'
        with patch('crypto.CRYPTO_CONFIG_FILE', config_file):
            enc = BaselineEncryption()
            enc.setup('testpassword123')
            enc.lock()
            
            result = enc.unlock('testpassword123')
            assert result is True
            assert enc.is_unlocked() is True

    def test_unlock_with_wrong_passphrase(self, temp_dir):
        """Test unlock fails with wrong passphrase."""
        config_file = temp_dir / 'crypto_config.json'
        with patch('crypto.CRYPTO_CONFIG_FILE', config_file):
            enc = BaselineEncryption()
            enc.setup('testpassword123')
            enc.lock()
            
            result = enc.unlock('wrongpassword')
            assert result is False
            assert enc.is_unlocked() is False

    @pytest.mark.skipif(not HAS_CRYPTO, reason="cryptography not installed")
    def test_encrypt_decrypt_roundtrip(self, temp_dir):
        """Test data survives encrypt/decrypt cycle."""
        with patch('crypto.CRYPTO_CONFIG_FILE', temp_dir / 'crypto_config.json'):
            enc = BaselineEncryption()
            enc.setup('testpassword123')
            
            original_data = {
                'sessions': ['abc123', 'def456'],
                'counts': {'read': 10, 'write': 5},
                'nested': {'deep': {'value': True}}
            }
            
            encrypted = enc.encrypt(original_data)
            assert isinstance(encrypted, str)
            assert encrypted != json.dumps(original_data)
            
            decrypted = enc.decrypt(encrypted)
            assert decrypted == original_data

    def test_encrypt_requires_unlock(self, temp_dir):
        """Test encrypt raises when not unlocked."""
        with patch('crypto.CRYPTO_CONFIG_FILE', temp_dir / 'crypto_config.json'):
            enc = BaselineEncryption()
            enc.setup('testpassword123')
            enc.lock()
            
            with pytest.raises(RuntimeError, match="not unlocked"):
                enc.encrypt({'test': 'data'})

    def test_disable_clears_config(self, temp_dir):
        """Test disable clears all config."""
        config_file = temp_dir / 'crypto_config.json'
        with patch('crypto.CRYPTO_CONFIG_FILE', config_file):
            enc = BaselineEncryption()
            enc.setup('testpassword123')
            assert enc.is_enabled() is True
            
            enc.disable()
            assert enc.is_enabled() is False
            assert enc.is_unlocked() is False

    def test_get_status(self, temp_dir):
        """Test get_status returns correct info."""
        with patch('crypto.CRYPTO_CONFIG_FILE', temp_dir / 'crypto_config.json'):
            enc = BaselineEncryption()
            status = enc.get_status()
            
            assert 'available' in status
            assert 'enabled' in status
            assert 'unlocked' in status
            assert status['enabled'] is False
