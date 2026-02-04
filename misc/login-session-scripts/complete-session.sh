#!/bin/bash
#
# Complete a login session (super-user endpoint)
#
# Usage:
#   ./complete-session.sh <session-token> <user-id> [access-json-file]
#
# If access-json-file is not provided, uses default full access.
#
# Environment variables:
#   API_BASE_URL    - Base URL for API (default: http://localhost/api)
#   ROOT_USERNAME   - Super-user username
#   ROOT_PASSWORD   - Super-user password
#

set -e

API_BASE_URL="${API_BASE_URL:-https://apidev.zotero.org}"

if [ -z "$1" ] || [ -z "$2" ]; then
	echo "Usage: $0 <session-token> <user-id> [access-json-file]"
	echo ""
	echo "Arguments:"
	echo "  session-token    The session token to complete"
	echo "  user-id          The user ID to associate with the key"
	echo "  access-json-file Optional file containing access JSON"
	echo ""
	echo "Environment:"
	echo "  API_BASE_URL    Base URL (default: https://apidev.zotero.org)"
	echo "  ROOT_USERNAME   Super-user username"
	echo "  ROOT_PASSWORD   Super-user password"
	echo ""
	echo "Example access JSON:"
	echo '  {"user":{"library":true,"notes":true,"write":true,"files":true},"groups":{"all":{"library":true,"write":true}}}'
	exit 1
fi

SESSION_TOKEN="$1"
USER_ID="$2"
ACCESS_FILE="$3"

if [ -z "$ROOT_USERNAME" ] || [ -z "$ROOT_PASSWORD" ]; then
	echo "Error: ROOT_USERNAME and ROOT_PASSWORD environment variables required"
	exit 1
fi

# Default access: full permissions
if [ -n "$ACCESS_FILE" ] && [ -f "$ACCESS_FILE" ]; then
	ACCESS_JSON=$(cat "$ACCESS_FILE")
else
	ACCESS_JSON='{"user":{"library":true,"notes":true,"write":true,"files":true},"groups":{"all":{"library":true,"write":true}}}'
fi

# Build the request body
REQUEST_BODY=$(cat <<EOF
{
	"sessionToken": "${SESSION_TOKEN}",
	"userID": ${USER_ID},
	"access": ${ACCESS_JSON}
}
EOF
)

echo "Completing session: $SESSION_TOKEN"
echo "User ID: $USER_ID"
echo "Access: $ACCESS_JSON"
echo ""

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${API_BASE_URL}/keys/sessions/complete" \
	-H "Content-Type: application/json" \
	-H "Zotero-API-Version: 3" \
	-u "${ROOT_USERNAME}:${ROOT_PASSWORD}" \
	-d "$REQUEST_BODY")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "204" ]; then
	echo "Session completed successfully (204 No Content)"
	echo ""
	echo "Use poll-session.sh to get the API key:"
	echo "  ./poll-session.sh $SESSION_TOKEN"
elif [ -n "$BODY" ]; then
	echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
	echo ""
	echo "HTTP status: $HTTP_CODE"
else
	echo "HTTP status: $HTTP_CODE"
fi
