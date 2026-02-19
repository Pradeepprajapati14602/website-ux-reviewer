# Prompts Used

## UX Audit Prompt

You are a senior UX auditor.

Analyze the following website content.

Return a JSON response with:

{
  "score": number (0-100),
  "issues": [
    {
      "category": "clarity | layout | navigation | accessibility | trust",
      "title": "",
      "why": "",
      "evidence": "",
      "severity": "low | medium | high"
    }
  ],
  "top_improvements": [
    {
      "before": "",
      "after": ""
    }
  ]
}

Provide 8-12 issues.
Evidence must quote exact text from input.
Do not return explanations outside JSON.

## Improvement Prompt

No separate improvement prompt is used in this MVP.
Top improvements are generated in the same UX audit response.
