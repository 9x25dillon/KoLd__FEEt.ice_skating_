# Running the Ice Lab on a box

Twenty minutes on a fresh Debian or Ubuntu machine. The rig has no
dependencies, so most of this is making a user and pointing a name at an IP.

The result: **your domain serves the rig over HTTPS, and every session anyone
plays lands in a file you own.**

---

## If the box is already doing something else

Most boxes are. Everything below is designed to sit beside an existing service
without touching it — new user, new directories, new port, new subdomain — but
three things can genuinely break a running backend, and all three are avoidable:

1. **Upgrading Node with the package manager.** If the existing app runs on
   Node, `apt install nodejs` can move it under the app's feet. Install Node 26
   **side by side** in `/opt/node26` instead and point only this service at it.
   Nothing else on the box sees it: no PATH change, no package, no symlink.
2. **A second web server.** Installing Caddy on a box already running nginx
   gives you two processes both wanting port 80. Find out what is there first
   and add a site to it rather than installing a rival.
3. **Reloading a web server with a broken config.** Always `nginx -t` or
   `caddy validate` before the reload, never after.

Reconnaissance first — every command here only reads:

```sh
ss -tlnp | grep -E ':(80|443|8124)\s'   # who owns the ports that matter
systemctl list-units --type=service --state=running | grep -Ei 'caddy|nginx|apache|httpd'
command -v caddy nginx; node --version 2>/dev/null
id edgework 2>/dev/null; ls -d /srv/edgework /var/lib/edgework 2>/dev/null
```

If port 8124 is taken, change `PORT` in the unit and the upstream in the web
server config to match — nothing else refers to it.

## What you need first

- A box with a public IP and root.
- A domain, with an **A record already pointing at that IP**. Caddy fetches the
  certificate on first start and cannot if the name does not resolve yet.
- **Node 26 or newer.** Not optional and not arbitrary: the build step is
  Node's own TypeScript stripper, which is why this thing has no build tooling
  to install. Distribution packages are usually far older.

  On a box that is already running something, install it **beside** whatever is
  there rather than over it:

  ```sh
  case "$(uname -m)" in x86_64) NARCH=x64;; aarch64) NARCH=arm64;; *) echo "unknown arch"; exit 1;; esac
  NODE_VER=$(curl -fsSL https://nodejs.org/dist/index.json | grep -o '"version":"v26[^"]*"' | head -1 | cut -d'"' -f4)
  curl -fsSL "https://nodejs.org/dist/${NODE_VER}/node-${NODE_VER}-linux-${NARCH}.tar.xz" -o /tmp/node26.tar.xz
  curl -fsSL "https://nodejs.org/dist/${NODE_VER}/SHASUMS256.txt" -o /tmp/node26.sha
  (cd /tmp && grep " node-${NODE_VER}-linux-${NARCH}.tar.xz$" node26.sha | sha256sum -c -)
  sudo mkdir -p /opt/node26 && sudo tar -xJf /tmp/node26.tar.xz -C /opt/node26 --strip-components=1
  /opt/node26/bin/node --version
  ```

  Then point the unit at it, and nothing else on the box is affected:

  ```sh
  sudo sed -i 's#/usr/bin/node#/opt/node26/bin/node#g' /etc/systemd/system/edgework-collect.service
  ```

## 1 · A user and two directories

```sh
sudo useradd --system --home /srv/edgework --shell /usr/sbin/nologin edgework
sudo mkdir -p /srv/edgework /var/lib/edgework /etc/edgework
sudo chown edgework:edgework /srv/edgework /var/lib/edgework
```

`/var/lib/edgework` is where the sessions accumulate. It is the only thing here
worth backing up, and it is a text file.

## 2 · The code

```sh
sudo -u edgework git clone https://github.com/9x25dillon/KoLd__FEEt.ice_skating_.git /srv/edgework
sudo -u edgework mkdir -p /srv/edgework/tools/ice-lab/build
sudo -u edgework node /srv/edgework/tools/ice-lab/app/build.mjs
```

The `build` directory has to exist and be writable before the service starts,
because the unit hardening makes everything else read-only. The service
rebuilds it on every start, so a restart can never serve something older than
the checkout.

Run the tests once while you are here. They take about two seconds and they are
the difference between "it started" and "it works":

```sh
cd /srv/edgework/tools/ice-lab && node --test test/*.test.ts
```

## 3 · A token for reading the data back

```sh
printf 'COLLECT_TOKEN=%s\n' "$(openssl rand -hex 24)" | sudo tee /etc/edgework/collect.env
sudo chmod 600 /etc/edgework/collect.env
sudo chown root:root /etc/edgework/collect.env
```

Without it, `GET /api/sessions` returns 404 to everyone including you. Writing
sessions never needs a token — that is the whole point — and reading them
always does.

Keep a copy of that token somewhere you will find it in six months.

## 4 · The service

```sh
sudo cp /srv/edgework/tools/ice-lab/deploy/edgework-collect.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now edgework-collect
systemctl status edgework-collect
curl -s localhost:8124/api/session -X POST -d '{}'      # expect: not a session card
```

That last line failing correctly is the sign it is up: it means the process is
listening, parsing, and refusing rubbish.

The unit is deliberately locked down — no capabilities, a read-only filesystem
apart from two paths, a syscall filter. `systemd-analyze security
edgework-collect` will tell you how it scores. If you change `ExecStart`,
re-run `systemd-analyze verify` on the file first; it catches keys in the wrong
section, which systemd otherwise ignores in silence.

## 5 · The web server

### If Caddy is already running

Do not replace `/etc/caddy/Caddyfile` — append a site block to it, or drop one
in if the file ends with an import:

```sh
sudo tee -a /etc/caddy/Caddyfile < /srv/edgework/tools/ice-lab/deploy/Caddyfile
sudo nano /etc/caddy/Caddyfile        # set the domain on the block you just added
sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy
```

### If nginx is already running

Do not install Caddy. This is the whole server block, and it touches nothing
else nginx is serving:

```nginx
server {
    listen 443 ssl http2;
    server_name skate.example.com;

    # certbot --nginx -d skate.example.com will fill these in
    ssl_certificate     /etc/letsencrypt/live/skate.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/skate.example.com/privkey.pem;

    client_max_body_size 64k;

    # The collector holds nothing about a person; do not undo that in the log.
    access_log /var/log/nginx/edgework.log combined;   # or: access_log off;

    location / {
        proxy_pass http://127.0.0.1:8124;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```sh
sudo nginx -t && sudo systemctl reload nginx
```

### If nothing is serving 80/443 yet

## 5b · Caddy

```sh
sudo apt install caddy          # or per caddyserver.com/docs/install
sudo cp /srv/edgework/tools/ice-lab/deploy/Caddyfile /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile  # put your domain at the top
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Then open `https://your.domain/` and skate. The certificate appears by itself.

The Caddyfile deletes client IP addresses and user agents from the access log,
because it would be a strange kind of care to strip everything personal out of
the payload and then write everyone's address to disk anyway.

## 6 · Reading what people played

```sh
curl -H "Authorization: Bearer $COLLECT_TOKEN" https://your.domain/api/sessions > sessions.jsonl
wc -l sessions.jsonl
```

One JSON object per line. Ten of them are worth more than any amount of
speculation about whether carving is fun.

A quick look without leaving the shell:

```sh
# how long people actually chose to keep skating, per scheme
jq -r '[.scheme, (.metrics.freePlaySeconds|floor), .metrics.falls] | @tsv' sessions.jsonl \
  | sort | column -t
```

Back it up as a plain file — `rsync`, a nightly `cp` to another disk, anything.
It is text, it is small, and it is the only thing on this box you cannot
regenerate.

## 7 · Removing it again

Nothing here is entangled with anything else, which is the point:

```sh
sudo systemctl disable --now edgework-collect
sudo rm /etc/systemd/system/edgework-collect.service && sudo systemctl daemon-reload
sudo rm -rf /srv/edgework /etc/edgework /opt/node26
sudo userdel edgework
# and delete the site block from the web server config, then reload
```

`/var/lib/edgework` is left out of that on purpose: it is the sessions, and it
is the only thing on the box that cannot be regenerated.

## 8 · Updating

```sh
sudo -u edgework git -C /srv/edgework pull
sudo systemctl restart edgework-collect
```

The restart rebuilds from source. If the build fails the service will not come
up, which is the correct behaviour: `journalctl -u edgework-collect -n 50`.

---

## Hosting the rig somewhere else

If you would rather serve the rig from GitHub Pages and only collect here, the
page takes the endpoint as a query parameter:

```
https://9x25dillon.github.io/KoLd__FEEt.ice_skating_/app/?collect=https://your.domain/api/session
```

The collector already sends permissive CORS headers for that case. Serving both
from the same box is tidier and needs no configuration at all — that is why the
collector serves the rig itself.

## For a playtest

Add `playtest=1` and the tester sees a rink, a scheme letter, and a button:

```
https://your.domain/app/?playtest=1
```

No sliders, no preset name, nothing that explains what they are supposed to
feel. [pre-production-plan.md §7](../../../docs/pre-production-plan.md) has the
rest of the protocol, including the five exit questions and the rule that the
facilitator never explains a failure during a measured block.

## When it breaks

| | |
|---|---|
| Certificate never issues | The A record is not pointing here yet, or 80/443 are firewalled. Caddy needs both. |
| `502` from Caddy | The service is down. `systemctl status edgework-collect`, then the journal. |
| Service will not start | Nine times out of ten `node --version` is below 26, or `build/` is missing or not owned by `edgework`. |
| Sessions arrive empty | Check the browser console on the page: a failed POST falls back to downloading a file, so the tester still has their session even when the box does not. |
| `GET /api/sessions` returns 404 | That is what a wrong or missing token looks like. It is deliberate — a 401 would confirm the route exists. |
