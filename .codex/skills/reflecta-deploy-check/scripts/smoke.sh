#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-https://reflecta-delta.vercel.app}"

check_contains() {
  local label="$1"
  local content="$2"
  local needle="$3"

  if grep -Fq "$needle" <<<"$content"; then
    printf 'PASS %s\n' "$label"
  else
    printf 'FAIL %s: missing "%s"\n' "$label" "$needle" >&2
    exit 1
  fi
}

check_status() {
  local label="$1"
  local expected="$2"
  local actual="$3"

  if [[ "$actual" == "$expected" ]]; then
    printf 'PASS %s (%s)\n' "$label" "$actual"
  else
    printf 'FAIL %s: expected %s, got %s\n' "$label" "$expected" "$actual" >&2
    exit 1
  fi
}

home_html="$(curl -fsSL "$BASE_URL/")"
check_contains "active reflection pane" "$home_html" "Active reflection"
check_contains "graph heading" "$home_html" "Mirror map"
check_contains "workspace pane" "$home_html" "Node Summary"

graph_status="$(curl -s -o /tmp/reflecta-graph.json -w '%{http_code}' "$BASE_URL/api/graph")"
check_status "graph api" "200" "$graph_status"
check_contains "graph payload" "$(cat /tmp/reflecta-graph.json)" "\"nodes\""

conversations_status="$(curl -s -o /tmp/reflecta-conversations.json -w '%{http_code}' "$BASE_URL/api/conversations")"
if [[ "$conversations_status" == "500" ]]; then
  printf 'FAIL conversations list: returned 500\n' >&2
  cat /tmp/reflecta-conversations.json >&2
  exit 1
fi
printf 'PASS conversations list (%s)\n' "$conversations_status"

create_status="$(curl -s -o /tmp/reflecta-create.json -w '%{http_code}' -X POST "$BASE_URL/api/conversations")"
if [[ "$create_status" == "201" ]]; then
  printf 'PASS create conversation (%s)\n' "$create_status"
else
  printf 'FAIL create conversation: expected 201, got %s\n' "$create_status" >&2
  cat /tmp/reflecta-create.json >&2
  exit 1
fi

conversation_id="$(node -e 'const fs=require("fs"); const data=JSON.parse(fs.readFileSync("/tmp/reflecta-create.json","utf8")); process.stdout.write(data.id)')"

first_message_status="$(curl -s -o /tmp/reflecta-message-1.json -w '%{http_code}' -X POST "$BASE_URL/api/conversations/$conversation_id/messages" -H 'Content-Type: application/json' --data '{"content":"Work has been bleeding into everything lately."}')"
check_status "first message" "200" "$first_message_status"

second_message_status="$(curl -s -o /tmp/reflecta-message-2.json -w '%{http_code}' -X POST "$BASE_URL/api/conversations/$conversation_id/messages" -H 'Content-Type: application/json' --data '{"content":"It followed me into dinner and I kept thinking about it after I got home."}')"
check_status "second message" "200" "$second_message_status"
