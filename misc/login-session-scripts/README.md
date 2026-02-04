# Login Session Test Scripts

Shell scripts for testing the web-based login session flow.

## Setup

Set environment variables:

```bash
export API_BASE_URL="https://apidev.zotero.org"  # (this is the default)
export ROOT_USERNAME="your-root-username"
export ROOT_PASSWORD="your-root-password"
```

## Scripts

### create-session.sh

Create a new login session.

```bash
# New login (no API key)
./create-session.sh

# Key update flow (with existing API key)
./create-session.sh -k "existingApiKey123"

# Custom User-Agent
./create-session.sh -u "Mozilla/5.0 (Windows NT 10.0) Zotero/7.0"
```

### get-session-info.sh

Get session info (super-user endpoint). Shows userID and existing key permissions for key update flow.

```bash
./get-session-info.sh <session-token>
```

### complete-session.sh

Complete a session and create/update the API key (super-user endpoint).

```bash
# With default full access
./complete-session.sh <session-token> <user-id>

# With custom access from file
./complete-session.sh <session-token> <user-id> access.json
```

Example `access.json`:
```json
{
  "user": {
    "library": true,
    "notes": true,
    "write": true,
    "files": true
  },
  "groups": {
    "all": {
      "library": true,
      "write": true
    }
  }
}
```

### poll-session.sh

Poll a session for completion (public endpoint).

```bash
# Single poll
./poll-session.sh <session-token>

# Wait/poll until complete
./poll-session.sh -w <session-token>

# Poll every 2 seconds
./poll-session.sh -w -i 2 <session-token>
```

## Example Flow

### New Login

```bash
# 1. Client creates session
./create-session.sh
# Output: sessionToken: abc123...

# 2. (User opens loginURL in browser and authenticates)

# 3. www server gets session info
./get-session-info.sh abc123...
# Shows userID: null, access: null (new login)

# 4. www server completes session after user authenticates
./complete-session.sh abc123... 12345
# Output: apiKey: xyz789...

# 5. Client polls and receives API key
./poll-session.sh abc123...
# Output: status: completed, apiKey: xyz789...
```

### Key Update

```bash
# 1. Client creates session with existing API key
./create-session.sh -k "existingApiKey"
# Output: sessionToken: def456...

# 2. www server gets session info
./get-session-info.sh def456...
# Shows userID: 12345, access: {existing permissions}

# 3. www server completes session with new permissions
./complete-session.sh def456... 12345 new-access.json

# 4. Client polls and receives confirmation
./poll-session.sh def456...
```
