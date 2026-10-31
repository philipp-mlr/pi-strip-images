# pi-strip-images

[pi](https://github.com/earendil-works/pi) extension that strips image blocks
from the model context, so conversations containing screenshots keep working
when you switch to a text-only model (e.g. Z.ai GLM-5.3, which rejects image
content with `400 code 1210 "messages.content.type is invalid, allowed
values: ['text']"`).

## Install

```bash
# from git
pi install git:github.com/philipp-mlr/pi-strip-images

# or from npm (once published)
pi install npm:pi-strip-images
```

## Usage

```bash
/strip-images        # stage image removal for the current context
```

The command scans the active context for image blocks (pasted screenshots,
`read` results on image files, browser screenshots) and stages edits that
replace them with text placeholders:

- user / custom messages: `[image removed: <mime>]` — surrounding text is kept
- tool results: `[image removed: tool result from <toolName>]`

The staged edits apply at the end of the current run (pi `context_edit`
entries). If the last request failed with a provider error (the 1210 case),
the same prompt is retried once — now without images.

Typical flow:

```
> /model zai/glm-5.3                          # switch to the text-only model
> /strip-images                               # stage cleanup
> continue with the refactor                  # 1210 flashes, cleanup applies, retry is clean
```

## What it does *not* do

- Your raw session history is untouched — images stay in the session file and
  on screen; only what is sent to the model changes. Re-running
  `/strip-images` later (e.g. after a future transcription feature) is safe.
- It does not delete anything, does not auto-trigger, and does not transcribe
  image contents to text (planned: `--describe` flag routing images through a
  vision model such as GLM-5.3-Flash).

## How it works

pi sessions are append-only trees. This extension proposes `context_edit`
entries at actionable boundaries (`turn_end` / `agent_before_settle`) — the
same sanctioned mechanism pi itself uses for overflow recovery. Edits change
only future model context, never the recorded transcript.

## License

MIT
