# Hardware Retail Management System

Source repository for the Hardware Retail Management System.

The existing AppDeploy application is the functional baseline. The desktop migration will preserve the current retail workflows while introducing a Tauri Windows shell, local SQLite storage, offline staff authentication, and a controlled synchronisation layer in incremental phases.

The AppDeploy-hosted owner/licensing portal remains separate from the customer-facing Windows desktop application.

## Migration status

- [x] Repository initialised
- [ ] Existing AppDeploy source imported
- [ ] Tauri desktop shell
- [ ] SQLite local data layer
- [ ] Offline staff authentication
- [ ] Synchronisation/outbox
- [ ] Windows installer and CI validation

No production data or credentials should be committed to this repository.
