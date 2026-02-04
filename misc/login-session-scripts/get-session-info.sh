#!/bin/bash
#
# Get session info (super-user endpoint)
#
# Usage:
#   ./get-session-info.sh <session-token>
#
# Environment variables:
#   API_BASE_URL    - Base URL for API (default: http://localhost/api)
#   ROOT_USERNAME   - Super-user username
#   ROOT_PASSWORD   - Super-user password
#

set -e

API_BASE_URL="${API_BASE_URL:-https://apidev.zotero.org}"

if [ -z "$1" ]; then
	echo "Usage: $0 <session-token>"
	echo ""
	echo "Environment:"
	echo "  API_BASE_URL    Base URL (default: https://apidev.zotero.org)"
	echo "  ROOT_USERNAME   Super-user username"
	echo "  ROOT_PASSWORD   Super-user password"
	exit 1
fi

SESSION_TOKEN="$1"

if [ -z "$ROOT_USERNAME" ] || [ -z "$ROOT_PASSWORD" ]; then
	echo "Error: ROOT_USERNAME and ROOT_PASSWORD environment variables required"
	exit 1
fi

echo "Getting session info for: $SESSION_TOKEN"
echo ""

RESPONSE=$(curl -s -X GET "${API_BASE_URL}/keys/sessions/${SESSION_TOKEN}/info" \
	-H "Zotero-API-Version: 3" \
	-u "${ROOT_USERNAME}:${ROOT_PASSWORD}")

echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
