"""Long-document handling: chunking, map-reduce condensing, keyword retrieval
and page-aware citations. Budgets come from settings (LLM_* env vars) so they can
be matched to the model's context window."""
import re
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

from app import llm
from app.settings import settings

# ── LONG-DOCUMENT HANDLING ───────────────────────────────────────────────────
# Instead of silently cutting documents at a fixed length, text that exceeds the
# direct-context budget is condensed with a map-reduce pass (every chunk is
# summarised, so late pages are still represented). Chat uses keyword retrieval
# over chunks so answers can come from anywhere in the document.

_condense_cache: dict = {}


def split_chunks(text: str, size: Optional[int] = None) -> list:
    """Split on paragraph/sentence boundaries into chunks of roughly `size` chars."""
    size = size or settings.llm_chunk_chars
    chunks, current = [], ""
    for para in re.split(r"(?<=\n)|(?<=[.!?])\s+", text):
        if not para:
            continue
        while len(para) > size:  # pathological text with no boundaries
            if current:
                chunks.append(current)
                current = ""
            chunks.append(para[:size])
            para = para[size:]
        if len(current) + len(para) > size and current:
            chunks.append(current)
            current = ""
        current += para + " "
    if current.strip():
        chunks.append(current)
    return [c.strip() for c in chunks if c.strip()]


def condense_text(text: str, budget: Optional[int] = None) -> str:
    """Return text unchanged if it fits `budget`; otherwise map-reduce it down."""
    budget = budget or settings.llm_max_direct_chars
    if len(text) <= budget:
        return text
    key = (hash(text), budget)
    if key in _condense_cache:
        return _condense_cache[key]

    chunks = split_chunks(text)
    condense_models = [settings.llm_condense_model] if settings.llm_condense_model else None
    per_chunk = max(500, budget // len(chunks))
    notes = [None] * len(chunks)

    def summarise(i):
        prompt = f"""Condense this section ({i + 1}/{len(chunks)}) of a longer document into dense notes of at most {per_chunk} characters.
Keep every key fact, figure, name, date, definition and argument. Preserve the original order. No preamble.

Section:
{chunks[i]}"""
        try:
            return llm.complete(prompt, models=condense_models).strip()[:per_chunk * 2]
        except (llm.LLMQuotaError, llm.LLMNotConfigured):
            raise  # no point condensing further; surface the real problem
        except Exception as e:
            print(f"[condense] chunk {i} failed, using truncated raw text: {e}")
            return chunks[i][:per_chunk]

    with ThreadPoolExecutor(max_workers=4) as pool:
        for i, note in enumerate(pool.map(summarise, range(len(chunks)))):
            notes[i] = f"[Part {i + 1}/{len(chunks)}]\n{note}"

    result = "\n\n".join(notes)[:budget * 2]
    if len(_condense_cache) > 32:
        _condense_cache.clear()
    _condense_cache[key] = result
    return result


def retrieve_context(question: str, text: str, budget: Optional[int] = None) -> str:
    """Pick the chunks most relevant to `question` (keyword/TF scoring), in document order."""
    budget = budget or settings.llm_chat_context_chars
    if len(text) <= budget:
        return text
    chunks = split_chunks(text, 3000)
    terms = {w for w in re.findall(r"[a-z0-9]{3,}", question.lower())}
    stop = {"the", "and", "what", "which", "that", "this", "with", "from", "for", "are", "was", "how", "why", "does", "about", "who", "when", "where"}
    terms -= stop

    def score(chunk):
        words = re.findall(r"[a-z0-9]{3,}", chunk.lower())
        if not words or not terms:
            return 0
        return sum(words.count(t) for t in terms) / (len(words) ** 0.5)

    ranked = sorted(range(len(chunks)), key=lambda i: score(chunks[i]), reverse=True)
    picked, used = {0}, len(chunks[0])  # always keep the opening for overall context
    for i in ranked:
        if i in picked:
            continue
        if used + len(chunks[i]) > budget:
            continue
        picked.add(i)
        used += len(chunks[i])
    return "\n\n[...]\n\n".join(chunks[i] for i in sorted(picked))



# ── PAGE-AWARE RETRIEVAL & CITATIONS ─────────────────────────────────────────
PAGE_RE = re.compile(r"\n?--- Page (\d+) ---\n")
_STOP = {"the", "and", "what", "which", "that", "this", "with", "from", "for", "are", "was", "how", "why", "does", "about", "who", "when", "where", "you", "can", "tell", "explain", "more"}


def parse_pages(text: str) -> list:
    """Split extracted text on its '--- Page N ---' markers -> [(page_number, body)]."""
    parts = PAGE_RE.split(text)
    return [(int(parts[i]), parts[i + 1].strip()) for i in range(1, len(parts) - 1, 2)]


def _terms(s: str) -> set:
    return set(re.findall(r"[a-z0-9]{3,}", s.lower())) - _STOP


def retrieve_pages(query: str, text: str, budget: Optional[int] = None):
    """Return (context, {page: full page text}) with excerpts labelled [Page N].
    Returns (None, {}) when the text has no page markers."""
    budget = budget or settings.llm_chat_context_chars
    pages = parse_pages(text)
    if not pages:
        return None, {}
    page_text = {n: body for n, body in pages}
    terms = _terms(query)

    units = []  # (page, order, chunk)
    for n, body in pages:
        for j, chunk in enumerate(split_chunks(body, 3000) or [""]):
            units.append((n, j, chunk))

    def score(chunk):
        words = re.findall(r"[a-z0-9]{3,}", chunk.lower())
        if not words or not terms:
            return 0
        return sum(words.count(t) for t in terms) / (len(words) ** 0.5)

    total = sum(len(u[2]) for u in units)
    if total <= budget:
        picked = set(range(len(units)))
    else:
        ranked = sorted(range(len(units)), key=lambda i: score(units[i][2]), reverse=True)
        picked, used = {0}, len(units[0][2])
        for i in ranked:
            if i in picked or used + len(units[i][2]) > budget:
                continue
            picked.add(i)
            used += len(units[i][2])

    out, last_page = [], None
    for i in sorted(picked):
        n, _, chunk = units[i]
        out.append(f"[Page {n}]\n{chunk}" if n != last_page else chunk)
        last_page = n
    included = {units[i][0] for i in picked}
    return "\n\n".join(out), {n: t for n, t in page_text.items() if n in included}


def extract_citations(answer: str, question: str, available: dict, limit: int = 6) -> list:
    """Collect [Page N] references from the answer, keep only pages that were
    actually in the context, and attach the best-matching sentence as evidence."""
    seen, pages = set(), []
    for m in re.finditer(r"\[Pages?\s*([\d,\s\-–and]+)\]", answer, flags=re.IGNORECASE):
        body = m.group(1)
        nums = []
        for rng in re.finditer(r"(\d+)\s*[-–]\s*(\d+)", body):
            a, b = int(rng.group(1)), int(rng.group(2))
            if 0 <= b - a <= 10:
                nums.extend(range(a, b + 1))
        nums.extend(int(x) for x in re.findall(r"\d+", re.sub(r"\d+\s*[-–]\s*\d+", "", body)))
        for n in nums:
            if n in available and n not in seen:
                seen.add(n)
                pages.append(n)
    terms = _terms(question) | _terms(answer)
    citations = []
    for n in pages[:limit]:
        sentences = [x.strip() for x in re.split(r"(?<=[.!?])\s+|\n+", available[n]) if len(x.strip()) > 20]
        best = max(sentences, key=lambda x: len(_terms(x) & terms), default=available[n][:200])
        citations.append({"page": n, "snippet": best[:240]})
    return citations
