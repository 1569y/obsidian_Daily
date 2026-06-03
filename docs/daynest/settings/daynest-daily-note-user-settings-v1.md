---
status: partially-superseded
scope: daynest-early-daily-note-settings
last-reviewed-checkpoint: docs-4b-1
supersedes: []
superseded-by:
  - ./daynest-daily-note-template-language-design-v1.md
  - ../architecture/daynest-storage-projection-decision-matrix-v1.md
---

# DayNest Daily Note User Settings v1

## 1. Purpose

This document replaces the older assumption that DayNest daily logs should primarily follow Obsidian Daily Notes settings.

New direction:

- DayNest should use its own user-configurable daily note settings
- following Obsidian Daily Notes should be optional
- DayNest should remain additive and should not change existing MoodNest behavior

This is a documentation-only design note.

## 2. Why DayNest Should Use Its Own User-Configurable Daily Note Settings

DayNest should use its own daily note settings because:

- not every user uses Obsidian Daily Notes
- some users want DayNest daily records in a separate folder
- some users want a different date format from their existing daily notes
- DayNest may later support multiple writing modes without changing MoodNest settings
- user intent should control where DayNest writes, instead of DayNest assuming one vault convention

Conservative product rule:

- DayNest should be compatible with Obsidian Daily Notes
- DayNest should not be forced to depend on Obsidian Daily Notes

## 3. Recommended Modes

Recommended DayNest daily note modes:

- `custom`
  - user manually chooses the target folder and date format
- `daynest_default`
  - DayNest uses its own default path and date format
  - suggested default:
  - folder: `NestHub/DayNest/daily`
  - date format: `YYYY-MM-DD`
- `import_from_obsidian_daily_notes`
  - DayNest imports current Daily Notes settings as a starting point
  - imported values become DayNest settings
  - DayNest should not continuously mirror Obsidian Daily Notes automatically unless a later design explicitly chooses that

Recommended default MVP mode:

- `daynest_default`

## 4. Recommended Settings Fields

Suggested future settings shape:

```ts
interface DayNestDailyNoteUserSettings {
  mode: "custom" | "daynest_default" | "import_from_obsidian_daily_notes";
  dailyNoteFolder: string;
  dailyNoteDateFormat: string;
  appendSectionHeading: string;
  createIfMissing: boolean;
  importedFromObsidianDailyNotes?: boolean;
}
```

Field intent:

- `mode`
  - records how the current DayNest daily note strategy was chosen
- `dailyNoteFolder`
  - target folder for DayNest daily notes
- `dailyNoteDateFormat`
  - filename date format for DayNest daily notes
- `appendSectionHeading`
  - the heading DayNest owns when appending content to a daily note
- `createIfMissing`
  - whether DayNest is allowed to create a missing daily note later
- `importedFromObsidianDailyNotes?`
  - records whether settings were originally imported from Obsidian Daily Notes

## 5. Agent Setting-Change Flow

Future DayNest setting changes should use an explicit confirm-before-write flow.

Recommended flow:

1. user asks to change the daily note location or date format
2. DayNest Agent parses a setting-change intent
3. DayNest shows a compact confirmation summary
4. only after user confirms, DayNest updates its own settings

Example intent categories later:

- change daily note folder
- change daily note date format
- switch mode to `custom`
- import from Obsidian Daily Notes
- change append section heading

Conservative interaction rule:

- DayNest should never silently reinterpret casual text as a settings change

## 6. Safety Rules

Future DayNest daily note behavior must follow these rules:

- Agent must not silently modify settings
- never overwrite existing daily notes
- append only under a DayNest-owned section
- never modify Obsidian Daily Notes settings directly
- Obsidian Daily Notes import is optional
- DayNest settings must remain separate from MoodNest settings unless a later dedicated settings task approves shared structure
- if a target note exists, preserve existing note content
- if a DayNest-owned section is missing, add it conservatively

## 7. Future Implementation Notes

The later implementation should keep responsibilities separate.

Recommended boundaries:

- settings resolver should live outside serializers
- serializers stay pure
- repository uses the resolved target path later

Suggested future flow:

1. resolve effective DayNest daily note settings
2. resolve target note path from folder plus date format
3. decide whether create-if-missing is allowed
4. serialize DayNest content through pure Markdown serializers
5. append under the DayNest-owned heading

Specific purity rule:

- `src/daynest/core/daynestMarkdownSerializers.ts` should not read settings
- serializers should not use `app.vault`
- serializers should not know where files are stored

## 8. Import From Obsidian Daily Notes

Import from Obsidian Daily Notes should be treated as an optional one-time user action or explicit agent-confirmed action.

Recommended behavior:

- read current Obsidian Daily Notes values later, if supported
- copy those values into DayNest settings
- mark `importedFromObsidianDailyNotes: true`
- do not modify Obsidian Daily Notes settings
- do not assume future changes in Obsidian Daily Notes should silently propagate into DayNest

Reason:

- users need predictable DayNest behavior after import
- a one-time import is lower risk than continuous coupling

## 9. Open Questions

These questions should remain open for now:

- whether to support Periodic Notes later
- whether to support Obsidian Tasks-compatible syntax later
- whether to expose a command palette action to update DayNest settings
- whether DayNest should later offer a UI-only settings flow in addition to agent-confirmed changes
- whether DayNest should allow separate daily-log and task-storage folders
- whether imported Obsidian Daily Notes values should remain editable independently afterward

## 10. Conservative Conclusion

Recommended future direction:

- DayNest should have its own daily note settings
- DayNest should support `custom`, `daynest_default`, and `import_from_obsidian_daily_notes`
- Obsidian Daily Notes integration should be optional
- settings changes should always require confirmation
- serializers should remain pure and storage-agnostic

No runtime changes are approved by this document.
