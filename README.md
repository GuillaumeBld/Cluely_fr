<div align="center">
  <img src="assets/icon.png" width="150" alt="Cluely.fr Logo">

  # Cluely.fr – Assistant IA de Réunions et d'Entretiens (Version Française)

  [![Licence](https://img.shields.io/badge/Licence-AGPL--3.0-blue?style=flat-square)](LICENSE)
  [![Plateforme](https://img.shields.io/badge/Plateforme-macOS%20%7C%20Windows-lightgrey?style=flat-square)](https://github.com/GuillaumeBld/Cluely_fr/releases)
  [![Étoiles](https://img.shields.io/github/stars/GuillaumeBld/Cluely_fr?style=flat-square)](https://github.com/GuillaumeBld/Cluely_fr)
  ![Statut](https://img.shields.io/badge/Statut-actif-success?style=flat-square)

  **Fork français de [natively-cluely-ai-assistant](https://github.com/evinjohnn/natively-cluely-ai-assistant) par GuillaumeBld**

</div>

---

<div align="center">

> **Cluely.fr** est un **copilote IA gratuit, axé sur la confidentialité**, pour **Google Meet, Zoom et Teams**. Version entièrement francisée de Natively — offrant une **transcription en temps réel**, une **aide aux entretiens** et des **notes de réunion automatisées**, entièrement en local.

Contrairement aux outils uniquement en cloud, Cluely.fr utilise la **RAG locale (Génération Augmentée par Récupération)** pour se souvenir des conversations passées, vous donnant des réponses instantanées lors d'**entretiens techniques**, d'**appels commerciaux** et de **stand-ups quotidiens**.

L'assistant **répond en français** par défaut.

</div>

---

## Pourquoi Cluely.fr ?

- **Base de données vectorielle locale (RAG) :** Vos réunions sont indexées localement pour pouvoir demander : « Qu'est-ce que Jean a dit sur l'API la semaine dernière ? »
- **Tableau de bord complet :** Interface complète pour gérer, rechercher et exporter votre historique.
- **Contexte glissant :** Maintien d'une « fenêtre mémoire » de la conversation pour des réponses plus intelligentes.
- **Interface 100% française :** Toute l'interface et les réponses de l'IA sont en français.

---

## Différences avec l'original

| Fonctionnalité | Cluely.fr (ce fork) | Natively (original) |
| :--- | :--- | :--- |
| **Langue de l'IA** | **Français par défaut** | Anglais |
| **Interface** | **100% en français** | Anglais |
| **Identité** | GuillaumeBld | Evin John |
| **Fonctionnalités** | Identiques | Identiques |

---

## Installation (Développeurs)

### Prérequis
- Node.js (v20+ recommandé)
- Git
- Rust (requis pour la capture audio native)

### Cloner le dépôt
```bash
git clone https://github.com/GuillaumeBld/Cluely_fr.git
cd Cluely_fr
```

### Installer les dépendances
```bash
npm install
```

### Variables d'environnement
Créez un fichier `.env` :

```env
# IA Cloud (au moins une clé requise)
GEMINI_API_KEY=votre_clé
GROQ_API_KEY=votre_clé
OPENAI_API_KEY=votre_clé
CLAUDE_API_KEY=votre_clé

# Fournisseurs de parole (un seul suffit)
DEEPGRAM_API_KEY=votre_clé
ELEVENLABS_API_KEY=votre_clé
AZURE_SPEECH_KEY=votre_clé
AZURE_SPEECH_REGION=westeurope

# IA locale (Ollama)
USE_OLLAMA=true
OLLAMA_MODEL=llama3.2
OLLAMA_URL=http://localhost:11434

# Modèle par défaut
DEFAULT_MODEL=gemini-3-flash-preview
```

### Lancer (développement)
```bash
npm start
```

### Construire (production)
```bash
npm run dist
```

---

## Fournisseurs IA supportés

| Fournisseur | Meilleur pour |
| :--- | :--- |
| **Gemini 3 Pro/Flash** | Recommandé : fenêtre de contexte massive (2M tokens) et faible coût |
| **OpenAI (GPT-5.2)** | Hautes capacités de raisonnement |
| **Anthropic (Claude 4.5)** | Codage et tâches complexes nuancées |
| **Groq / Llama 3** | Vitesse extrême (réponses quasi-instantanées) |
| **Ollama / LocalAI** | 100% Hors ligne & Privé (pas de clés API) |
| **OpenAI-Compatible** | Se connecter à n'importe quel endpoint custom |

---

## Fonctionnalités clés

### Assistant de bureau invisible
- Superposition translucide toujours au premier plan
- Masquer/afficher instantanément avec des raccourcis
- Fonctionne sur toutes les applications

### Copilote d'entretien en temps réel
- Transcription parole-texte en temps réel
- Mémoire contextuelle (RAG) pour les réunions passées
- Réponses instantanées aux questions posées — **en français**
- Résumés et récapitulatifs intelligents

### Analyse d'écran et de diapositives
- Capturer n'importe quel contenu d'écran
- Analyser diapositives, documents, code ou problèmes
- Explications et solutions immédiates **en français**

### Actions contextuelles
- Que devrais-je répondre ?
- Raccourcir la réponse
- Récapituler la conversation
- Suggérer des questions de suivi

### Intelligence audio double canal
- **Audio système (La réunion) :** Capture l'audio directement depuis votre OS (Zoom, Teams, Meet).
- **Entrée microphone (Votre voix) :** Canal dédié pour vos commandes vocales et dictées.

### RAG locale & Mémoire long terme
- Tous les embeddings vectoriels et la récupération se font localement (SQLite).
- Recherche sémantique sur toutes vos réunions passées.
- Indexation automatique en arrière-plan.

### Confidentialité avancée et mode furtif
- **Mode indétectable :** Masquage instantané depuis le dock/barre des tâches.
- **Traitement local uniquement :** Toutes les données restent sur votre machine.

---

## Tableau de bord de réunions

- **Archives de réunions :** Transcriptions complètes de chaque réunion passée.
- **Export intelligent :** Export en Markdown, JSON ou Texte.
- **Statistiques d'utilisation :** Suivi des tokens et des coûts API.

---

## Cas d'utilisation

- **Entretiens d'embauche :** Aide contextuelle pour naviguer les questions techniques.
- **Réunions professionnelles :** Clarification en temps réel, résumés automatiques.
- **Travail de développement :** Aide au code, au débogage, à l'architecture.
- **Formation et apprentissage :** Explications instantanées de sujets complexes.

---

## Confidentialité & Sécurité

- 100% open source (AGPL-3.0)
- Apportez vos propres clés (BYOK)
- Option IA locale (Ollama)
- Toutes les données stockées localement
- Aucune télémétrie, aucun tracking, aucun envoi caché

---

## Crédits

Ce projet est un fork français de [natively-cluely-ai-assistant](https://github.com/evinjohnn/natively-cluely-ai-assistant) créé par [Evin John](https://evinjohn.vercel.app/).

Fork et localisation française par [GuillaumeBld](https://github.com/GuillaumeBld).

---

## Licence

Sous licence GNU Affero General Public License v3.0 (AGPL-3.0).

Si vous exécutez ou modifiez ce logiciel sur un réseau, vous devez fournir le code source complet sous la même licence.

---

**Mettez une étoile à ce dépôt si Cluely.fr vous aide lors de vos réunions, entretiens ou présentations !**
