#!/bin/sh
# Docker entry point: background poller (charts / WAN card) + web server.
# SNMP_HOST, SNMP_COMMUNITY, SNMP_WRITE_COMMUNITY, SSH_USERNAME and
# SSH_PASSWORD (environment) override config.json.
echo "Selfheal dashboard: modem ${SNMP_HOST:-<config.json>}"
python main.py &
exec python app.py
