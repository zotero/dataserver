# Login Session API Endpoints

## POST /keys/sessions
Create a new login session. No authentication required.

### Request Headers
- **User-Agent** — Used to determine client type (macOS, Windows, Linux, iOS, Android). Sets the default key name.
- **Zotero-API-Key** (optional) — If provided, ties the session to the existing key for a key-update flow. The `/info` endpoint will return the existing key's `userID` and `access` permissions.

### Request Body (optional)
```json
{ "userID": 12345 }
```
- **userID** (optional) — If the client has a local database tied to a user, pass the userID. The `/info` endpoint will return this so www can warn if the logged-in user doesn't match.

### Response
- **201 Created**
  ```json
  {
    "sessionToken": "8HHlgU28pwsCMA9dbF56XQLjTEu7HV8V",
    "loginURL": "https://www.zotero.org/login?session=8HHlgU28pwsCMA9dbF56XQLjTEu7HV8V"
  }
  ```

---

## GET /keys/sessions/:token
Poll session status. No authentication required.

### Response
- **200 OK**
  ```json
  // Pending:
  { "status": "pending" }

  // Completed:
  {
    "status": "completed",
    "apiKey": "abcd1234efgh5678ijkl9012",
    "userID": 12345,
    "username": "testuser"
  }

  // Cancelled:
  { "status": "cancelled" }
  ```
- **404 Not Found** — session doesn't exist (never existed or purged)
- **410 Gone** — session expired

---

## GET /keys/sessions/:token/info
Get session info. Super-user authentication required.

### Response
- **200 OK**
  ```json
  // New login:
  { "status": "pending", "userID": null, "access": null }

  // Key update:
  {
    "status": "pending",
    "userID": 12345,
    "access": {
      "user": { "library": true, "notes": true, "write": true, "files": true },
      "groups": { "all": { "library": true, "write": true } }
    }
  }
  ```
- **403 Forbidden** — not super-user
- **404 Not Found** — session doesn't exist
- **410 Gone** — session expired

---

## POST /keys/sessions/complete
Complete a login session. Super-user authentication required.

### Request
```json
{
  "sessionToken": "...",
  "userID": 12345,
  "access": { "user": { "library": true }, "groups": { ... } }
}
```

### Response
- **204 No Content** — success
- **400 Bad Request** — missing required fields (sessionToken, access, userID for new login)
- **403 Forbidden** — not super-user
- **404 Not Found** — session doesn't exist
- **409 Conflict** — session already completed or cancelled
- **410 Gone** — session expired

---

## DELETE /keys/sessions/:token
Cancel a session. No authentication required.

### Response
- **204 No Content** — success
- **404 Not Found** — session doesn't exist
- **409 Conflict** — session already completed, expired, or cancelled
