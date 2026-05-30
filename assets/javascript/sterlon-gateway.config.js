/*
  Sterlon deployed gateway config.
  Provider credentials stay on the server (XAI_API_KEY when AI_PROVIDER=xai,
  else GROQ_API_KEY). This browser file only points the UI at the gateway.
*/
window.STERLON_GATEWAY_URL = '/api/sterlon/chat';
window.STERLON_MODEL = 'sterlon-demo';
window.STERLON_FRESH_CHAT_ON_LOAD = true;
window.STERLON_RENDER_STARTER_MESSAGE = false;

/*
  Grok sommelier mode — feature flag.

  When true, all sommelier/pairing/recommendation chat turns route to Grok via the
  gateway using a strong sommelier system prompt. The local recommendation runtime,
  card generation, and flight UI are fully bypassed. Answers render as prose only.

  To enable:  window.STERLON_GROK_SOMMELIER_ONLY = true;  (or set here and redeploy)
  To restore: window.STERLON_GROK_SOMMELIER_ONLY = false;

  No existing runtime files are deleted. Full Sterlon runtime remains available
  when this flag is false.
*/
window.STERLON_GROK_SOMMELIER_ONLY = true;
