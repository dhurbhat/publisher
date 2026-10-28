#!/usr/bin/env bash
set -euo pipefail

npx wrangler kv key put 'invite:731800' 'dhur.bhat@gmail.com' --binding READER_SESSION_KV --ttl 2592000  --remote
npx wrangler kv key put 'invite:260720' 'yoginimelissa@gmail.com' --binding READER_SESSION_KV --ttl 2592000  --remote
npx wrangler kv key put 'invite:573743' 'chopp_alt@yahoo.com' --binding READER_SESSION_KV --ttl 2592000  --remote
npx wrangler kv key put 'invite:255780' 'leehartwell2007@yahoo.com' --binding READER_SESSION_KV --ttl 2592000  --remote
npx wrangler kv key put 'invite:966159' 'smlapolla@gmail.com' --binding READER_SESSION_KV --ttl 2592000  --remote
