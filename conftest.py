"""
Pytest bootstrap for the direct mode contract tests.

The GenLayer test harness injects the transaction message by writing it to a
temporary file and dup2-ing it onto fd 0. On POSIX it then unlinks the file
while the descriptor is still open, which Windows does not allow, so every test
errors out before the contract is ever loaded.

The unlink is pure cleanup: by the time it runs, the descriptor has already been
duplicated onto stdin and the harness is in the correct state. Swallowing the
Windows error here leaves behind a temp file and nothing else.
"""

import os
import sys
import tempfile

_LEAKED: list[str] = []


def _install_windows_tempfile_shim() -> None:
    if sys.platform != "win32":
        return

    try:
        from gltest.direct import loader
    except ImportError:
        return

    original = getattr(loader, "_inject_message_to_fd0", None)
    if original is None or getattr(original, "_win_shimmed", False):
        return

    real_unlink = os.unlink

    def tolerant_unlink(path, *args, **kwargs):
        try:
            return real_unlink(path, *args, **kwargs)
        except PermissionError:
            _LEAKED.append(str(path))
            return None

    def patched(vm):
        # The harness imports os inside the function body, so the swap has to
        # happen on the os module itself rather than on the loader namespace.
        os.unlink = tolerant_unlink
        try:
            return original(vm)
        finally:
            os.unlink = real_unlink

    patched._win_shimmed = True  # type: ignore[attr-defined]
    loader._inject_message_to_fd0 = patched


_install_windows_tempfile_shim()


def pytest_sessionfinish(session, exitstatus):
    root = tempfile.gettempdir()
    for path in _LEAKED:
        try:
            if os.path.dirname(path) == root:
                os.unlink(path)
        except OSError:
            pass
