"""The AI tools: one function per tool, each building a prompt and parsing the
model's JSON. ``run_tool`` dispatches by name."""
import json
import re
from concurrent.futures import ThreadPoolExecutor

from app import images, llm
from app.settings import settings
from app.rag import condense_text, extract_citations, retrieve_context, retrieve_pages

def parse_json(text: str):
    cleaned = re.sub(r"```(?:json)?\s*", "", text).replace("```", "").strip()
    # Find first [ or { and last ] or }
    start = min((cleaned.find("{"), cleaned.find("[") if "[" in cleaned else len(cleaned)), key=lambda x: x if x >= 0 else len(cleaned))
    if "{" in cleaned and (cleaned.find("{") <= cleaned.find("[") if "[" in cleaned else True):
        end = cleaned.rfind("}") + 1
    else:
        end = cleaned.rfind("]") + 1
    return json.loads(cleaned[start:end])



def gen_mindmap(title: str, text: str) -> dict:
    prompt = f"""You are a NotebookLM-style AI. Analyze this document and produce a detailed hierarchical mind map as JSON.

Document: {title}
Text: {text}

Return ONLY valid JSON (no markdown fences):
{{
  "id": "root-node",
  "label": "<document title>",
  "category": "Core Theme",
  "description": "<one sentence summary>",
  "children": [
    {{
      "id": "sec-1", "label": "<major section>", "category": "<type>", "description": "<detail>",
      "children": [
        {{"id": "s1-1", "label": "<subtopic>", "category": "<type>", "description": "<fact from doc>"}},
        {{"id": "s1-2", "label": "<subtopic>", "category": "<type>", "description": "<fact from doc>"}},
        {{"id": "s1-3", "label": "<subtopic>", "category": "<type>", "description": "<fact from doc>"}}
      ]
    }},
    {{
      "id": "sec-2", "label": "<major section>", "category": "<type>", "description": "<detail>",
      "children": [
        {{"id": "s2-1", "label": "<subtopic>", "category": "<type>", "description": "<fact>"}},
        {{"id": "s2-2", "label": "<subtopic>", "category": "<type>", "description": "<fact>"}},
        {{"id": "s2-3", "label": "<subtopic>", "category": "<type>", "description": "<fact>"}}
      ]
    }},
    {{
      "id": "sec-3", "label": "<major section>", "category": "<type>", "description": "<detail>",
      "children": [
        {{"id": "s3-1", "label": "<subtopic>", "category": "<type>", "description": "<fact>"}},
        {{"id": "s3-2", "label": "<subtopic>", "category": "<type>", "description": "<fact>"}}
      ]
    }}
  ]
}}
Every label and description must be grounded in actual document content. No placeholders."""
    return parse_json(llm.complete(prompt, json_mode=True, expect="object"))


def gen_audio(title: str, text: str, length_mode: str = "standard", tone: str = "casual") -> list:
    turn_counts = {"quick": 6, "standard": 12, "deep": 20}
    num_turns = turn_counts.get(length_mode, 12)

    tone_instructions = {
        "casual": "Lively, natural conversational banter. Alex and Jordan use intuitive everyday analogies, humor, and friendly reactions.",
        "analytical": "Rigorous, technical and analytical discussion. Alex and Jordan cite specific data, methodologies, and architectural details.",
        "debate": "Friendly intellectual debate. Alex and Jordan challenge each other with devil's advocate points, counterarguments, and trade-offs."
    }
    tone_guide = tone_instructions.get(tone, tone_instructions["casual"])

    prompt = f"""You are generating a NotebookLM "Audio Overview" podcast.
Hosts: Alex (Host A) and Jordan (Host B).
Tone & Style: {tone_guide}

Document: {title}
Text: {text}

Generate EXACTLY {num_turns} dialogue turns. Return ONLY a valid JSON array (no markdown fences):
[
  {{"speaker": "Host A (Alex)", "text": "<dialogue grounded in document>", "timestamp": "00:04"}},
  {{"speaker": "Host B (Jordan)", "text": "<dialogue grounded in document>", "timestamp": "00:28"}},
  ...
]
Reference actual facts, figures, and arguments from the document. Timestamps increment naturally (roughly every 20-25 seconds)."""
    return parse_json(llm.complete(prompt, json_mode=True, expect="array"))


def gen_slides(title: str, text: str, slide_count: int = 7, theme: str = "light_slate") -> list:
    count = max(3, min(16, int(slide_count)))
    prompt = f"""You are a professional AI presentation designer. Create a slide deck from this document with EXACTLY {count} slides.
Document: {title}
Text: {text}

Return ONLY a valid JSON array of {count} slides (no markdown fences):
[
  {{
    "id": 1, "title": "<title>", "subtitle": "<subtitle>",
    "type": "title",
    "bullets": ["<bullet 1>", "<bullet 2>", "<bullet 3>"],
    "speakerNotes": "<notes grounded in document>"
  }},
  ...
]
Types: "title" for slide 1, "content" for body slides, "summary" for final slide {count}. All content from actual document."""
    slides = parse_json(llm.complete(prompt, json_mode=True, expect="array"))
    return slides[:count]


def gen_slides_with_images(title: str, text: str, slide_count: int = 7, theme: str = "light_slate") -> list:
    """Generate slides with AI image prompts via Gemini, then build Pollinations.ai image URLs matching the chosen theme."""
    count = max(3, min(16, int(slide_count)))
    theme_modifiers = {
        "light_slate": "clean corporate photography, soft bright studio lighting, ultra sharp, 8k",
        "dark_obsidian": "dark atmospheric cyberpunk, glowing cyan volumetric lighting, octane 3d render, 8k",
        "corporate_navy": "sleek architectural boardroom, modern minimalism, deep blue tones, crisp lighting",
        "sunset_warmth": "warm golden hour sunlight, architectural editorial photography, warm amber tones, 8k",
        "emerald_minimalist": "biophilic organic design, minimalist clean studio, soft diffuse emerald lighting, 8k",
    }
    modifier = theme_modifiers.get(theme, theme_modifiers["light_slate"])

    prompt = f"""You are a professional AI presentation designer. Create a visual slide deck from this document with EXACTLY {count} slides.

Document: {title}
Text: {text}

Return ONLY a valid JSON array of {count} slides (no markdown fences):
[
  {{
    "id": 1, "title": "<title>", "subtitle": "<subtitle>",
    "type": "title",
    "bullets": ["<bullet 1>", "<bullet 2>", "<bullet 3>"],
    "speakerNotes": "<notes grounded in document>",
    "imagePrompt": "<vivid 10-15 word visual scene description, no text, cinematic lighting>"
  }},
  ...
]
Types: "title" for slide 1, "content" for body slides, "summary" for final slide {count}.
All content must be grounded in actual document content. imagePrompt must be a vivid visual scene."""

    slides = parse_json(llm.complete(prompt, json_mode=True, expect="array"))
    slides = slides[:count]

    # Build a Pollinations URL for each slide. Each call also warms the image
    # (~5s each), so run them in parallel instead of one after another.
    def build(i_slide):
        i, slide = i_slide
        img_prompt = slide.get("imagePrompt", f"{title} concept, visual illustration")
        return images.image_for_prompt(f"{img_prompt}, {modifier}", width=1280, height=720, seed=i * 17 + 7, model="flux-realism")

    with ThreadPoolExecutor(max_workers=8) as pool:
        urls = list(pool.map(build, enumerate(slides)))
    for slide, url in zip(slides, urls):
        slide["imageUrl"] = url
        slide["imageData"] = url
        slide["theme"] = theme

    return slides


def gen_infographic(title: str, text: str) -> dict:
    """Generate a structured, interactive infographic with AI hero image illustration."""
    prompt = f"""You are an expert data visualization and infographic designer. Analyze this document and create a richly structured infographic layout.

Document: {title}
Text: {text}

Return ONLY valid JSON (no markdown fences):
{{
  "title": "<concise document title, max 8 words>",
  "subtitle": "<one powerful sentence summarizing the document>",
  "accentColor": "<a vivid hex color that fits the topic, e.g. #6366f1>",
  "accentColor2": "<a second complementary hex color, e.g. #8b5cf6>",
  "heroPrompt": "<vivid 10-15 word image prompt for an abstract visual header graphic representing the core topic, e.g. futuristic neural network banner, dark background>",
  "stats": [
    {{"label": "<metric name>", "value": "<number or short value>", "icon": "<single relevant emoji>", "desc": "<8-word context>"}},
    {{"label": "<metric name>", "value": "<value>", "icon": "<emoji>", "desc": "<8-word context>"}},
    {{"label": "<metric name>", "value": "<value>", "icon": "<emoji>", "desc": "<8-word context>"}},
    {{"label": "<metric name>", "value": "<value>", "icon": "<emoji>", "desc": "<8-word context>"}}
  ],
  "sections": [
    {{"title": "<section name>", "summary": "<2-sentence summary from doc>", "icon": "<emoji>", "color": "#6366f1"}},
    {{"title": "<section name>", "summary": "<2-sentence summary>", "icon": "<emoji>", "color": "#8b5cf6"}},
    {{"title": "<section name>", "summary": "<2-sentence summary>", "icon": "<emoji>", "color": "#ec4899"}}
  ],
  "timeline": [
    {{"step": 1, "label": "<phase or step name>", "desc": "<one sentence>"}},
    {{"step": 2, "label": "<phase or step name>", "desc": "<one sentence>"}},
    {{"step": 3, "label": "<phase or step name>", "desc": "<one sentence>"}},
    {{"step": 4, "label": "<phase or step name>", "desc": "<one sentence>"}}
  ],
  "keyInsight": "<one powerful takeaway quote or key insight from the document, 15-25 words>"
}}

All fields must be grounded in actual document content. No placeholders."""

    data = parse_json(llm.complete(prompt, json_mode=True, expect="object"))

    # Generate an AI hero illustration image for the infographic banner using Pollinations
    hero_prompt = data.get("heroPrompt", f"{title} technology visualization, 3d abstract render, neon accent, dark navy background")
    full_prompt = f"{hero_prompt}, 3d render, isometric, 8k, dark moody atmosphere, glowing neon"
    data["heroImage"] = images.image_for_prompt(full_prompt, width=1200, height=450, seed=123, model="flux-3d")

    return data


def gen_study_guide(title: str, text: str) -> dict:
    prompt = f"""Create a study guide from this document. Return ONLY valid JSON (no markdown fences):
{{
  "flashcards": [
    {{"id": "fc-1", "question": "<question from doc>", "answer": "<answer from doc>", "category": "<topic>", "mastered": false}},
    {{"id": "fc-2", "question": "<question>", "answer": "<answer>", "category": "<topic>", "mastered": false}},
    {{"id": "fc-3", "question": "<question>", "answer": "<answer>", "category": "<topic>", "mastered": false}},
    {{"id": "fc-4", "question": "<question>", "answer": "<answer>", "category": "<topic>", "mastered": false}},
    {{"id": "fc-5", "question": "<question>", "answer": "<answer>", "category": "<topic>", "mastered": false}},
    {{"id": "fc-6", "question": "<question>", "answer": "<answer>", "category": "<topic>", "mastered": false}}
  ],
  "quiz": [
    {{
      "id": "q-1", "question": "<question>",
      "options": ["<A>", "<B>", "<C>", "<D>"],
      "correctIndex": 0,
      "explanation": "<explanation citing doc>"
    }},
    {{"id": "q-2", "question": "<question>", "options": ["<A>","<B>","<C>","<D>"], "correctIndex": 0, "explanation": "<explanation>"}},
    {{"id": "q-3", "question": "<question>", "options": ["<A>","<B>","<C>","<D>"], "correctIndex": 1, "explanation": "<explanation>"}},
    {{"id": "q-4", "question": "<question>", "options": ["<A>","<B>","<C>","<D>"], "correctIndex": 2, "explanation": "<explanation>"}}
  ]
}}

Document: {title}
Text: {text}

All questions and answers must be grounded in the actual document content."""
    return parse_json(llm.complete(prompt, json_mode=True, expect="object"))


def answer_question(question: str, title: str, text: str, history: list = None) -> dict:
    history = history or []
    convo = ""
    for m in history[-8:]:
        who = "User" if m.get("sender") == "user" else "Assistant"
        convo += f"{who}: {str(m.get('text', ''))[:1500]}\n"
    if convo:
        convo = f"\nConversation so far (for resolving follow-up references):\n{convo}\n"

    # Follow-ups like "explain that more" retrieve poorly, so include the last user turn.
    last_user = next((m.get("text", "") for m in reversed(history) if m.get("sender") == "user"), "")
    query = f"{question} {last_user}"

    context, available = retrieve_pages(query, text)
    paged = context is not None
    if not paged:
        context = retrieve_context(query, text)

    cite_rule = (
        "The document is given as excerpts labelled [Page N]. After each claim, cite the page it came from "
        "in the form [Page N] (e.g. [Page 3] or [Page 3, 5]). Only cite pages that appear below; never invent a page."
        if paged else "Cite specific sections when possible."
    )
    prompt = f"""You are a document assistant. Answer this question strictly based on the document provided. {cite_rule}

Document: {title}
Text: {context}
{convo}
Question: {question}

Give a clear, accurate, detailed answer. If not in the document, say so honestly."""
    answer = llm.complete(prompt).strip()
    citations = extract_citations(answer, query, available) if paged else []
    return {"sender": "assistant", "text": answer, "citations": citations}


def gen_report(title: str, text: str) -> dict:
    prompt = f"""Create a comprehensive executive report from this document. Return ONLY valid JSON (no markdown fences):
{{
  "reportTitle": "<concise title, max 10 words>",
  "reportType": "Detailed",
  "executiveSummary": "<3-4 sentence executive summary of the document>",
  "keyFindings": [
    "<finding 1 — a specific, data-grounded insight>",
    "<finding 2>",
    "<finding 3>",
    "<finding 4>",
    "<finding 5>"
  ],
  "sections": [
    {{"title": "<section heading>", "content": "<2-3 paragraph detailed analysis for this section>"}},
    {{"title": "<section heading>", "content": "<2-3 paragraph detailed analysis>"}},
    {{"title": "<section heading>", "content": "<2-3 paragraph detailed analysis>"}}
  ],
  "strategicRecommendations": [
    "<actionable recommendation 1>",
    "<actionable recommendation 2>",
    "<actionable recommendation 3>"
  ],
  "riskAnalysis": [
    {{"risk": "<risk name>", "severity": "High|Medium|Low", "mitigation": "<mitigation strategy>"}},
    {{"risk": "<risk name>", "severity": "High|Medium|Low", "mitigation": "<mitigation strategy>"}}
  ],
  "conclusion": "<2-3 sentence conclusion with key takeaway>"
}}

Document: {title}
Text: {text}

All content must be grounded in the actual document. No placeholders."""
    return parse_json(llm.complete(prompt, json_mode=True, expect="object"))


def gen_data_table(title: str, text: str) -> dict:
    prompt = f"""Extract structured tabular data from this document. Identify key metrics, comparisons, specifications, or any data that can be organized in a table format. Return ONLY valid JSON (no markdown fences):
{{
  "tableTitle": "<descriptive table title>",
  "description": "<one sentence describing what this table captures>",
  "columns": ["<Column 1 Name>", "<Column 2 Name>", "<Column 3 Name>", "<Column 4 Name>"],
  "rows": [
    {{"<Column 1 Name>": "<value>", "<Column 2 Name>": "<value>", "<Column 3 Name>": "<value>", "<Column 4 Name>": "<value>"}},
    {{"<Column 1 Name>": "<value>", "<Column 2 Name>": "<value>", "<Column 3 Name>": "<value>", "<Column 4 Name>": "<value>"}},
    {{"<Column 1 Name>": "<value>", "<Column 2 Name>": "<value>", "<Column 3 Name>": "<value>", "<Column 4 Name>": "<value>"}},
    {{"<Column 1 Name>": "<value>", "<Column 2 Name>": "<value>", "<Column 3 Name>": "<value>", "<Column 4 Name>": "<value>"}},
    {{"<Column 1 Name>": "<value>", "<Column 2 Name>": "<value>", "<Column 3 Name>": "<value>", "<Column 4 Name>": "<value>"}},
    {{"<Column 1 Name>": "<value>", "<Column 2 Name>": "<value>", "<Column 3 Name>": "<value>", "<Column 4 Name>": "<value>"}}
  ],
  "summary": "<2 sentence summary of the key patterns or insights from this data>"
}}

Document: {title}
Text: {text}

Extract real data from the document. Create 4-6 meaningful columns and 5-8 rows minimum. All values must be grounded in actual document content."""
    return parse_json(llm.complete(prompt, json_mode=True, expect="object"))


def gen_project_synthesis(texts: list) -> dict:
    per_doc = max(4000, settings.llm_max_direct_chars // max(1, len(texts)))
    combined = "\n\n---DOCUMENT SEPARATOR---\n\n".join(
        [f"[{t['title']}]:\n{condense_text(t.get('text', '') or '', per_doc)}" for t in texts]
    )
    prompt = f"""You are analyzing multiple documents together. Create a cross-document synthesis report. Return ONLY valid JSON (no markdown fences):
{{
  "synthesisTitle": "<title for the cross-document analysis>",
  "documentCount": {len(texts)},
  "documentsAnalyzed": {json.dumps([str(t.get('title', '')) for t in texts], ensure_ascii=False)},
  "commonThemes": [
    {{"theme": "<shared theme across documents>", "evidence": "<specific examples from multiple docs>"}},
    {{"theme": "<shared theme>", "evidence": "<examples>"}},
    {{"theme": "<shared theme>", "evidence": "<examples>"}}
  ],
  "contradictions": [
    {{"topic": "<where documents disagree>", "docA": "<position from doc A>", "docB": "<position from doc B>"}}
  ],
  "uniqueInsights": [
    {{"document": "<doc name>", "insight": "<unique insight only found in this document>"}},
    {{"document": "<doc name>", "insight": "<unique insight>"}}
  ],
  "overallSynthesis": "<3-4 sentence unified summary combining insights from all documents>",
  "recommendations": ["<recommendation 1>", "<recommendation 2>", "<recommendation 3>"]
}}

Documents:
{combined}

All analysis must be grounded in actual document content. Identify real overlaps and differences."""
    return parse_json(llm.complete(prompt, json_mode=True, expect="object"))


# ── Registry ─────────────────────────────────────────────────────────────────

DOC_TOOLS = ("mindmap", "audio", "slides", "slides_img", "infographic", "report", "datatable", "studyguide")
PROJECT_TOOLS = ("synthesis",)
TOOLS = DOC_TOOLS + PROJECT_TOOLS


TOOL_OPTIONS = {
    "slides": ("slideCount", "theme"),
    "slides_img": ("slideCount", "theme"),
    "audio": ("audioLength", "audioTone"),
}


def relevant_options(tool: str, options: dict) -> dict:
    """Only the options that change a tool's output (keeps cache keys stable)."""
    return {k: options[k] for k in TOOL_OPTIONS.get(tool, ()) if options.get(k) not in (None, "")}


def _clean_title(title: str) -> str:
    return re.sub(r"\.pdf$", "", title or "Document", flags=re.IGNORECASE)


def run_doc_tool(tool: str, title: str, raw_text: str, options: dict) -> object:
    """Run one per-document tool (blocking: call from a worker thread)."""
    llm.require_configured()  # fail fast instead of N failed condense calls
    slide_count = int(options.get("slideCount") or 7)
    theme = str(options.get("theme") or "light_slate")
    text = condense_text(raw_text)
    t = _clean_title(title)
    if tool == "mindmap":
        return gen_mindmap(t, text)
    if tool == "audio":
        return gen_audio(t, text, length_mode=str(options.get("audioLength") or "standard"),
                         tone=str(options.get("audioTone") or "casual"))
    if tool == "slides":
        return gen_slides(t, text, slide_count=slide_count, theme=theme)
    if tool == "slides_img":
        return gen_slides_with_images(t, text, slide_count=slide_count, theme=theme)
    if tool == "infographic":
        return gen_infographic(t, text)
    if tool == "report":
        return gen_report(t, text)
    if tool == "datatable":
        return gen_data_table(t, text)
    if tool == "studyguide":
        return gen_study_guide(t, text)
    raise ValueError(f"Unknown tool: {tool}")


def run_synthesis(documents: list) -> dict:
    llm.require_configured()
    return gen_project_synthesis(documents)

