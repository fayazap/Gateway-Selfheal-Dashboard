import json, os, sys

def get_config_path():
    base = os.path.dirname(sys.executable) if getattr(sys, 'frozen', False) \
           else os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base, 'config.json')

DEFAULTS = {
    "cm_ip": "192.168.246.100",
    "snmp_community": "dilip-one",
    "snmp_version": "2c",
    "snmp_port": 161,
    "mta_community": "dilip-one",
    "mta_ip": "192.168.246.100",
    "ssh_username": "root",
    "ssh_password": "tInNo551@Cm",
    "ssh_port": 22
}

def load_config():
    path = get_config_path()
    cfg = dict(DEFAULTS)
    if os.path.exists(path):
        with open(path) as f:
            cfg.update(json.load(f))
    return cfg

def save_config(cfg):
    with open(get_config_path(), 'w') as f:
        json.dump(cfg, f, indent=4)