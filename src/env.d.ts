/// <reference types="astro/client" />

interface ImportMetaEnv {
  /**
   * Base URL of the RAG chat backend (Phase 3). Build-time, `PUBLIC_`-prefixed
   * so it reaches client code. Unset by default — when absent the contact-page
   * terminal stays scripted-only with no chat affordance (build brief
   * constraint 5). Set to e.g. the Cloudflare Tunnel URL to enable free chat.
   */
  readonly PUBLIC_CHAT_API_URL?: string;
}
