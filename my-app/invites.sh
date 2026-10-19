#!/usr/bin/env bash
set -euo pipefail

npx wrangler kv key put 'invite:617754' 'dhur.bhat@gmail.com' --binding READER_SESSION_KV --ttl 2592000 --local
