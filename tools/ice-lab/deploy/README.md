# Running the Ice Lab on a box

Twenty minutes on a fresh Debian or Ubuntu machine. The rig has no
dependencies, so most of this is making a user and pointing a name at an IP.

The result: **your domain serves the rig over HTTPS, and every session anyone
plays lands in a file you own.**

---

## What you need first

- A box with a public IP and root.
- A domain, with an **A record already pointing at that IP**. Caddy fetches the
  certificate on first start and cannot if the name does not resolve yet.
- **Node 26 or newer.** Not optional and not arbitrary: the build step is
  Node's own TypeScript stripper, which is why this thing has no build tooling
  to install. Distribution packages are usually far older —
  [nodesource](https://github.com/nodesource/distributions) or a tarball from
  nodejs.org both work. Check with `node --version` before going further.

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

## 5 · Caddy

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

## 7 · Updating

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
