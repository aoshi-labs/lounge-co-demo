/*
  Sterlon deployed gateway config.
  Provider credentials stay on the server in GROQ_API_KEY; this browser file
  only points the static UI at the same-origin gateway endpoint.
*/
window.STERLON_GATEWAY_URL = '/api/sterlon/chat';
window.STERLON_MODEL = 'sterlon-demo';
window.STERLON_FRESH_CHAT_ON_LOAD = true;
window.STERLON_RENDER_STARTER_MESSAGE = false;
