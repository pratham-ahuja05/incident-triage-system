import json
import os
import re

from dotenv import load_dotenv
import groq
from groq import Groq

load_dotenv()

client = Groq(api_key=os.getenv("GROQ_API_KEY"))
MODEL = os.getenv("LLM_MODEL", "openai/gpt-oss-120b")

# gpt-oss is a reasoning model: it spends completion tokens "thinking" before it answers.
# A small max_tokens (it used to be 150) truncates the JSON mid-string, the parse fails,
# and every alert silently falls back to escalation. Keep reasoning short and leave headroom.
MAX_TOKENS = int(os.getenv("LLM_MAX_TOKENS", "800"))


def _extract_json(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`").replace("json", "", 1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.S)
        if not match:
            raise
        return json.loads(match.group(0))


class LLMUnavailable(Exception):
    """The provider could not be reached, timed out, or rate-limited us."""

    def __init__(self, message: str, rate_limited: bool = False):
        super().__init__(message)
        self.rate_limited = rate_limited


def chat_json(prompt: str, timeout: float = 20) -> dict:
    """Ask the model for a JSON object.

    Raises LLMUnavailable for provider problems and ValueError/JSONDecodeError for unusable output.
    Callers decide the fallback.
    """
    try:
        response = client.chat.completions.create(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            reasoning_effort="low",
            response_format={"type": "json_object"},
            messages=[{"role": "user", "content": prompt}],
            timeout=timeout,
        )
    except groq.RateLimitError as e:
        raise LLMUnavailable("The AI provider is rate-limiting requests; try again in a minute.", rate_limited=True) from e
    except (groq.APIConnectionError, groq.APITimeoutError, groq.InternalServerError, groq.AuthenticationError) as e:
        raise LLMUnavailable(f"The AI provider is unavailable ({type(e).__name__}).") from e
    content = response.choices[0].message.content or ""
    if response.choices[0].finish_reason == "length":
        print(f"[LLM WARN] response truncated at {MAX_TOKENS} tokens")
    return _extract_json(content)
