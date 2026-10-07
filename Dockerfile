FROM python:3.10-slim

# Set timezone
ENV TZ=Asia/Kolkata

# Modem address and communities (override with -e / docker-compose)
ENV SNMP_HOST=192.168.100.1
ENV SNMP_COMMUNITY=public
ENV SNMP_WRITE_COMMUNITY=private

# Install dependencies, including iputils-ping for ping command
RUN apt-get update && apt-get install -y \
    tzdata \
    snmp \
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