# DayNest Daily Note Template And Language Design v1

## 1. Purpose

This document defines a conservative future design for:

- DayNest daily-note integration modes
- DayNest user-configurable daily-note settings
- DayNest language settings
- DayNest template settings

This is a documentation-only design step.

Confirmed boundaries:

- existing MoodNest behavior must remain unchanged
- DayNest settings should remain separate from MoodNest settings
- Obsidian Daily Notes integration should remain optional
- no runtime implementation is approved by this document

## 2. Daily Note Integration Modes

DayNest should support three clearly distinct integration modes later.

### `daynest_only`

Purpose:

- keep DayNest writing only into its own DayNest daily-note space

Suggested default path:

- `NestHub/DayNest/daily/YYYY-MM-DD.md`

Characteristics:

- safest default
- minimal coupling to existing vault daily-note habits
- easiest to test and debug
- easiest to keep separate from MoodNest

### `write_to_existing_daily_note`

Purpose:

- append DayNest content into the user-selected daily-note folder and naming convention

Behavior:

- resolve the user-configured daily note path
- append only under a DayNest-owned section
- preserve all non-DayNest note content

Characteristics:

- stronger integration with existing daily-note workflows
- higher risk than `daynest_only`
- requires more careful write safety

### `linked_notes`

Purpose:

- keep the DayNest note separate while adding navigation links between the DayNest note and the user’s daily note

Behavior:

- create or update the DayNest-owned daily note
- optionally add a link from the DayNest note to the user’s daily note
- optionally add a DayNest section link in the user’s daily note later

Characteristics:

- preserves DayNest separation
- provides integration without fully merging note content
- may be a good middle path after MVP

## 3. User-Configurable Daily Note Settings

Suggested future settings shape:

```ts
interface DayNestDailyNoteUserSettings {
  integrationMode:
    | "daynest_only"
    | "write_to_existing_daily_note"
    | "linked_notes";
  dailyNoteFolder: string;
  dailyNoteDateFormat: string;
  appendSectionHeading: string;
  createIfMissing: boolean;
  importedFromObsidianDailyNotes?: boolean;
}
```

Field intent:

- `integrationMode`
  - controls which daily-note strategy DayNest follows
- `dailyNoteFolder`
  - target folder for note resolution
- `dailyNoteDateFormat`
  - target date pattern for note resolution
- `appendSectionHeading`
  - the section heading DayNest owns when appending content
- `createIfMissing`
  - whether DayNest may create the resolved target note
- `importedFromObsidianDailyNotes?`
  - records whether the current settings originally came from an Obsidian Daily Notes import

Conservative MVP recommendation:

- default to `daynest_only`
- keep `dailyNoteFolder` defaulting to `NestHub/DayNest/daily`
- keep `dailyNoteDateFormat` defaulting to `YYYY-MM-DD`

## 4. Language Settings

DayNest should support a small, explicit language setting for user-facing built-in templates.

Suggested language union:

- `language: "zh-CN" | "en-US"`

Purpose:

- allow built-in DayNest daily log output to feel natural in the user’s language
- avoid hardcoding one language into all future built-in template output

### Chinese built-in template

Suggested direction:

- concise
- natural for note-taking
- compatible with DayNest append blocks

Possible shape later:

```md
## 日记摘要
{{summary}}

## 备注
{{notes}}
```

### English built-in template

Suggested direction:

- concise
- plain Markdown
- structurally parallel to the Chinese built-in version

Possible shape later:

```md
## Summary
{{summary}}

## Notes
{{notes}}
```

### Custom template override later

DayNest should reserve the option for a future custom template override, but this should not be part of the first runtime batch.

## 5. Template Settings

Suggested template settings:

```ts
interface DayNestTemplateSettings {
  templateMode: "builtin" | "custom";
  customTemplate?: string;
}
```

### Template modes

`builtin`

- use a DayNest-provided language-aware template

`custom`

- use a user-supplied template string later

### Supported safe variables for MVP

The initial safe variable surface should be intentionally small:

- `{{date}}`
- `{{createdAt}}`
- `{{updatedAt}}`
- `{{summary}}`
- `{{notes}}`
- `{{wins}}`
- `{{blockers}}`
- `{{id}}`

Conservative rendering rule:

- unsupported variables should remain untouched or be rendered as empty by explicit design later
- DayNest should not try to be a general-purpose template engine

## 6. Safety Rules

Future template and daily-note integration work must follow these rules:

- do not execute JavaScript in templates
- do not add Templater script execution
- do not overwrite existing daily-note content
- append only under a DayNest-owned section
- do not silently modify Obsidian Daily Notes settings
- agent-triggered settings changes must require explicit confirmation
- serializers and template renderers must remain pure
- do not mix DayNest settings into MoodNest settings in this batch
- do not add hidden fallback writes to multiple note targets
- do not allow template rendering to read arbitrary files or vault state

## 7. Integration Strategy Notes

Recommended strategy by phase:

### Phase 1

- keep `daynest_only` as the runtime default
- validate storage, append safety, and template rendering in isolation

### Phase 2

- add optional `write_to_existing_daily_note`
- require explicit user configuration
- preserve append-only safety

### Phase 3

- evaluate `linked_notes`
- decide whether linked mode is a better long-term default than merged writes

## 8. Future Implementation Sequence

Recommended order:

1. design doc
2. isolated settings types
3. pure template renderer
4. renderer safety review
5. settings persistence adapter
6. settings UI later

Reason:

- keeps risky write behavior behind prior type and rendering review
- avoids mixing rendering logic with UI too early
- allows each layer to be tested in isolation

## 9. Open Questions

These should remain open for now:

- whether `linked_notes` should add a backlink into the user’s daily note or only into the DayNest note
- whether built-in templates should include headings by default or render only content blocks
- whether `notes`, `wins`, and `blockers` should render as bullet lists or paragraphs in built-in templates
- whether unsupported variables in custom templates should remain literal or resolve to empty strings
- whether DayNest should later support more languages beyond `zh-CN` and `en-US`
- whether `write_to_existing_daily_note` should ever become the default for imported Daily Notes users
- whether template preview should exist before settings UI is implemented

## 10. Conservative Conclusion

Recommended future direction:

- keep `daynest_only` as the initial safe default
- make Obsidian Daily Notes integration optional
- keep language-aware built-in templates small and explicit
- delay custom template execution until a pure renderer and safety review exist
- keep DayNest settings separate from MoodNest settings

No runtime changes are approved by this document.
