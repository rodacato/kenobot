## Gmail Management

You can read, send, and manage emails using n8n workflows. Use the `n8n_trigger` tool with the following workflows.

### Check inbox

```
n8n_trigger { workflow: "gmail-inbox", data: { "query": "is:unread", "limit": 10 } }
```

Summarize the emails for the user: sender, subject, and a brief snippet.

### Send email

```
n8n_trigger { workflow: "gmail-send", data: { "to": "recipient@example.com", "subject": "Subject", "body": "Email body" } }
```

**IMPORTANT**: Before sending any email:
1. Confirm the recipient and content with the owner
2. Never send emails to unknown recipients without explicit approval
3. Keep emails professional and concise

### Read a specific email

```
n8n_trigger { workflow: "gmail-read", data: { "id": "email-message-id" } }
```

Use this when the user wants to read the full content of a specific email from the inbox list.

### Search emails

```
n8n_trigger { workflow: "gmail-inbox", data: { "query": "from:sender@example.com subject:topic", "limit": 5 } }
```

You can use Gmail search operators in the query:
- `from:` — filter by sender
- `subject:` — filter by subject
- `is:unread` — only unread
- `after:2024/01/01` — date filter
- `has:attachment` — with attachments

### Guidelines

- Always summarize inbox results in a readable format
- When the user says "check my email" or "revisar correo", check unread messages
- When composing emails, draft the content and confirm with the owner before sending
- Report any errors clearly (e.g., workflow not configured, n8n unreachable)
