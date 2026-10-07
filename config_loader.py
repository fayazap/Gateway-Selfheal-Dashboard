import json, os, sys

def get_config_path():
    base = os.path.dirname(sys.executable) if getattr(sys, 'frozen', False) \
           else os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base, 'config.json')

DEFAULTS = {
    "cm_ip": "192.168.100.1",
    "snmp_community": "public",
    "snmp_write_community": "private",
    "snmp_version": "2c",
    "snmp_port": 161,
    # ifIndex of the CATV MAC interface = the instance of every tinnoCfgEntry
    # object (tinnoSelfhealEnable.2, ...).
    "snmp_instance": 2,
    "ssh_username": "root",
    "ssh_password": "",
    "ssh_port": 22
}

# Environment variables (Docker / docker-compose) override config.json.
ENV_OVERRIDES = {
    "SNMP_HOST": "cm_ip",
    "SNMP_COMMUNITY": "snmp_community",
    "SNMP_WRITE_COMMUNITY": "snmp_write_community",
    "SSH_USERNAME": "ssh_username",
    "SSH_PASSWORD": "ssh_password",
    "SSH_PORT": "ssh_port",
}

def load_config():
    path = get_config_path()
    cfg = dict(DEFAULTS)
    if os.path.exists(path):
        with open(path) as f:
            cfg.update(json.load(f))
    for env, key in ENV_OVERRIDES.items():
        if os.environ.get(env):
            cfg[key] = os.environ[env]
    return cfg

def save_config(cfg):
    with open(get_config_path(), 'w') as f:
        json.dump(cfg, f, indent=4)
