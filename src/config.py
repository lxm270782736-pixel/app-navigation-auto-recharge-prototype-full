# Port configuration — reads from .env at project root.
# Do not hardcode ports here; edit .env instead.
from pathlib import Path


def _load_env() -> dict[str, str]:
    env_file = Path(__file__).resolve().parent.parent / '.env'
    result: dict[str, str] = {}
    try:
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                result[k.strip()] = v.strip()
    except FileNotFoundError:
        pass
    return result


_env = _load_env()

BACKEND_PORT: int = int(_env.get('BACKEND_PORT', 17659))
