"""Render a Claude Code session transcript (JSONL) into PROMPTS.md.

Every user prompt and every assistant reply is copied verbatim. Tool calls are
included with their full inputs inside collapsible blocks. Omitted (see the
header written into PROMPTS.md): tool *outputs*, images, the model's private
reasoning blocks, internal bookkeeping entries, and sub-agent side-chains.

Usage:
    python3 scripts/export_prompts.py <session.jsonl> [PROMPTS.md] [--redact TEXT ...]

--redact replaces each exact TEXT (e.g. a personal email) with "[redacted]";
the header states how many replacements were made.
"""

import json
import sys
from datetime import datetime
from pathlib import Path

FENCE = "````"  # four backticks so fenced code inside messages survives


def text_of(content: object) -> str:
    if isinstance(content, str):
        return content
    parts = []
    for block in content or []:  # type: ignore[union-attr]
        if block.get("type") == "text":
            parts.append(block["text"])
        elif block.get("type") == "image":
            parts.append("*[image attached — omitted from this export]*")
    return "\n\n".join(parts)


def render(entries: list[dict], redactions: dict[str, int] | None = None) -> str:
    out: list[str] = []
    session_id = next((e.get("sessionId") for e in entries if e.get("sessionId")), "unknown")
    models = sorted(
        {
            e["message"].get("model")
            for e in entries
            if e.get("type") == "assistant" and e["message"].get("model")
        }
        - {"<synthetic>"}
    )
    stamps = [e["timestamp"] for e in entries if e.get("timestamp")]
    out.append("# PROMPTS.md — raw AI chat log\n")
    out.append(
        "Exported verbatim from the Claude Code session transcript by "
        "`scripts/export_prompts.py`. Nothing in the prompts or replies below was edited.\n"
    )
    out.append(f"- **Tool:** Claude Code (CLI), model(s): {', '.join(models) or 'unknown'}")
    out.append(f"- **Session:** `{session_id}`")
    if stamps:
        out.append(f"- **Span:** {min(stamps)} → {max(stamps)} (UTC)")
    out.append(f"- **Exported:** {datetime.now().astimezone().isoformat(timespec='seconds')}")
    out.append(
        "- **Omitted:** tool outputs (command results, file reads), images/screenshots, the "
        "model's private reasoning blocks, harness bookkeeping, and sub-agent side-chains. "
        "Tool *calls* are shown with their full input."
    )
    if redactions:
        total = sum(redactions.values())
        out.append(f"- **Redacted:** {total} occurrence(s) of personal data replaced with `[redacted]`.")
    out.append("")
    out.append("---\n")

    turn = 0
    for e in entries:
        kind = e.get("type")
        if kind not in ("user", "assistant") or e.get("isSidechain"):
            continue
        content = e["message"]["content"]
        if kind == "user":
            if e.get("isMeta"):
                continue
            if isinstance(content, list) and all(b.get("type") == "tool_result" for b in content):
                continue
            text = text_of(content).strip()
            if not text:
                continue
            turn += 1
            out.append(f"## 🧑 User — turn {turn}  \n<sub>{e.get('timestamp', '')}</sub>\n")
            out.append(f"{FENCE}text\n{text}\n{FENCE}\n")
        else:
            for block in content:
                if block.get("type") == "text" and block["text"].strip():
                    out.append(f"### 🤖 Claude  \n<sub>{e.get('timestamp', '')}</sub>\n")
                    out.append(block["text"].strip() + "\n")
                elif block.get("type") == "tool_use":
                    inp = block.get("input", {})
                    label = inp.get("description") or inp.get("file_path") or ""
                    out.append(
                        f"<details><summary>🔧 Tool call: <code>{block['name']}</code>"
                        f"{' — ' + label if label else ''}</summary>\n"
                    )
                    out.append(f"{FENCE}json\n{json.dumps(inp, indent=2, ensure_ascii=False)}\n{FENCE}\n")
                    out.append("</details>\n")
    return "\n".join(out)


def main() -> None:
    args = sys.argv[1:]
    redact: list[str] = []
    if "--redact" in args:
        index = args.index("--redact")
        redact, args = args[index + 1 :], args[:index]
    if not args:
        sys.exit(__doc__)
    source = Path(args[0]).expanduser()
    target = Path(args[1] if len(args) > 1 else "PROMPTS.md")
    raw = source.read_text()
    counts = {term: raw.count(term) for term in redact}
    for term in redact:
        raw = raw.replace(term, "[redacted]")
    entries = [json.loads(line) for line in raw.splitlines() if line.strip()]
    target.write_text(render(entries, {t: c for t, c in counts.items() if c}))
    print(f"Wrote {target} from {source.name}")


if __name__ == "__main__":
    main()
