FROM python:3.10-slim

# Set timezone
ENV TZ=Asia/Kolkata

# Set default environment variables for SNMP
ENV SNMP_COMMUNITY=public
ENV SNMP_HOST=192.168.246.72
ENV MTA_COMMUNITY=private
ENV MTA_IP=192.168.246.73

# Install dependencies, including iputils-ping for ping command
RUN apt-get update && apt-get install -y \
    tzdata \
    snmp \
    snmpd \
    iputils-ping \
    gcc \
    libffi-dev \
    libssl-dev \
    && apt-get clean \
    && ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

WORKDIR /app

# Copy application files
COPY . .

# Install Python dependencies
# paramiko is pinned to 4.0.0: paramiko 5.x removed support for the "ssh-rsa"
# host-key type entirely, which is the only host-key type this modem's old
# Dropbear (2019) SSH server offers - anything newer can never connect to it.
RUN pip install --no-cache-dir flask "paramiko==4.0.0"

# Make start.sh executable
RUN chmod +x start.sh

# Expose Flask port
EXPOSE 5050

# Run start.sh
CMD ["./start.sh"]