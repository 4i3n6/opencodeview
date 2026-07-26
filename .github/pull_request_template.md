## Summary

- What changed and why (problem first).
- Linked issue (if any): #

## Verification

- [ ] `bun run check`
- [ ] Focused tests added/updated for behavior changes
- [ ] Manual notes if this touches scan, source DB reads, API auth, redaction, or bind/host behavior

## Docs / i18n

- [ ] README EN + PT updated when user-facing behavior, env, or endpoints change
- [ ] UI strings added to both `en-US` and `pt-BR` catalogs when visible copy changes
- [ ] DESIGN updated only if visual contracts changed

## Security and privacy

- [ ] No secrets, absolute home paths, or personal data in the diff
- [ ] Loopback defaults, read-only source access, and server-side redaction preserved — or explicitly justified below

### Security justification (if defaults change)

<!-- required when touching bind, auth, redaction, or source DB write paths -->
