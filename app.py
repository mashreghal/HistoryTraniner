import os
import json
import hashlib
from pathlib import Path

from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
import anthropic

load_dotenv(Path(__file__).resolve().parent / ".env", override=True)

app = Flask(__name__)
client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

CACHE_DIR = Path("data/cache")
CACHE_DIR.mkdir(parents=True, exist_ok=True)

MODEL = "claude-sonnet-4-20250514"


def get_cache_path(key: str) -> Path:
    hashed = hashlib.md5(key.encode()).hexdigest()
    return CACHE_DIR / f"{hashed}.json"


def get_cached(key: str):
    path = get_cache_path(key)
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return None


def set_cached(key: str, data):
    path = get_cache_path(key)
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")


def ask_claude(prompt: str, system: str = "") -> str:
    messages = [{"role": "user", "content": prompt}]
    kwargs = {"model": MODEL, "max_tokens": 4096, "messages": messages}
    if system:
        kwargs["system"] = system
    response = client.messages.create(**kwargs)
    return response.content[0].text


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/curriculum", methods=["POST"])
def curriculum():
    data = request.json
    era = data.get("era", "Ancient Rome")

    cache_key = f"curriculum:{era}"
    cached = get_cached(cache_key)
    if cached:
        return jsonify(cached)

    system = (
        "You are a history education expert. You create structured curricula "
        "for self-learners. Always respond with valid JSON only, no markdown."
    )
    prompt = f"""Create a curriculum for learning about {era}.
Break it down into 15-20 topics in chronological order. Each topic should be
a key event, period, or figure that can be covered in a ~5 minute reading.

Respond with this exact JSON format:
{{
    "era": "{era}",
    "description": "Brief 1-2 sentence overview of this era",
    "topics": [
        {{
            "id": 1,
            "title": "Topic title",
            "subtitle": "Brief one-line description",
            "year_range": "e.g. 753 BC or 264-146 BC",
            "difficulty": "beginner"
        }}
    ]
}}

Make topics progress from earliest to latest. Use "beginner" difficulty for all."""

    try:
        result = ask_claude(prompt, system)
        parsed = json.loads(result)
        set_cached(cache_key, parsed)
        return jsonify(parsed)
    except json.JSONDecodeError:
        start = result.find("{")
        end = result.rfind("}") + 1
        if start != -1 and end > start:
            parsed = json.loads(result[start:end])
            set_cached(cache_key, parsed)
            return jsonify(parsed)
        return jsonify({"error": "Failed to parse curriculum"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/lesson", methods=["POST"])
def lesson():
    data = request.json
    era = data.get("era", "Ancient Rome")
    topic = data.get("topic", "")
    topic_id = data.get("topic_id", 0)

    cache_key = f"lesson:{era}:{topic_id}:{topic}"
    cached = get_cached(cache_key)
    if cached:
        return jsonify(cached)

    system = (
        "You are an engaging history teacher who makes history come alive. "
        "Write in a clear, conversational style suitable for a general audience. "
        "Always respond with valid JSON only, no markdown fences."
    )
    prompt = f"""Write a focused lesson about "{topic}" within the context of {era}.

The lesson should be readable in about 5 minutes (~800-1000 words).

Respond with this exact JSON format:
{{
    "title": "{topic}",
    "era": "{era}",
    "sections": [
        {{
            "heading": "Section heading",
            "content": "Paragraph content here. Use clear, engaging prose."
        }}
    ],
    "key_dates": [
        {{"date": "753 BC", "event": "What happened on this date"}},
        {{"date": "509 BC", "event": "What happened on this date"}}
    ],
    "fun_fact": "An interesting or surprising fact about this topic"
}}

Include 3-5 sections. Make it educational but engaging. Include specific dates,
names, and events. End with 4-6 key dates (the most important dates to remember
from this topic, with a short description of the event) and a fun fact."""

    try:
        result = ask_claude(prompt, system)
        parsed = json.loads(result)
        set_cached(cache_key, parsed)
        return jsonify(parsed)
    except json.JSONDecodeError:
        start = result.find("{")
        end = result.rfind("}") + 1
        if start != -1 and end > start:
            parsed = json.loads(result[start:end])
            set_cached(cache_key, parsed)
            return jsonify(parsed)
        return jsonify({"error": "Failed to parse lesson"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/quiz", methods=["POST"])
def quiz():
    data = request.json
    era = data.get("era", "Ancient Rome")
    topic = data.get("topic", "")
    topic_id = data.get("topic_id", 0)

    cache_key = f"quiz:{era}:{topic_id}:{topic}"
    cached = get_cached(cache_key)
    if cached:
        return jsonify(cached)

    system = (
        "You are a history quiz master. Create clear, fair multiple-choice questions. "
        "Always respond with valid JSON only, no markdown fences."
    )
    prompt = f"""Create a quiz about "{topic}" in the context of {era}.

Generate exactly 5 multiple-choice questions. Each question should have 4 options
with exactly one correct answer.

Respond with this exact JSON format:
{{
    "topic": "{topic}",
    "era": "{era}",
    "questions": [
        {{
            "id": 1,
            "question": "What happened in...?",
            "options": ["Option A", "Option B", "Option C", "Option D"],
            "correct": 0,
            "explanation": "Brief explanation of why this is correct"
        }}
    ]
}}

The "correct" field is the zero-based index of the correct option (0-3).
Questions should test understanding, not just memorization. Include a mix of
factual and conceptual questions."""

    try:
        result = ask_claude(prompt, system)
        parsed = json.loads(result)
        set_cached(cache_key, parsed)
        return jsonify(parsed)
    except json.JSONDecodeError:
        start = result.find("{")
        end = result.rfind("}") + 1
        if start != -1 and end > start:
            parsed = json.loads(result[start:end])
            set_cached(cache_key, parsed)
            return jsonify(parsed)
        return jsonify({"error": "Failed to parse quiz"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    debug = os.getenv("FLASK_DEBUG", "1") == "1"
    app.run(debug=debug, host="0.0.0.0", port=5000)
