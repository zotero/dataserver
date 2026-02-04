#!/bin/bash
#
# Poll a session for completion (public endpoint)
#
# Usage:
#   ./poll-session.sh <session-token>           # Single poll
#   ./poll-session.sh -w <session-token>        # Wait/poll until complete
#   ./poll-session.sh -w -i 2 <session-token>   # Poll every 2 seconds
#
# Environment variables:
#   API_BASE_URL  - Base URL for API (default: http://localhost/api)
#

set -e

API_BASE_URL="${API_BASE_URL:-https://apidev.zotero.org}"
WAIT=false
INTERVAL=3

while getopts "wi:h" opt; do
	case $opt in
		w)
			WAIT=true
			;;
		i)
			INTERVAL="$OPTARG"
			;;
		h)
			echo "Usage: $0 [-w] [-i interval] <session-token>"
			echo ""
			echo "Options:"
			echo "  -w  Wait/poll until session is completed or expired"
			echo "  -i  Poll interval in seconds (default: 3)"
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

shift $((OPTIND-1))

if [ -z "$1" ]; then
	echo "Usage: $0 [-w] [-i interval] <session-token>"
	exit 1
fi

SESSION_TOKEN="$1"

poll_once() {
	RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "${API_BASE_URL}/keys/sessions/${SESSION_TOKEN}" \
		-H "Zotero-API-Version: 3")

	HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
	BODY=$(echo "$RESPONSE" | sed '$d')

	echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"

	# Return status based on HTTP code and session status
	if [ "$HTTP_CODE" = "410" ]; then
		echo ""
		echo "Session expired (410 Gone)"
		return 2
	elif [ "$HTTP_CODE" = "404" ]; then
		echo ""
		echo "Session not found (404)"
		return 3
	elif [ "$HTTP_CODE" = "200" ]; then
		STATUS=$(echo "$BODY" | python3 -c "import sys, json; print(json.load(sys.stdin).get('status', ''))" 2>/dev/null)
		if [ "$STATUS" = "completed" ]; then
			API_KEY=$(echo "$BODY" | python3 -c "import sys, json; print(json.load(sys.stdin).get('apiKey', ''))" 2>/dev/null)
			echo ""
			echo "Session completed!"
			if [ -n "$API_KEY" ]; then
				echo "API Key: $API_KEY"
			fi
			return 0
		elif [ "$STATUS" = "cancelled" ]; then
			echo ""
			echo "Session was cancelled"
			return 4
		else
			# Still pending
			return 1
		fi
	else
		echo ""
		echo "Unexpected HTTP status: $HTTP_CODE"
		return 5
	fi
}

if [ "$WAIT" = true ]; then
	echo "Polling session: $SESSION_TOKEN (every ${INTERVAL}s)"
	echo "Press Ctrl+C to stop"
	echo ""

	while true; do
		echo "--- $(date '+%H:%M:%S') ---"
		poll_once && RESULT=0 || RESULT=$?

		if [ $RESULT -eq 0 ]; then
			# Completed
			exit 0
		elif [ $RESULT -eq 1 ]; then
			# Still pending, continue polling
			sleep "$INTERVAL"
		else
			# Error or terminal state
			exit $RESULT
		fi
		echo ""
	done
else
	echo "Polling session: $SESSION_TOKEN"
	echo ""
	poll_once || true
fi
