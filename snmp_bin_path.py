"""snmp_bin_path.py — resolves the path to the net-snmp command-line tools.

Windows (dev or the PyInstaller .exe): the bundled snmp_bin/*.exe next to
this file / next to the .exe.
Linux / Docker: the system net-snmp tools (apt install snmp) found on PATH -
the bundled .exe files cannot run there.

SNMP_BIN_DIR (environment) overrides both, e.g. for testing.

The snmp_bin/ folder must be copied next to the .exe when shipping — it is
NOT extracted from the bundle at runtime (PyInstaller's --add-data puts it
in a temp folder that gets wiped on exit, so the binaries must also live
permanently beside the .exe where subprocess can call them).
"""

import os
import shutil
import sys


def _bundle_dir():
    if getattr(sys, 'frozen', False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))


def get_bin_path(name):
    """Return the path of an SNMP tool, e.g. get_bin_path('snmpwalk.exe').

    The '.exe' suffix may be given or not; it is only used on Windows.
    """
    base = name[:-4] if name.lower().endswith('.exe') else name

    override = os.environ.get('SNMP_BIN_DIR')
    if override:
        for candidate in (base, base + '.exe'):
            path = os.path.join(override, candidate)
            if os.path.exists(path):
                return path

    if os.name == 'nt':
        return os.path.join(_bundle_dir(), 'snmp_bin', base + '.exe')

    return shutil.which(base) or base
