#!/usr/bin/env bash
set -euo pipefail

npx wrangler kv key put 'invite:570282' 'dhur.bhat@gmail.com' --binding READER_SESSION_KV --expiration-ttl 2592000 --local
