#!/bin/bash
#
# Create a login session
#
# Usage:
#   ./create-session.sh                    # New login (no API key)
#   ./create-session.sh -k <api-key>       # Key update (with existing API key)
#   ./create-session.sh -i <user-id>       # With userID from local database
#   ./create-session.sh -u <user-agent>    # Custom User-Agent
#
# Environment variables:
#   API_BASE_URL  - Base URL for API (default: https://apidev.zotero.org)
#

set -e

API_BASE_URL="${API_BASE_URL:-https://apidev.zotero.org}"
API_KEY=""
USER_ID=""
USER_AGENT="Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15) Zotero/7.0"

while getopts "k:i:u:h" opt; do
	case $opt in
		k)
			API_KEY="$OPTARG"
			;;
		i)
			USER_ID="$OPTARG"
			;;
		u)
			USER_AGENT="$OPTARG"
			;;
		h)
			echo "Usage: $0 [-k api-key] [-i user-id] [-u user-agent]"
			echo ""
			echo "Options:"
			echo "  -k  API key (for key update flow)"
			echo "  -i  User ID from local database (www will warn if mismatch)"
			echo "  -u  User-Agent string (default: macOS Zotero)"
			echo ""
			echo "Environment:"
			echo "  API_BASE_URL  Base URL (default: https://apidev.zotero.org)"
			exit 0
			;;
		\?)
			echo "Invalid option: -$OPTARG" >&2
			exit 1
			;;
	esac
done

HEADERS=(-H "User-Agent: $USER_AGENT")
HEADERS+=(-H "Zotero-API-Version: 3")

if [ -n "$API_KEY" ]; then
	HEADERS+=(-H "Zotero-API-Key: $API_KEY")
	echo "Creating session with API key (key update flow)..."
elif [ -n "$USER_ID" ]; then
	echo "Creating session with userID: $USER_ID..."
else
	echo "Creating session without API key (new login flow)..."
fi

# Build request body if userID provided
if [ -n "$USER_ID" ]; then
	HEADERS+=(-H "Content-Type: application/json")
	RESPONSE=$(curl -s -X POST "${API_BASE_URL}/keys/sessions" "${HEADERS[@]}" \
		-d "{\"userID\": ${USER_ID}}")
else
	RESPONSE=$(curl -s -X POST "${API_BASE_URL}/keys/sessions" "${HEADERS[@]}")
fi

echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"

# Extract and display the session token for easy copying
SESSION_TOKEN=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('sessionToken', ''))" 2>/dev/null)
if [ -n "$SESSION_TOKEN" ]; then
	echo ""
	echo "Session token: $SESSION_TOKEN"
fi
