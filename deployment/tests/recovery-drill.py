#!/usr/bin/env python3
"""Disposable, synthetic Compose and backup/restore drill. Uses prebuilt release images."""
import fcntl
import hashlib
import http.cookiejar
import json
import os
from pathlib import Path
import pty
import re
import secrets
import shutil
import select
import socket
import ssl
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

HERE = Path(__file__).resolve().parents[1]
RELEASE = sys.argv[1] if len(sys.argv) == 2 else "91a-drill"
if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}", RELEASE):
    raise SystemExit("Provide one prebuilt release tag.")
if not os.environ.get("DOCKER_HOST"):
    raise SystemExit("Set DOCKER_HOST explicitly to the engine dedicated to the disposable drill.")
BASE_ENV = {k: v for k, v in os.environ.items() if not k.startswith(("CLINIC_", "COMPOSE_", "BACKUP_", "PG"))}


def run(*args, env=BASE_ENV, data=None, check=True):
    result = subprocess.run(args, env=env, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=240)
    if check and result.returncode:
        # This launcher uses generated synthetic values only, but command output is still private.
        raise AssertionError(f"{args[0]} {args[1]} failed ({result.returncode}): "
                             + result.stderr.decode(errors="replace")[-1200:])
    return result


def compose(env, *args, check=True):
    return run(str(HERE / "clinic.sh"), *args, env=env, check=check)


def port():
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return listener.getsockname()[1]


def bootstrap(project, secret_file, dentist, receptionist):
    args = ["docker", "run", "--rm", "--interactive", "--tty", "--network", project + "_data",
            "--env-file", str(secret_file), "-e", f"CLINIC_RELEASE={RELEASE}",
            "-e", "DB_URL=jdbc:postgresql://db:5432/sijilmassa", "-e", "DB_USERNAME=clinic_app",
            f"localhost/sijilmassa-backend:{RELEASE}", "--spring.profiles.active=prod,bootstrap"]
    master, slave = pty.openpty()
    child = subprocess.Popen(args, env=BASE_ENV, stdin=slave, stdout=slave, stderr=slave)
    os.close(slave)
    try:
        prompts = [
            ("Identifiant dentiste", dentist["identifier"]),
            ("Mot de passe dentiste", dentist["password"]),
            ("Confirmer le mot de passe", dentist["password"]),
            ("Identifiant réception", receptionist["identifier"]),
            ("Mot de passe réception", receptionist["password"]),
            ("Confirmer le mot de passe", receptionist["password"]),
        ]
        buffer = b""
        for prompt, reply in prompts:
            expected = prompt.encode()
            end = time.monotonic() + 80
            while expected not in buffer:
                if time.monotonic() >= end or child.poll() is not None:
                    raise AssertionError(f"Bootstrap did not show {prompt}")
                if select.select([master], [], [], 1)[0]:
                    buffer += os.read(master, 8192)
            buffer = buffer.split(expected, 1)[1]
            os.write(master, reply.encode() + b"\n")
        assert child.wait(timeout=30) == 0, "Bootstrap failed"
    finally:
        if child.poll() is None:
            child.kill()
            child.wait()
        os.close(master)


class Client:
    def __init__(self, https_port, ca):
        self.origin = f"https://127.0.0.1:{https_port}"
        self.cookies = http.cookiejar.CookieJar()
        context = ssl.create_default_context(cafile=str(ca))
        self.open = urllib.request.build_opener(urllib.request.ProxyHandler({}),
                                               urllib.request.HTTPSHandler(context=context),
                                               urllib.request.HTTPCookieProcessor(self.cookies))

    def request(self, method, route, status, data=None, csrf=False, origin=None):
        headers = {}
        if data is not None:
            headers["Content-Type"] = "application/json"
            data = json.dumps(data).encode()
        if method != "GET":
            headers["Origin"] = origin or self.origin
        if csrf:
            token = self.json("GET", "/api/v1/auth/csrf", 200)
            headers[token["headerName"]] = token["token"]
        req = urllib.request.Request(self.origin + route, data=data, headers=headers, method=method)
        try:
            response = self.open.open(req, timeout=35)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            body = response.read()
            if response.status != status:
                problem = json.loads(body).get("code") if response.headers.get_content_type() == "application/problem+json" else None
                raise AssertionError(f"{method} {route.split('?')[0]} expected {status}, got {response.status} ({problem})")
            return body, response.headers

    def json(self, *args, **kwargs):
        return json.loads(self.request(*args, **kwargs)[0])

    def login(self, credentials):
        _, headers = self.request("POST", "/api/v1/auth/login", 200, credentials, csrf=True)
        cookies = headers.get_all("Set-Cookie", [])
        assert any(all(flag in cookie.lower() for flag in ("jsessionid=", "secure", "httponly", "samesite=strict"))
                   for cookie in cookies)
        return self.json("GET", "/api/v1/auth/me", 200)

    def pdf(self, path):
        body, headers = self.request("GET", path, 200)
        assert body.startswith(b"%PDF-") and headers["Content-Type"] == "application/pdf"
        assert "no-store" in headers["Cache-Control"]
        return body


def ca_for(env, path):
    pem = compose(env, "exec", "-T", "https", "cat", "/data/caddy/pki/authorities/local/root.crt").stdout
    assert b"BEGIN CERTIFICATE" in pem and b"PRIVATE KEY" not in pem
    path.write_bytes(pem)
    return path


def check_failed_dump(env, backup, destination):
    # Make pg_dump hit its real lock timeout without touching any non-drill database.
    sql = [str(HERE / "clinic.sh"), "exec", "-T", "--user", "postgres", "db",
           "psql", "-XqAt", "--no-password", "--set=ON_ERROR_STOP=1",
           "--host=/var/run/postgresql", "--username=postgres", "--dbname=sijilmassa"]
    with subprocess.Popen(sql, env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL) as lock:
        try:
            lock.stdin.write(b"BEGIN; LOCK TABLE public.patient IN ACCESS EXCLUSIVE MODE; SELECT 'locked';\n")
            lock.stdin.flush()
            assert select.select([lock.stdout], [], [], 20)[0] and lock.stdout.readline() == b"locked\n"
            failed = run(backup, str(destination), env=env, check=False)
            assert failed.returncode and b"Backup failed during PostgreSQL export or encryption" in failed.stderr
        finally:
            lock.stdin.close()  # psql exits and the uncommitted lock is released
            try:
                lock.wait(timeout=10)
            except subprocess.TimeoutExpired:
                lock.kill()
                lock.wait()


def check_network(env, project, client, ca):
    for service in ("db", "backend", "frontend"):
        container = compose(env, "ps", "-q", service).stdout.decode().strip()
        inspection = json.loads(run("docker", "inspect", container).stdout)[0]
        assert not any((inspection["HostConfig"]["PortBindings"] or {}).values()), f"{service} publishes a port"
    session = next(cookie for cookie in client.cookies if cookie.name == "JSESSIONID")
    script = """
const fs = require("node:fs");
const https = require("node:https");
const tls = require("node:tls");
const dns = require("node:dns/promises");
(async () => {
    for (const host of ["db", "backend", "frontend"]) {
        if (await dns.lookup(host).then(() => true, () => false)) process.exit(1);
    }
    const { session, ca } = JSON.parse(fs.readFileSync(0, "utf8"));
    const headers = { host: "127.0.0.1", cookie: "JSESSIONID=" + session };
    https.get({ hostname: "https", servername: "", path: "/api/v1/auth/me", headers,
      ca, checkServerIdentity: (_, cert) => tls.checkServerIdentity("127.0.0.1", cert) }, res => {
        let body = ""; res.on("data", chunk => body += chunk);
        res.on("end", () => { if (res.statusCode !== 200 || JSON.parse(body).role !== "RECEPTIONIST") process.exit(1); });
    }).on("error", () => process.exit(1));
})().catch(() => process.exit(1));
"""
    run("docker", "run", "--rm", "-i", "--network", project + "_entry",
        "docker.io/library/node:24.20.0-bookworm-slim", "node", "-e", script,
        data=json.dumps({"session": session.value, "ca": ca.read_text()}).encode())


def fixture(dentist, receptionist):
    day = datetime.now(ZoneInfo("Africa/Casablanca")).date().isoformat()
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    identity = dict(firstName="Patient", lastName="Synthétique Récupération", sex="unanswered", dateOfBirth=None,
                    address="", gsm="", landline="", profession="", cin="", medicalCoverage="")
    patient = receptionist.json("POST", "/api/v1/patients", 201, dict(identity=identity, status="active"), csrf=True)
    pid = patient["id"]
    scope = f"?patientId={pid}"
    consultation = dentist.json("POST", "/api/v1/consultations", 201, dict(patientId=pid, content=dict(
        appointmentId=None, consultationDate=day, chiefComplaint="Contrôle synthétique", clinicalObservations="",
        assessment="", treatmentPlan="", notes="SYNTHETIC-DRILL-PRIVATE")), csrf=True)
    cid = consultation["id"]
    consultation_path = f"/api/v1/consultations/{cid}"
    clinical = dentist.json("POST", consultation_path + "/treatments" + scope, 200, dict(
        version=consultation["version"], content=dict(treatmentDate=day, description="Soin synthétique",
        toothReference="16 / 17", notes="SYNTHETIC-DRILL-PRIVATE")), csrf=True)
    charge = dentist.json("POST", "/api/v1/financial/charges", 201, dict(patientId=pid, consultationId=cid,
        treatmentId=clinical["treatments"][0]["id"], expectedConsultationVersion=clinical["version"], priceMinor=12345), csrf=True)
    charge_path = "/api/v1/financial/charges/" + charge["chargeId"]
    payment_path = charge_path + "/payments" + scope
    receptionist.json("POST", payment_path, 200, dict(expectedChargeVersion=0, amountMinor=2345,
        paidAt=now, method="ESPECES", operationId=str(uuid.uuid4())), csrf=True)
    draft = receptionist.json("POST", "/api/v1/invoices", 201, dict(patientId=pid, chargeIds=[charge["chargeId"]]), csrf=True)
    invoice_path = "/api/v1/invoices/" + draft["invoiceId"]
    invoice = receptionist.json("POST", invoice_path + "/issue" + scope, 200, dict(expectedVersion=0), csrf=True)
    assert invoice["issuanceSnapshot"]["lines"][0]["toothReference"] == "16 / 17"
    assert invoice["issuanceSnapshot"]["balanceAtIssue"] == {"totalMinor": "12345", "receivedMinor": "2345", "remainingMinor": "10000"}
    rx = dentist.json("POST", "/api/v1/prescriptions", 201, dict(patientId=pid, content=dict(
        consultationId=cid, issuedDate=day, medications=[dict(medicationName="Médicament fictif",
        dosage="1 comprimé", frequency="matin", duration="2 jours", instructions="")],
        generalInstructions="Contrôle synthétique")), csrf=True)
    rx_path = "/api/v1/prescriptions/" + rx["id"]
    finalized = dentist.json("PUT", rx_path + "/finalization" + scope, 200,
                             dict(version=rx["version"], patientVersion=patient["version"]), csrf=True)
    paths = [
        ("reception", f"/api/v1/patients/{pid}"),
        ("dentist", consultation_path + scope),
        ("reception", charge_path + scope),
        ("reception", payment_path),
        ("reception", invoice_path + scope),
        ("dentist", rx_path + scope),
    ]
    pdfs = [("reception", invoice_path + "/pdf" + scope),
            ("dentist", rx_path + "/pdf" + scope + f"&version={finalized['version']}&disposition=attachment"),
            ("dentist", f"/api/v1/patients/{pid}/dossier.pdf")]
    return paths, pdfs


def check_preflight(tmp, env, port_number, secret_files):
    preflight = (sys.executable, str(HERE / "clinic-preflight.py"), "install", "--ack-recovery", "--min-data-free-kib", "1")

    def rejected(expected, *, args=preflight, environment=env):
        result = run(*args, env=environment, check=False)
        assert result.returncode == 1 and expected in result.stdout, result.stdout.decode()
        assert not result.stderr
        for file in secret_files:
            assert file.read_bytes().split(b"=", 1)[1].strip() not in result.stdout

    containers = run("docker", "ps", "-aq").stdout
    volumes = run("docker", "volume", "ls", "-q").stdout
    for _ in range(2):
        result = run(*preflight, env=env)
        assert b"MANUAL CHECK" in result.stdout and b"FAIL" not in result.stdout
        assert not result.stderr
        for file in secret_files:
            assert file.read_bytes().split(b"=", 1)[1].strip() not in result.stdout
    rejected(b"FAIL CLINIC_ENV_FILE", environment={**env, "CLINIC_ENV_FILE": str(tmp / "missing")})
    rejected(b"FAIL Required clinic settings", environment={**env, "CLINIC_DB_PASSWORD_FILE": str(tmp / "missing")})
    rejected(b"FAIL Required clinic settings", environment={**env, "CLINIC_LAN_IP": "0.0.0.0"})
    rejected(b"FAIL Backup destination", environment={**env, "BACKUP_DESTINATION": str(tmp / "missing")})
    rejected(b"FAIL Backup destination", environment={**env, "BACKUP_MIN_FREE_KIB": "999999999999"})
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        listener.bind(("127.0.0.1", port_number))
        listener.listen()
        rejected(b"FAIL HTTPS bind address")

    fixture_root = tmp / "preflight-fixture"
    staged = fixture_root / "deployment"
    shutil.copytree(HERE, staged, ignore=shutil.ignore_patterns("__pycache__", "tests"))
    (fixture_root / "backend").symlink_to(HERE.parent / "backend", target_is_directory=True)
    (fixture_root / "frontend").symlink_to(HERE.parent / "frontend", target_is_directory=True)
    modified = (sys.executable, str(staged / "clinic-preflight.py"), *preflight[2:])
    compose_file = staged / "compose.yml"
    original = compose_file.read_text()
    compose_file.write_text(original.replace("    networks: [data]",
                                             '    ports: ["0.0.0.0:5432:5432"]\n    networks: [data]', 1))
    rejected(b"FAIL Only Caddy publishes", args=modified)
    compose_file.write_text(original)
    (staged / "Caddyfile").write_text("invalid_caddy_directive\n")
    rejected(b"FAIL Caddy source and image", args=modified)
    assert run("docker", "ps", "-aq").stdout == containers
    assert run("docker", "volume", "ls", "-q").stdout == volumes
    assert not any(Path(env["BACKUP_DESTINATION"]).iterdir())
    print("OK repeatable non-destructive preflight, private settings, port conflicts, exposure, disk, destination and Caddy failures", flush=True)


def check_backup_monitor(tmp, bundle, env):
    verifier = str(HERE / "verify-backup.sh")
    valid = run(verifier, str(bundle.parent), env=env)
    assert b"Manifest, checksum and OpenPGP envelope verified" in valid.stdout
    rejected = run(verifier, str(tmp / "missing"), env=env, check=False)
    assert rejected.returncode == 1
    sample = tmp / "monitor"
    sample.mkdir()
    copy = sample / bundle.name
    shutil.copytree(bundle, copy)
    manifest = copy / "manifest"
    original = manifest.read_text()
    archive = copy / "database.dump.gpg"
    original_archive = archive.read_bytes()
    manifest.write_text(original + "format=1\n")
    malformed = run(verifier, str(sample), env=env, check=False)
    assert malformed.returncode == 1 and b"Invalid backup manifest" in malformed.stderr
    manifest.write_text(original)
    archive.write_bytes(b"synthetic-private-archive-content")
    corrupted = run(verifier, str(sample), env=env, check=False)
    assert corrupted.returncode == 1 and b"checksum mismatch" in corrupted.stderr
    assert archive.read_bytes() not in corrupted.stderr + corrupted.stdout
    manifest.write_text(re.sub(r"(?m)^archive_sha256=.*$", "archive_sha256=" + hashlib.sha256(archive.read_bytes()).hexdigest(), original))
    wrong_format = run(verifier, str(sample), env=env, check=False)
    assert wrong_format.returncode == 1 and b"OpenPGP" in wrong_format.stderr
    assert archive.read_bytes() not in wrong_format.stderr + wrong_format.stdout
    archive.write_bytes(original_archive)
    old = (datetime.now(timezone.utc) - timedelta(days=2)).strftime("%Y%m%dT%H%M%SZ")
    manifest.write_text(re.sub(r"(?m)^created_utc=.*$", "created_utc=" + old, original))
    copy.rename(sample / f"clinic-backup-{old}-Stale001")
    stale = run(verifier, str(sample), env=env, check=False)
    assert stale.returncode == 2 and b"freshness policy" in stale.stderr
    print("OK encrypted backup monitor, invalid manifest, bad checksum, non-encrypted archive, stale warning and redacted output", flush=True)


def main():
    for image in (f"localhost/sijilmassa-backend:{RELEASE}", f"localhost/sijilmassa-frontend:{RELEASE}",
                  f"localhost/sijilmassa-postgres:{RELEASE}", f"localhost/sijilmassa-https:{RELEASE}"):
        run("docker", "image", "inspect", image)
    with tempfile.TemporaryDirectory(prefix="sijilmassa-drill-") as directory:
        tmp = Path(directory)
        nonce = secrets.token_hex(5)
        original = "sijilmassa-drill-" + nonce
        recovered = original + "-restored"
        target = "clinic-recovery-" + nonce
        clinic_dir = tmp / "private"
        clinic_dir.mkdir(mode=0o755)
        app_file, admin_file = tmp / "app.env", tmp / "pg.env"
        app_file.write_text("DB_PASSWORD=" + secrets.token_hex(32) + "\n")
        admin_file.write_text("POSTGRES_PASSWORD=" + secrets.token_hex(32) + "\n")
        for file in (app_file, admin_file):
            file.chmod(0o600)

        def config(name, https_port):
            path = tmp / (name + ".env")
            path.write_text(f"CLINIC_PROJECT={name}\nCLINIC_RELEASE={RELEASE}\nCLINIC_LAN_IP=127.0.0.1\n"
                            f"CLINIC_HTTPS_PORT={https_port}\nCLINIC_DB_PASSWORD_FILE={app_file}\n"
                            f"CLINIC_PG_ADMIN_FILE={admin_file}\nCLINIC_PRIVATE_CONFIG_DIR={clinic_dir}\n")
            return path, {**BASE_ENV, "CLINIC_ENV_FILE": str(path)}

        src_port, dest_port = port(), port()
        src_file, src = config(original, src_port)
        dest_file, dest = config(recovered, dest_port)
        compose(src, "config", "--quiet")
        assert compose({**src, "CLINIC_DB_PASSWORD_FILE": str(tmp / "missing")}, "config", "--quiet", check=False).returncode
        assert compose({**src, "CLINIC_LAN_IP": "0.0.0.0"}, "config", "--quiet", check=False).returncode
        print("OK compose configuration, missing credentials and wildcard binding refused", flush=True)
        d = {"identifier": "drill.dentist", "password": secrets.token_hex(15)}
        r = {"identifier": "drill.reception", "password": secrets.token_hex(15)}
        dentist, reception = "dentist", "reception"
        target_created = False
        override = tmp / "restore-volume.yml"
        try:
            gpg_home = tmp / "gpg"
            public_home = tmp / "gpg-public"
            gpg_home.mkdir(mode=0o700)
            public_home.mkdir(mode=0o700)
            recovery_env = {**src, "GNUPGHOME": str(gpg_home),
                            "CLINIC_DB_PASSWORD_FILE": str(app_file), "CLINIC_PG_ADMIN_FILE": str(admin_file)}
            enc = {**src, "GNUPGHOME": str(public_home), "BACKUP_MIN_FREE_KIB": "1"}
            run("gpg", "--batch", "--passphrase", "", "--quick-generate-key",
                "Synthetic Drill", "default", "default", "1d", env=recovery_env)
            keys = run("gpg", "--batch", "--with-colons", "--list-keys", env=recovery_env).stdout.decode()
            fingerprint = next(line.split(":")[9] for line in keys.splitlines() if line.startswith("fpr:"))
            public_key = run("gpg", "--batch", "--export", fingerprint, env=recovery_env).stdout
            run("gpg", "--batch", "--import", env=enc, data=public_key)
            enc["BACKUP_RECIPIENT"] = fingerprint
            backup_dir = tmp / "backups"
            backup_dir.mkdir(mode=0o700)
            profile = dict(schemaVersion=1, profileId="synthetic-drill", revision="1", dentistUserId=str(uuid.uuid4()),
                approved=True, templateSha256="9b988a24085101a888a9feac3271dd7e76e310dfff264abb7f1ce27d8a8d0bdd",
                displayNameFr="Dr Synthétique", displayNameAr="طبيب تجريبي", professionalTitleFr="Titre synthétique",
                professionalTitleAr="عنوان تجريبي", qualificationsFr="Diplôme synthétique", qualificationsAr="مؤهل تجريبي",
                addressFr="Adresse synthétique", addressAr="عنوان تجريبي", phones=["Téléphone fictif"], inpe=None)
            profile_file = clinic_dir / "practitioner.json"
            def write_profile():
                profile_file.write_text(json.dumps(profile, ensure_ascii=False))
                profile_file.chmod(0o644)
                pin = hashlib.sha256(profile_file.read_bytes()).hexdigest()
                for file in (src_file, dest_file):
                    text = re.sub(r"(?m)^CLINIC_PRACTITIONER_SHA256=.*\n", "", file.read_text())
                    file.write_text(text + f"CLINIC_PRACTITIONER_SHA256={pin}\n")

            write_profile()
            enc["BACKUP_DESTINATION"] = str(backup_dir)
            check_preflight(tmp, enc, src_port, (app_file, admin_file))
            compose(src, "up", "--no-build", "--pull", "never", "--wait")
            bootstrap(original, app_file, d, r)
            ca = ca_for(src, tmp / "root.crt")
            d_client, r_client = Client(src_port, ca), Client(src_port, ca)
            d_client.request("GET", "/api/v1/auth/me", 401)
            d_client.request("POST", "/api/v1/auth/login", 403, d)
            d_client.request("POST", "/api/v1/auth/login", 403, d, csrf=True, origin="https://outside.invalid")
            dentist_id = d_client.login(d)["id"]
            assert r_client.login(r)["role"] == "RECEPTIONIST"
            check_network(src, original, r_client, ca)
            print("OK cold start, migrations, trusted HTTPS, secure cookies, CSRF, role and simulated LAN isolation", flush=True)

            profile["dentistUserId"] = dentist_id
            write_profile()
            compose(src, "up", "--no-build", "--pull", "never", "--wait")
            certificate_pin = hashlib.sha256(ssl.PEM_cert_to_DER_cert(ca.read_text())).hexdigest()
            preflight = (sys.executable, str(HERE / "clinic-preflight.py"))
            tls = ("--ca", str(ca), "--ca-sha256", certificate_pin)
            result = run(*preflight, "install", "--ack-recovery", "--running", "--min-data-free-kib", "1", *tls, env=enc)
            assert b"FAIL" not in result.stdout and b"SameSite=Strict" in result.stdout
            assert app_file.read_bytes().split(b"=", 1)[1].strip() not in result.stdout + result.stderr
            invalid_pin = run(*preflight, "tls", "127.0.0.1", str(src_port), "--ca", str(ca),
                              "--ca-sha256", "0" * 64, env=enc, check=False)
            assert invalid_pin.returncode == 1 and b"FAIL Public CA fingerprint" in invalid_pin.stdout
            expiring = run(*preflight, "tls", "127.0.0.1", str(src_port), "--min-leaf-hours", "48",
                           *tls, env=enc, check=False)
            assert expiring.returncode == 1 and b"FAIL Server certificate is valid" in expiring.stdout
            print("OK live preflight, Caddy key permissions, TLS trust, certificate expiration policy and live secure cookies", flush=True)
            mounted_hash = compose(src, "exec", "-T", "backend", "sha256sum", "/run/clinic/practitioner.json").stdout
            assert mounted_hash.split()[0].decode() == hashlib.sha256(profile_file.read_bytes()).hexdigest()
            clients = {dentist: Client(src_port, ca), reception: Client(src_port, ca)}
            clients[dentist].login(d)
            clients[reception].login(r)
            paths, pdfs = fixture(clients[dentist], clients[reception])
            expected = [clients[role].json("GET", path, 200) for role, path in paths]
            expected_pdfs = [clients[role].pdf(path) for role, path in pdfs]
            clients[reception].request("GET", paths[1][1], 403)
            compose(src, "stop")
            compose(src, "up", "--no-build", "--pull", "never", "--wait")
            clients = {dentist: Client(src_port, ca), reception: Client(src_port, ca)}
            clients[dentist].login(d)
            clients[reception].login(r)
            assert [clients[role].json("GET", path, 200) for role, path in paths] == expected
            print("OK synthetic patient, consultation, V9 ledger, V11 invoice, PDFs and cold restart persistence", flush=True)

            backup = str(HERE / "backup.sh")
            assert run(backup, str(tmp / "missing"), env=enc, check=False).returncode
            assert run(backup, str(backup_dir), "--external", str(tmp), "absent-drive", env=enc, check=False).returncode
            assert run(backup, str(backup_dir), env={**enc, "BACKUP_MIN_FREE_KIB": "999999999999"}, check=False).returncode
            scheduled = str(HERE / "scheduled-backup.sh")
            enc["CLINIC_DEPLOYMENT_DIR"] = str(HERE)
            run(scheduled, "--check", env=enc)
            invalid_job = run(scheduled, "--check", env={**enc, "CLINIC_DEPLOYMENT_DIR": str(tmp)}, check=False)
            assert invalid_job.returncode == 1 and b"Set CLINIC_DEPLOYMENT_DIR" in invalid_job.stderr
            units = HERE / "systemd"
            run("systemd-analyze", "verify", str(units / "sijilmassa-backup.service"), str(units / "sijilmassa-backup.timer"))
            run("systemd-analyze", "calendar", "*-*-* 20:00:00")
            absent = run(scheduled, env={**enc, "BACKUP_MOUNTPOINT": str(tmp), "BACKUP_MEDIA_ID": "absent-drive"}, check=False)
            assert absent.returncode == 1 and b"External backup media is unavailable" in absent.stderr
            lock_fd = os.open(tmp, os.O_RDONLY | os.O_DIRECTORY)
            try:
                fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                overlapping = run(scheduled, env=enc, check=False)
                assert overlapping.returncode == 1 and b"A backup is already running" in overlapping.stderr
                assert not any(backup_dir.iterdir())
            finally:
                os.close(lock_fd)
            job = run(scheduled, env=enc)
            assert job.stdout == b"PASS Scheduled encrypted backup completed.\n" and not job.stderr
            run(backup, str(backup_dir), env=enc)
            print("OK scheduler configuration and units, scheduled job, missing drive reporting and overlap prevention", flush=True)
            bundles = sorted(backup_dir.glob("clinic-backup-*"))
            assert len(bundles) == 2 and all({p.name for p in bundle.iterdir()} == {"database.dump.gpg", "manifest"} for bundle in bundles)
            for bundle in bundles:
                assert not (bundle / "database.dump.gpg").read_bytes().startswith(b"PGDMP")
                assert run("gpg", "--batch", "--decrypt", str(bundle / "database.dump.gpg"), env=enc, check=False).returncode
                plaintext = run("gpg", "--batch", "--decrypt", str(bundle / "database.dump.gpg"), env=recovery_env).stdout
                assert plaintext.startswith(b"PGDMP")  # synthetic archive, in memory only
            failed = {**enc, "BACKUP_RECIPIENT": "0" * len(fingerprint)}
            assert run(backup, str(backup_dir), env=failed, check=False).returncode
            check_backup_monitor(tmp, bundles[-1], enc)
            check_failed_dump(enc, backup, backup_dir)
            assert sorted(backup_dir.iterdir()) == bundles
            print("OK two encrypted backups, public-only backup key, missing media, low space, key and pg_dump failures", flush=True)

            restore = str(HERE / "restore.sh")
            assert run(restore, str(bundles[-1]), target, RELEASE, "--confirm", "incorrect", env=recovery_env, check=False).returncode
            assert run(restore, str(bundles[-1]), target, "wrong-release", "--confirm", target, env=recovery_env, check=False).returncode
            corrupt = tmp / "corrupt"
            corrupt.mkdir()
            (corrupt / "manifest").write_bytes((bundles[-1] / "manifest").read_bytes())
            (corrupt / "database.dump.gpg").write_bytes(b"broken")
            assert run(restore, str(corrupt), target, RELEASE, "--confirm", target, env=recovery_env, check=False).returncode
            assert run("docker", "container", "inspect", target, check=False).returncode
            target_created = True
            run(restore, str(bundles[-1]), target, RELEASE, "--confirm", target, env=recovery_env)
            inspection = json.loads(run("docker", "inspect", target).stdout)[0]
            assert inspection["HostConfig"]["NetworkMode"] == "none"
            volume = next(mount["Name"] for mount in inspection["Mounts"] if mount["Destination"] == "/var/lib/postgresql/data")
            assert run(restore, str(bundles[-1]), target, RELEASE, "--confirm", target, env=recovery_env, check=False).returncode
            run("docker", "stop", target)
            override.write_text(f"volumes:\n  db-data:\n    external: true\n    name: {volume}\n")
            compose(dest, "-f", str(override), "up", "--no-build", "--pull", "never", "--wait")
            restored_ca = ca_for(dest, tmp / "restored-root.crt")
            restored = {dentist: Client(dest_port, restored_ca), reception: Client(dest_port, restored_ca)}
            restored[dentist].login(d)
            restored[reception].login(r)
            assert [restored[role].json("GET", path, 200) for role, path in paths] == expected
            actual_pdfs = [restored[role].pdf(path) for role, path in pdfs]
            assert actual_pdfs[:2] == expected_pdfs[:2]
            for before, after in zip(expected_pdfs[2:], actual_pdfs[2:]):
                assert run("pdftotext", "-", "-", data=before).stdout == run("pdftotext", "-", "-", data=after).stdout
            print("OK fresh isolated restore, Flyway/JPA startup, all records and the three PDFs verified", flush=True)
        except Exception:
            # Preserve short diagnostics for these synthetic services before removing them.
            diagnostics = compose(src, "logs", "--no-color", "--tail", "20", check=False).stdout.decode(errors="replace")
            for private in (d["password"], r["password"], app_file.read_text().split("=", 1)[1].strip(),
                            admin_file.read_text().split("=", 1)[1].strip()):
                diagnostics = diagnostics.replace(private, "[redacted]")
            print(diagnostics, file=sys.stderr)
            raise
        finally:
            if override.exists():
                compose(dest, "-f", str(override), "down", "--volumes", check=False)
            compose(src, "down", "--volumes", check=False)
            if target_created:
                run("docker", "rm", "-fv", target, check=False)
            for name in ("gpg", "gpg-public"):
                run("gpgconf", "--kill", "all", env={**BASE_ENV, "GNUPGHOME": str(tmp / name)}, check=False)


if __name__ == "__main__":
    if not __debug__:
        raise SystemExit("Run this assertion-based drill without Python optimization.")
    main()
