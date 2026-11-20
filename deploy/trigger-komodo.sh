#!/bin/sh
# Runs on the server, piped over SSH by `npm run deploy`: asks Komodo to redeploy a stack by sending
# the same signed request a GitHub push webhook would. GitHub itself can't reach Komodo on the LAN.
# The webhook secret is read from Komodo's own config and never leaves the server.
set -eu
STACK=${1:?usage: trigger-komodo.sh <stack> [branch]}
BRANCH=${2:-main}
python3 - "$STACK" "$BRANCH" <<'PY'
import hashlib, hmac, json, os, sys, urllib.request
stack, branch = sys.argv[1:]
env = open(os.path.expanduser('~/komodo/compose.env')).read().splitlines()
secret = next(l.split('=', 1)[1] for l in env if l.startswith('KOMODO_WEBHOOK_SECRET='))
body = json.dumps({'ref': f'refs/heads/{branch}'}).encode()
sig = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
req = urllib.request.Request(
    f'http://127.0.0.1:9120/listener/github/stack/{stack}/deploy',
    data=body,
    headers={'content-type': 'application/json', 'x-hub-signature-256': f'sha256={sig}'},
)
urllib.request.urlopen(req).read()
print(f'Komodo is deploying {stack} from {branch}')
PY
