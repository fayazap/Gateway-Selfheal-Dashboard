#!/bin/bash

# Use environment variables with defaults
COMMUNITY=${SNMP_COMMUNITY:-dilip-one}
HOST=${SNMP_HOST:-192.168.246.100}
MTA_COMMUNITY=${MTA_COMMUNITY:-private}
MTA_IP=${MTA_IP:-192.168.246.101}

# Export variables to ensure they are available to Python scripts
export SNMP_COMMUNITY="$COMMUNITY"
export SNMP_HOST="$HOST"
export MTA_COMMUNITY="$MTA_COMMUNITY"
export MTA_IP="$MTA_IP"

# Log the variables for debugging
echo "Starting with SNMP_COMMUNITY=$SNMP_COMMUNITY, SNMP_HOST=$SNMP_HOST, MTA_COMMUNITY=$MTA_COMMUNITY, MTA_IP=$MTA_IP"

# Start main.py in the background with only SNMP_COMMUNITY and SNMP_HOST
python main.py --community "$SNMP_COMMUNITY" --host "$SNMP_HOST" &

# Start the Flask app in the foreground with all four arguments
python app.py --community "$SNMP_COMMUNITY" --host "$SNMP_HOST" --mta-community "$MTA_COMMUNITY" --mta-ip "$MTA_IP"