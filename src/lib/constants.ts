// Shared by Next-runtime code (lib/auth) and the plain-Node WebSocket server
// (src/server/ws), which must not import anything that pulls in next/headers.
export const SESSION_COOKIE = "mh_session";
