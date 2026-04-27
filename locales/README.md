# Utterlog Locales

Utterlog ships built-in locale files for `zh-CN`, `en-US`, and `ru-RU`.
Custom files placed in this directory are loaded by the API at runtime and
override or extend the built-ins.

Production path:

```text
/opt/utterlog/locales/<locale>.json
```

You can also set `UTTERLOG_LOCALE_DIR` to point to another directory.

Locale file format:

```json
{
  "locale": "en-US",
  "name": "English",
  "native_name": "English",
  "direction": "ltr",
  "version": "1",
  "messages": {
    "common.home": "Home",
    "post.words": "{count} words"
  }
}
```

Rules:

- File name should be `<locale>.json`, for example `en-US.json`.
- `messages` is a flat key/value map.
- Missing keys fall back to `zh-CN`.
- A custom file with the same locale overrides built-in messages.
- A custom file with a new locale appears automatically in the admin language selector.
