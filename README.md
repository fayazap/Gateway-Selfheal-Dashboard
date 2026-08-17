# Selfheal Dashboard

This repository contains the Selfheal Dashboard application.

## Prerequisites
- [Docker](https://docs.docker.com/get-docker/) installed on your system.

## Build the Image
Navigate to the repository folder where the `Dockerfile` is located and open a terminal. Execute the following command to build the Docker image:

```bash
docker build -t selfheal-dashboard .
```

## Run the Container
Run the Docker image by providing the necessary environment variables for your SNMP and MTA properties:

```bash
docker run -p 5050:5050 -e SNMP_COMMUNITY=<CM_community_string> -e SNMP_HOST=<CM_IP_Address> -e MTA_COMMUNITY=<MTA_community_string> -e MTA_IP=<MTA_IP_Address> selfheal-dashboard
```

**Example:**
```bash
docker run -p 5050:5050 -e SNMP_COMMUNITY=public -e SNMP_HOST=192.168.246.35 -e MTA_COMMUNITY=private -e MTA_IP=192.168.246.101 selfheal-dashboard
```

## Access the Dashboard
Once the container is running smoothly, browse to [http://127.0.0.1:5050/](http://127.0.0.1:5050/) in your web browser to see the dashboard.
 