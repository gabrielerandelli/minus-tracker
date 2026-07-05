# Security Policy

minus-tracker processes financial CSV exports locally — it has no network calls in the core
library or CLI (the optional `Classifier` may call OpenFIGI; `rates --update` may call the ECB
API; both are explicit, user-invoked actions). Still, if you find a security issue — e.g. a way to
corrupt calculations, leak local file contents, or exploit the MCP server — please report it
responsibly.

## Reporting a vulnerability

Email **gabrielerandelli@gmail.com** with a description of the issue and steps to reproduce.
Please do not open a public GitHub issue for security reports.

You should expect an initial response within a few days. Once a fix is available, it will be
released as a patch version and credited in the changelog (unless you prefer to remain anonymous).

## Supported versions

Only the latest published version on npm receives security fixes.
