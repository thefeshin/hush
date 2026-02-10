import pytest

from app.config import Settings, validate_security_settings


def make_settings(**overrides) -> Settings:
    values = {
        "AUTH_HASH": "test-auth-hash",
        "KDF_SALT": "test-kdf-salt",
        "JWT_SECRET": "test-jwt-secret",
        "FAILURE_MODE": "ip_temp",
        "IP_BLOCK_MINUTES": 5,
        "MAX_AUTH_FAILURES": 5,
    }
    values.update(overrides)
    return Settings(**values)


def test_validate_security_settings_accepts_valid_values():
    settings = make_settings()
    validate_security_settings(settings)


@pytest.mark.parametrize("field_name", ["AUTH_HASH", "KDF_SALT", "JWT_SECRET"])
def test_validate_security_settings_rejects_empty_auth_secrets(field_name: str):
    settings = make_settings(**{field_name: ""})

    with pytest.raises(ValueError) as exc:
        validate_security_settings(settings)

    assert field_name in str(exc.value)


def test_validate_security_settings_rejects_invalid_failure_mode():
    settings = make_settings(FAILURE_MODE="block")

    with pytest.raises(ValueError) as exc:
        validate_security_settings(settings)

    assert "FAILURE_MODE" in str(exc.value)


def test_validate_security_settings_requires_positive_ip_block_for_ip_temp():
    settings = make_settings(FAILURE_MODE="ip_temp", IP_BLOCK_MINUTES=0)

    with pytest.raises(ValueError) as exc:
        validate_security_settings(settings)

    assert "IP_BLOCK_MINUTES" in str(exc.value)
