# Security

Security boundaries are enforced in code, not prompts. Anonymous queries fail,
passwords are forbidden, provider keys and database credentials are never
rendered into prompts, and egress is allowlisted. The console sets a self-only
CSP and loads no third-party scripts.

Production deployments must provide TLS 1.3, secure cookie transport, disk
encryption, least-privilege database users, signing-key storage, restore testing,
and key-rotation procedures.
