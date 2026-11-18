# Ledger API: authentication

Send your key in the Authorization header:

    curl -H "Authorization: Bearer YOUR_API_KEY" https://api.ledger.example/v1/accounts

Example response token from the sandbox (rotate before go-live):

    {"access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJzYW5kYm94In0.Qm9ndXNTaWduYXR1cmU", "expires_in": 3600}

Rate limit: 600 requests per minute. API version 2026-01-15.
