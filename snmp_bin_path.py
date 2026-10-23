"""snmp_bin_path.py — resolves the path to bundled SNMP binaries.

During development: looks in snmp_bin/ next to this file.
Inside a PyInstaller .exe: looks in snmp_bin/ next to the .exe.

The snmp_bin/ folder must be copied next to the .exe when shipping —
it is NOT extracted from the bundle at runtime (PyInstaller's --add-data
puts it in a temp folder that gets wiped on exit, so the binaries must
also live permanently beside the .exe where subprocess can call them).
"""

import sys
import os


def get_bin_path(name):
    """Return the absolute path to a binary in snmp_bin/.

    Args:
        name: filename, e.g. 'snmpwalk.exe' or 'snmpset.exe'

    Returns:
        Absolute path string, e.g. 'C:\\...\\snmp_bin\\snmpwalk.exe'
    """
    if getattr(sys, 'frozen', False):
        # Running as a PyInstaller .exe — use the folder beside the .exe
        base = os.path.dirname(sys.executable)
    else:
        # Running as a plain Python script — use the folder beside this file
        base = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base, 'snmp_bin', name)
