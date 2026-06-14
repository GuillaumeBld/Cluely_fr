# Changelog

## [1.2.0] - 2026-06-14

### Sécurité
- **Durcissement Electron (PR #76)** : sandbox activé sur toutes les `BrowserWindow`, `webSecurity` toujours activé, `webviewTag` supprimé, gestionnaire de permissions strict, garde de navigation contre les URL inattendues.
- **Validation des chemins de fichiers IPC** : `gemini-chat`, `gemini-chat-stream`, `delete-screenshot`, `analyze-image-file` et `open-path` valident maintenant les chemins fournis par le renderer via `validateFilePath()` — comble une faille de traversée de répertoire.
- **CSP durcie** : `script-src` sans `'unsafe-inline'` en production ; mode dev relaxé via plugin Vite (les scripts inline React-refresh sont autorisés uniquement en développement).

### Corrections de bugs
- **Fuite de listener** : `onDebugSuccess` dans le preload enregistrait un callback mais en supprimait un autre — le listener ne se nettoyait jamais. Corrigé.
- **Langue française (Gemini)** : le chemin Gemini de `streamChat` n'appliquait pas `withLang()`, donc les récapitulatifs, suivis et réponses revenaient en anglais quel que soit le paramètre de langue. Corrigé.
- **Crash VectorStore** : `rows.map(this.rowToChunk)` perdait le contexte `this` et plantait sur tout chunk ayant un embedding. Corrigé en utilisant une fonction fléchée.
- **Action items `[object Object]`** : les action items étaient sérialisés comme `[object Object]` dans les résumés de réunion utilisés pour la recherche RAG. Corrigé via `normalizeActionItem().text`.
- **Race condition MulticaManager** : la `readyPromise` était annulée à chaque tentative de retry, laissant les appelants de `waitUntilReady()` avec des promesses orphelines. Corrigé en allouant la promesse une seule fois pour toute la séquence.
- **CommitmentStalenessChecker toujours vide** : les lignes `Decision` (snake_case, timestamps ISO) étaient passées directement à un checker attendant des champs camelCase et des timestamps numériques — la détection de stagnation était silencieusement morte. Adaptateur ajouté au point de branchement.
- **Déduplication des chunks RAG** : un double déclenchement de fin de réunion dupliquait tous les chunks. `processMeeting` supprime maintenant les chunks existants avant d'en insérer de nouveaux.
- **Collision de clés `rag:cancel-query`** : annuler la réunion `"m"` annulait aussi `"m2"` (correspondance par préfixe). Corrigé avec des clés horodatées et une correspondance de préfixe précise.
- **DeepSeek inutilisable en streaming** : les modèles `deepseek-*` tombaient dans le chemin Gemini ou levaient "No LLM provider available". Ajout d'une branche `streamWithDeepseek` dédiée.
- **Rate limiting / suivi de coûts DeepSeek** : `generateWithDeepseek` n'avait ni rate limiter, ni suivi des tokens, ni enregistrement des coûts. Ajouté pour correspondre aux autres fournisseurs.
- **Budget quotidien non vérifié en streaming** : `isDailyBudgetExceeded()` n'était vérifié que dans `chatWithGemini` (non-streaming). Ajouté au début de `streamChat`.
- **Filtre de phrases anglaises dans la chaîne de retry** : des phrases anglaises ("I don't know", etc.) déclenchaient une erreur dans la chaîne de retry Gemini alors que les réponses françaises ne les contenaient jamais. Supprimé.
- **`setGroqApiKey` n'actualisait pas le champ** : `this.groqApiKey` n'était pas mis à jour. Corrigé.
- **GoogleSTT — déconnexion silencieuse** : lors d'une erreur de stream ou après la limite de 5 minutes de Google, la transcription s'arrêtait silencieusement. Ajout d'un redémarrage proactif à 4,5 min et d'une reconnexion avec backoff exponentiel.

### Améliorations
- **Intent Classifier bilingue** : les 7 patterns d'intention n'étaient qu'en anglais — sur une transcription française, tout tombait dans `'general'`. Patterns français ajoutés pour chaque intention.
- **Index de base de données** : index manquants sur `transcripts(meeting_id)` et `ai_interactions(meeting_id)` — les requêtes `getMeetingDetails` faisaient des scans complets. Ajoutés.
- **Pricing DeepSeek** : `deepseek-chat` et `deepseek-reasoner` ajoutés à la table de tarification.

### Infrastructure
- **CI GitHub Actions** : workflow qui exécute typecheck (renderer + electron) et la suite de tests (537 tests) sur chaque push et PR vers `main`.

## [1.1.6] - 2026-02-15

### New Features
- **Speech Providers**: Added support for multiple speech providers including Google, Groq, OpenAI, Deepgram, ElevenLabs, Azure, and IBM Watson.
- **Fast Response Mode**: Introduced ultra-fast text responses using Groq Llama 3.
- **Local RAG & Memory**: Full offline vector retrieval for past meetings using SQLite.
- **Custom Key Bindings**: Added ability to customize global shortcuts for easier control.
- **Stealth Mode Improvements**: Enhanced disguise modes (Terminal, Settings, Activity Monitor) for better privacy.
- **Markdown Support**: Improved Markdown rendering in the Usage section for better readability of AI responses.
- **Image Processing**: Integrated `sharp` for optimized image handling and faster analysis.

### Improvements & Fixes
- Fixed various UI bugs and focus stealing issues.
- Improved application stability and performance.

## [1.1.5] - 2026-02-13

### Summary
The Stealth & Intelligence Update: Enhances stealth capabilities, expands AI provider support, and improves local AI integration.

### What's New
- **Native Speech Provider Support:** Added Deepgram, Groq, and OpenAI speech providers.
- **Custom LLM Providers:** Connect to any OpenAI-compatible API including OpenRouter and DeepSeek.
- **Smart Local AI:** Auto-detection of available Ollama models for local AI.
- **Global Spotlight Search:** Toggle chat overlay with Cmd+K (macOS) and Ctrl+K (Windows/Linux).
- **Masquerading Mode:** Appear as system processes like Terminal or Activity Monitor.
- **Improved Stealth Mode:** Enhanced activation and window focus transitions.

### Improvements
- **Natural Responses:** Updated system prompts for more concise and natural responses.
- **Conversational Logic:** Reduced robotic preambles and unnecessary explanations.
- **Performance:** Improved UI scaling and reduced speech-to-text latency.

### Fixes
- No critical fixes reported in this release.

### Technical
- Internal logic refinements for improved conversational flow.
- Updater and background process stability improvements.

#### macOS Installation (Unsigned Build)
If you see "App is damaged":
1. Move the app to your Applications folder.
2. Open Terminal and run: `xattr -cr /Applications/Natively.app`

## [1.1.4] - 2026-02-12

### What's New in v1.1.4
- **Custom LLM Providers:** Connect to any OpenAI-compatible API (OpenRouter, DeepSeek, commercial endpoints) simply by pasting a cURL command.
- **Smart Local AI:** Enhanced Ollama integration that automatically detects and lists your available local models—no configuration required.
- **Refined Human Persona:** Major updates to system prompts (`prompts.ts`) to ensure responses are concise, conversational, and indistinguishable from a real candidate.
- **Anti-Chatbot Logic:** Specific negative constraints to prevent "AI-like" lectures, distinct "robot" preambles, and over-explanation.
- **Global Spotlight Search:** Access AI chat instantly with `Cmd+K` / `Ctrl+K`.
- **Masquerading (Undetectable Mode):** Stealth capability to disguise the app as common utility processes (Terminal, Activity Monitor) for discreet usage.
