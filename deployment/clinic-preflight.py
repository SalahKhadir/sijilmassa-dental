#!/usr/bin/env python3
"""Read-only checks for the clinic host and its private HTTPS endpoint."""

import argparse
import hashlib
import http.client
import ipaddress
import json
import os
from pathlib import Path
import re
import shutil
import socket
import ssl
import subprocess
import sys
from datetime import datetime, timezone
from uuid import UUID

HERE = Path(__file__).resolve().parent
CLINIC = str(HERE / "clinic.sh")
SERVICES = ("db", "backend", "frontend", "https")
STORAGE = {"db": ("db-data", "/var/lib/postgresql/data"),
           "https": ("tls-data", "/data")}
PRIVATE_NETWORKS = tuple(map(ipaddress.IPv4Network, ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16")))


class Checks:
    def __init__(self):
        self.failed = False

    def require(self, condition, label):
        self.failed |= not condition
        print(f"{'PASS' if condition else 'FAIL'} {label}")
        return condition

    @staticmethod
    def manual(label):
        print(f"MANUAL CHECK {label}")

    def result(self):
        return int(self.failed)


def command(*args, data=None, timeout=20):
    # Compose and TLS diagnostics can contain private paths, environment variables or session material.
    try:
        result = subprocess.run(args, input=data, stdin=subprocess.DEVNULL if data is None else None,
                                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=timeout, check=True)
        return result.stdout
    except (OSError, subprocess.SubprocessError):
        return None


def json_command(*args, data=None):
    output = command(*args, data=data)
    try:
        return json.loads(output) if output else None
    except (ValueError, UnicodeError):
        return None


def private_ip(value):
    try:
        address = ipaddress.IPv4Address(value)
        return any(address in network for network in PRIVATE_NETWORKS) or address == ipaddress.IPv4Address("127.0.0.1")
    except (ipaddress.AddressValueError, TypeError):
        return False


def positive(value):
    if not re.fullmatch(r"[1-9][0-9]{0,11}", value):
        raise argparse.ArgumentTypeError("Use a positive integer.")
    return int(value)


def tls_options(parser):
    parser.add_argument("--ca", type=Path, help="Public Caddy root certificate")
    parser.add_argument("--ca-sha256", help="SHA-256 fingerprint confirmed independently")
    parser.add_argument("--min-leaf-hours", type=positive, default=1)
    parser.add_argument("--min-ca-days", type=positive, default=30)


def verified_tls(checks, args, address, port, *, session=False):
    pin = (args.ca_sha256 or "").replace(":", "").lower()
    if not checks.require(args.ca is not None and bool(re.fullmatch(r"[0-9a-f]{64}", pin)),
                          "Public CA certificate and independently verified SHA-256 fingerprint supplied."):
        return
    try:
        if not args.ca.is_file() or args.ca.stat().st_size > 16384:
            raise ValueError()
        pem = args.ca.read_text(encoding="ascii").strip()
        if not re.fullmatch(r"-----BEGIN CERTIFICATE-----\r?\n[A-Za-z0-9+/=\r\n]+-----END CERTIFICATE-----", pem):
            raise ValueError()
        fingerprint = hashlib.sha256(ssl.PEM_cert_to_DER_cert(pem)).hexdigest()
    except (OSError, ValueError):
        checks.require(False, "CA file contains exactly one public PEM certificate.")
        return
    if not checks.require(fingerprint == pin, "Public CA fingerprint matches."):
        return
    certificate = pem.encode()
    ca_extensions = command("openssl", "x509", "-noout", "-ext", "basicConstraints", data=certificate)
    root_lifetime = command("openssl", "x509", "-noout", "-checkend", str(args.min_ca_days * 86400), data=certificate)
    if not checks.require(bool(ca_extensions and b"CA:TRUE" in ca_extensions and root_lifetime is not None),
                          f"CA certificate is valid beyond the next {args.min_ca_days} days."):
        return

    try:
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        context.load_verify_locations(cadata=pem)
        with socket.create_connection((address, port), timeout=8) as raw:
            with context.wrap_socket(raw, server_hostname=address) as peer:
                expires = peer.getpeercert()["notAfter"]
        lifetime = ssl.cert_time_to_seconds(expires) - datetime.now(timezone.utc).timestamp()
        checks.require(True, "HTTPS certificate chain and private IP match.")
        checks.require(lifetime >= args.min_leaf_hours * 3600,
                       f"Server certificate is valid for at least {args.min_leaf_hours} more hour(s).")
        connection = http.client.HTTPSConnection(address, port, context=context, timeout=8)
        try:
            connection.request("GET", "/login")
            response = connection.getresponse()
            checks.require(response.status == 200, "Login page responds through verified HTTPS.")
            response.read(1024 * 1024)
            if session:
                origin = f"https://{address}" + (f":{port}" if port != 443 else "")
                connection.close()
                connection.request("GET", "/api/v1/auth/csrf")
                response = connection.getresponse()
                cookies = [value for name, value in response.getheaders()
                           if name.lower() == "set-cookie" and value.startswith("JSESSIONID=")]
                response.read(8192)
                secure = any({"secure", "httponly", "samesite=strict"}.issubset(
                    {part.strip().lower() for part in cookie.split(";")[1:]}) for cookie in cookies)
                checks.require(response.status == 200 and secure, "Proxy sets Secure, HttpOnly and SameSite=Strict.")
                connection.close()
                if cookies:
                    connection.request("POST", "/api/v1/auth/login", body=b"{}",
                                       headers={"Origin": origin, "Content-Type": "application/json",
                                                "Cookie": cookies[0].split(";", 1)[0]})
                    checks.require(connection.getresponse().status == 403, "Mutation without CSRF token is rejected.")
                else:
                    checks.require(False, "Anonymous CSRF session available for the rejection probe.")
        finally:
            connection.close()
    except (OSError, ValueError, http.client.HTTPException, KeyError):
        checks.require(False, "Verified HTTPS connection and anonymous probes completed.")


def cookie_source():
    resources = HERE.parent / "backend/src/main/resources"
    base = (resources / "application.yml").read_text()
    prod = (resources / "application-prod.yml").read_text()
    return bool(re.search(r"^server:\n(?:(?: +[^\n]*|)\n)*?  servlet:\n"
                          r"    session:\n(?:      [^\n]+\n)*?      cookie:\n"
                          r"        http-only: true\n        same-site: strict\n        secure: true$", base, re.M)
                and re.search(r"^server:\n  servlet:\n    session:\n      cookie:\n        secure: true$", prod, re.M))


def practitioner(backend):
    environment = backend.get("environment", {})
    try:
        mount, = (item for item in backend.get("volumes", []) if item["target"] == "/run/clinic")
        path = Path(mount["source"]) / "practitioner.json"
        if not mount.get("read_only") or path.is_symlink() or not path.is_file() or path.stat().st_size > 16384:
            return False
        content = path.read_bytes()
        profile = json.loads(content)
        UUID(profile["dentistUserId"])
        template = HERE.parent / "frontend/public/pdf-templates/ordonnance-a5.pdf"
        return (profile["approved"] is True and profile["schemaVersion"] == 1
                and hashlib.sha256(content).hexdigest() == environment.get("PRESCRIPTION_PRACTITIONER_SHA256")
                and profile.get("templateSha256") == hashlib.sha256(template.read_bytes()).hexdigest()
                and environment.get("PRESCRIPTION_PRACTITIONER_FILE") == "/run/clinic/practitioner.json")
    except (OSError, ValueError, KeyError, TypeError):
        return False


def port_policy(services, address, port):
    return all(
        service.get("network_mode") in (None, "bridge")
        and not service.get("privileged")
        and (not service.get("ports") if name != "https" else
             len(service.get("ports", [])) == 1
             and service["ports"][0].get("host_ip") == address
             and str(service["ports"][0].get("published")) == str(port)
             and service["ports"][0].get("target") == 443
             and service["ports"][0].get("protocol", "tcp") == "tcp")
        for name, service in services.items()
    )


def port_available(address, port):
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
            listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            listener.bind((address, port))
        return True
    except PermissionError:
        # An unprivileged operator may use a rootful engine that can bind port 443.
        return None
    except OSError:
        return False


def published_ports():
    running = command("docker", "ps", "-q")
    if running is None:
        raise OSError()
    ids = running.decode().split()
    if not ids:
        return []
    mappings = command("docker", "inspect", "--format", "{{json .HostConfig.PortBindings}}", *ids)
    if mappings is None:
        raise OSError()
    return [binding for line in mappings.splitlines() for bindings in (json.loads(line) or {}).values()
            for binding in bindings or []]


def loopback(address):
    try:
        parsed = ipaddress.ip_address(address)
        mapped = getattr(parsed, "ipv4_mapped", None)
        return (mapped or parsed).is_loopback
    except ValueError:
        return False


def listening_addresses(port_filter):
    output = command("ss", "-H", "-ltn", port_filter)
    if output is None:
        raise OSError()
    return [line.split()[3].rsplit(":", 1)[0].strip("[]") for line in output.decode().splitlines()]


def internal_ports_closed(published):
    forbidden = {"5432", "8080"}
    if any(item["HostPort"] in forbidden and not loopback(item["HostIp"]) for item in published):
        return False
    return all(loopback(host) for host in listening_addresses("( sport = :5432 or sport = :8080 )"))


def check_host_port(checks, address, port, published):
    assigned = json_command("ip", "-j", "-4", "address", "show") or []
    local = any(item.get("local") == address for link in assigned for item in link.get("addr_info", []))
    addresses = {"", "*", address, "::ffff:" + address, "0.0.0.0", "::"}
    conflicts = any(item["HostPort"] == str(port) and item["HostIp"] in addresses for item in published)
    conflicts |= any(host in addresses for host in listening_addresses(f"sport = :{port}"))
    bindable = port_available(address, port) if local and not conflicts else False
    checks.require(local and not conflicts and bindable is not False,
                   "HTTPS bind address is assigned and the host TCP port is available.")
    if bindable is None:
        checks.manual("The operator cannot probe a privileged bind. Confirm HTTPS publication at startup.")


def check_storage(checks, services, config, minimum, running):
    volume_targets = [(service, name, path) for service, (name, path) in STORAGE.items()]
    volume_targets.append(("https", "tls-config", "/config"))
    for service, name, path in volume_targets:
        definition = config.get("volumes", {}).get(name, {})
        mounted = any(item.get("type") == "volume" and item.get("source") == name and item.get("target") == path
                      and not item.get("read_only") for item in services[service].get("volumes", []))
        if not checks.require(mounted and bool(definition.get("name")), f"Writable persistent volume configured for {name}."):
            continue
        exists = command("docker", "volume", "inspect", "--format", "{{.Name}}", definition["name"]) is not None
        if running or definition.get("external"):
            checks.require(exists, f"Persistent volume {name} exists.")
        elif not exists:
            checks.manual(f"Volume {name} will be created by the first controlled startup.")
        else:
            checks.require(True, f"Persistent volume {name} exists.")
        if running:
            user = ("--user", "postgres") if service == "db" else ()
            available = command(CLINIC, "exec", "-T", *user, service, "sh", "-c",
                                'test -w "$1" && df -Pk "$1" | awk \'END {print $4}\'', "sh", path)
            checks.require(bool(available and available.strip().isdigit() and int(available) >= minimum),
                           f"Volume {name} is writable with at least {minimum} KiB free.")


def running_services(checks, services, volumes, address, port):
    for name in SERVICES:
        container = command(CLINIC, "ps", "-q", name)
        ids = container.decode().split() if container else []
        if not checks.require(len(ids) == 1, f"One running container for {name}."):
            continue
        observed = json_command("docker", "inspect", "--format",
                                '{"ports":{{json .HostConfig.PortBindings}},"mode":{{json .HostConfig.NetworkMode}},'
                                '"health":{{json .State.Health.Status}},"image":{{json .Image}},'
                                '"mounts":{{json .Mounts}}}', ids[0])
        ports = {key: value for key, value in ((observed or {}).get("ports") or {}).items() if value}
        expected = {"443/tcp": [{"HostIp": address, "HostPort": str(port)}]} if name == "https" else {}
        checks.require(bool(observed and ports == expected and observed["mode"] != "host"),
                       f"Live port exposure for {name} matches the private LAN policy.")
        checks.require(bool(observed and observed["health"] == "healthy"), f"Health probe for {name}.")
        local_image = command("docker", "image", "inspect", "--format", "{{.Id}}", services[name]["image"])
        checks.require(bool(observed and local_image and
                            observed["image"].removeprefix("sha256:") == local_image.decode().strip().removeprefix("sha256:")),
                       f"Running {name} uses the configured release image.")
        for mount in services[name].get("volumes", []):
            if mount.get("type") == "volume":
                actual = ((observed or {}).get("mounts") or [])
                checks.require(any(item.get("Name") == volumes.get(mount["source"], {}).get("name")
                                   and item.get("Destination") == mount["target"] and item.get("RW") is True
                                   for item in actual), f"Running {name} uses the expected volume for {mount['source']}.")
    mounted_profile = command(CLINIC, "exec", "-T", "backend", "sha256sum", "/run/clinic/practitioner.json")
    expected_profile = services["backend"].get("environment", {}).get("PRESCRIPTION_PRACTITIONER_SHA256", "")
    checks.require(bool(mounted_profile and mounted_profile.decode().split()[0] == expected_profile),
                   "Running backend can read the pinned practitioner profile.")
    key_check = """
        cd /data/caddy/pki/authorities/local || exit 1
        for file in root.crt intermediate.crt root.key intermediate.key; do
            test -f "$file" && test -r "$file" && test -s "$file" && test ! -L "$file" || exit 1
        done
        for key in root.key intermediate.key; do
            case "$(stat -c %a "$key")" in 400|600) ;; *) exit 1;; esac
        done
    """
    checks.require(command(CLINIC, "exec", "-T", "https", "sh", "-c", key_check) is not None,
                   "Caddy CA certificates and private keys exist with restricted key permissions.")


def caddy_policy(checks, gateway, address):
    caddy_args = ("docker", "run", "--rm", "--pull=never", "--network", "none", "--read-only",
                  "--tmpfs", "/data", "--tmpfs", "/config", "-e", f"CLINIC_LAN_IP={address}")
    adapt = ("caddy", "adapt", "--adapter", "caddyfile", "--config")
    image = json_command(*caddy_args, gateway, *adapt, "/etc/caddy/Caddyfile")
    source = json_command(*caddy_args, "-i", gateway, *adapt, "-", data=(HERE / "Caddyfile").read_bytes())
    apps = (image or {}).get("apps", {})
    policies = apps.get("tls", {}).get("automation", {}).get("policies", [])
    https = any(":443" in server.get("listen", []) and server.get("tls_connection_policies")
                for server in apps.get("http", {}).get("servers", {}).values())
    private = any(policy.get("subjects") == [address] and policy.get("issuers") == [{"module": "internal"}]
                  for policy in policies)
    checks.require(bool(https and private and image == source), "Caddy source and image agree on private CA HTTPS.")
    checks.require(command(*caddy_args, gateway, "caddy", "validate", "--adapter", "caddyfile", "--config",
                           "/etc/caddy/Caddyfile") is not None, "Caddy configuration validates in an isolated container.")


def installation(args, checks):
    dependencies = ("docker", "openssl", "gpg", "findmnt", "flock", "df", "sha256sum", "date", "awk", "realpath", "stat",
                    "ip", "ss")
    tools_ready = checks.require(all(shutil.which(tool) for tool in dependencies),
                                 "Docker, OpenSSL, GnuPG, util-linux and host utilities available.")
    env_path = Path(os.environ.get("CLINIC_ENV_FILE", ""))
    config_ready = checks.require(env_path.is_absolute() and env_path.is_file() and os.access(env_path, os.R_OK),
                                  "CLINIC_ENV_FILE points to a readable absolute configuration file.")
    endpoint = os.environ.get("DOCKER_HOST") or (
        command("docker", "context", "inspect", "--format", "{{.Endpoints.docker.Host}}") or b"").decode().strip()
    engine_root = command("docker", "info", "--format", "{{.DockerRootDir}}") if endpoint.startswith("unix://") else None
    engine_ready = tools_ready and checks.require(command("docker", "compose", "version") is not None
                                                  and bool(engine_root),
                                                  "Compose and the local container engine are accessible.")
    checks.require(args.ack_recovery, "Operator acknowledged the recovery runbook and off-host key custody.")
    if tools_ready:
        checks.require(command(str(HERE / "scheduled-backup.sh"), "--check-storage") is not None,
                       "Backup destination, mount, disk policy and usable GPG recipient.")
    if not (engine_ready and config_ready):
        return
    config = json_command(CLINIC, "config", "--no-env-resolution", "--format", "json")
    if not checks.require(bool(config and set(config.get("services", {})) == set(SERVICES)),
                          "Required clinic settings, private secrets and four Compose services."):
        return
    services = config["services"]
    address = services["https"].get("environment", {}).get("CLINIC_LAN_IP")
    mappings = services["https"].get("ports", [])
    port = str(mappings[0].get("published", "")) if len(mappings) == 1 else ""
    if not checks.require(private_ip(address) and port.isdecimal() and 1 <= int(port) <= 65535,
                          "Configured endpoint is a private IPv4 address and valid TCP port."):
        return
    port = int(port)
    checks.require(port_policy(services, address, port), "Only Caddy publishes the configured private HTTPS port.")
    published = published_ports()
    checks.require(port not in (5432, 8080) and internal_ports_closed(published),
                   "Host and engine have no non-loopback listeners or publications on TCP 5432 or 8080.")
    networks = config.get("networks", {})
    expected_networks = {"db": {"data"}, "backend": {"data", "api"}, "frontend": {"api", "web"}, "https": {"web", "entry"}}
    checks.require(all(networks.get(name, {}).get("internal") is True for name in ("data", "api", "web"))
                   and all(set(services[name].get("networks", {})) == expected_networks[name] for name in SERVICES),
                   "Private data, API and web network separation.")
    if address == "127.0.0.1":
        checks.manual("Loopback is suitable for a drill. A physical LAN installation requires the reserved clinic IP.")
    if not args.running:
        check_host_port(checks, address, port, published)
    environment = services["backend"].get("environment", {})
    checks.require(cookie_source() and environment.get("SPRING_PROFILES_ACTIVE") == "prod"
                   and not any(key.startswith(("SERVER_SERVLET_SESSION_", "SPRING_CONFIG_")) or key in
                               ("SPRING_APPLICATION_JSON", "JAVA_TOOL_OPTIONS", "JDK_JAVA_OPTIONS")
                               for key in environment),
                   "Production cookie policy requires Secure, HttpOnly and SameSite=Strict.")
    checks.require(practitioner(services["backend"]), "Approved practitioner profile exists and matches its SHA-256 pin.")
    images = all(service.get("image") and command("docker", "image", "inspect", "--format", "{{.Id}}",
                                                service["image"]) is not None for service in services.values())
    checks.require(images, "All four release images are available locally.")
    if images:
        caddy_policy(checks, services["https"]["image"], address)

    try:
        root = Path(engine_root.decode().strip())
        free = shutil.disk_usage(root).free
        checks.require(free // 1024 >= args.min_data_free_kib, "Container storage meets the free-space policy.")
    except (OSError, AttributeError):
        checks.manual("Check free space on the container engine data filesystem as its administrator.")
    check_storage(checks, services, config, args.min_data_free_kib, args.running)
    if args.running:
        running_services(checks, services, config.get("volumes", {}), address, port)
        verified_tls(checks, args, address, port, session=True)
    else:
        checks.manual("After startup, verify persisted Caddy keys, HTTPS, live port bindings and volume access.")
    checks.manual("Complete the two-PC firewall, browser, recovery and A5 print acceptance sheet.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_subparsers(dest="mode", required=True)
    install = modes.add_parser("install", help="Check clinic configuration and host readiness")
    install.add_argument("--running", action="store_true", help="Check a running stack with anonymous HTTPS probes")
    install.add_argument("--ack-recovery", action="store_true", help="Confirm recovery instructions and key custody")
    install.add_argument("--min-data-free-kib", type=positive, default=2097152)
    tls_options(install)
    tls = modes.add_parser("tls", help="Verify private HTTPS without touching the system trust store")
    tls.add_argument("address")
    tls.add_argument("port", type=positive)
    tls_options(tls)
    args = parser.parse_args()
    checks = Checks()
    try:
        if args.mode == "install":
            installation(args, checks)
        elif checks.require(private_ip(args.address) and args.port <= 65535, "Private IPv4 HTTPS endpoint."):
            verified_tls(checks, args, args.address, args.port)
    except (OSError, ValueError, KeyError, TypeError):
        checks.require(False, "Preflight could not read the required configuration or host state.")
    return checks.result()


if __name__ == "__main__":
    sys.exit(main())
