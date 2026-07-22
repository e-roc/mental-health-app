/**
 * App-wide default first message a human provider sends when they accept a chat.
 * Prefilled into the editable box on the "Accept and join chat" screen; the
 * provider can reword it, but not clear it (see the block-join rule in
 * src/app/api/sessions/[id]/accept/route.ts).
 *
 * Client-safe on purpose — imported by both the ChatRoom component and the
 * accept route — so it lives here rather than in the server-only ai-provider
 * module that holds the AI GREETING.
 */
export const DEFAULT_PROVIDER_GREETING =
  "Hi, thanks for reaching out today. I've read through your intake " +
  "responses. This is a safe space — what feels most pressing for you right now?";
