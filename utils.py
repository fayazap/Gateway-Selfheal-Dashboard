"""Shared helpers used by both app.py and main.py.

Consolidates the log_value()/read_log_data() pair that used to be defined
(with slightly different signatures) in each file, and adds rotation/tailing
so the plain-text log files (cpu_usage.log, free_memory.log, throughput.log,
memory_leak_modem.log, ...) don't grow forever and don't need to be parsed in
full just to read the most recent points.
"""

import datetime
import logging
import logging.handlers
from collections import deque

# One RotatingFileHandler-backed logger per log file, created on first use.
_line_loggers = {}


def _get_line_logger(filename, max_bytes=1_000_000, backup_count=3):
    """Return a cached logger that appends plain 'message\\n' lines to
    filename, rotating it (keeping backup_count old copies) once it exceeds
    max_bytes."""
    line_logger = _line_loggers.get(filename)
    if line_logger is None:
        line_logger = logging.getLogger(f"linelog.{filename}")
        line_logger.setLevel(logging.INFO)
        line_logger.propagate = False
        handler = logging.handlers.RotatingFileHandler(
            filename, maxBytes=max_bytes, backupCount=backup_count
        )
        handler.setFormatter(logging.Formatter("%(message)s"))
        line_logger.addHandler(handler)
        _line_loggers[filename] = line_logger
    return line_logger


def log_value(filename, value, unit, overwrite=False, is_last_known=False):
    """Append a timestamped "value unit" line to filename.

    overwrite=True replaces the file's contents instead of appending, for
    single-line "current status" files like wan0_stats.log. is_last_known
    just annotates the line so it's visible that the value is stale.
    """
    try:
        timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        note = " (last known)" if is_last_known else ""
        if overwrite:
            with open(filename, "w") as f:
                f.write(f"{timestamp}, {value} {unit}{note}\n")
        else:
            _get_line_logger(filename).info(f"{timestamp}, {value} {unit}{note}")
    except OSError as e:
        logging.getLogger(__name__).error(f"Failed to log to {filename}: {e}")


def read_log_data(filename, max_points=20):
    """Read at most the last max_points valid data points from a log file,
    without parsing the whole file (the file only ever grows via log_value,
    so the newest points are always at the end)."""
    data = []
    log = logging.getLogger(__name__)
    try:
        with open(filename, "r") as file:
            for line in deque(file, maxlen=max_points):
                try:
                    timestamp_str, value = line.strip().split(", ")
                    value = float(value.split()[0])
                    timestamp = datetime.datetime.strptime(timestamp_str, "%Y-%m-%d %H:%M:%S")
                    data.append({"x": timestamp.isoformat(), "y": value})
                except (ValueError, IndexError) as e:
                    log.error(f"Error parsing line in {filename}: {e}")
    except OSError as e:
        log.error(f"Error reading {filename}: {e}")
    return data
