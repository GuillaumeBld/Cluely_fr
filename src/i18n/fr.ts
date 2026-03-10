export const fr = {
  // AboutSection
  about_title: 'À propos de Cluely.fr',
  about_subtitle: 'Conçu pour être invisible, intelligent et fiable.',
  about_hybrid_title: 'Intelligence hybride',
  about_hybrid_desc: 'Achemine intelligemment les requêtes entre des modèles ultra-rapides et des modèles de raisonnement (Gemini, OpenAI, Claude). Alimenté par une reconnaissance vocale professionnelle de 7+ fournisseurs.',
  about_rag_title: 'RAG locale & Mémoire',
  about_rag_desc: "Un système de mémoire vectorielle entièrement local permet à Cluely.fr de se souvenir des détails des réunions passées. Les embeddings s'effectuent sur l'appareil via SQLite.",
  about_stealth_title: 'Discrétion & Contrôle',
  about_stealth_desc: "Le \"Mode indétectable\" masque l'app du dock, le \"Masquage\" la déguise en application système. Vous contrôlez exactement quelles données quittent votre appareil.",
  about_no_record_title: "Pas d'enregistrement",
  about_no_record_desc: "Cluely.fr écoute uniquement lorsqu'il est actif. Il n'enregistre pas de vidéo, ne prend pas de captures d'écran sans commande, et n'effectue aucune surveillance en arrière-plan.",
  about_community: 'Communauté',
  about_repo: 'Dépôt GitHub',
  about_view_project: 'Voir le projet',
  about_creator: 'Créateur',
  about_creator_desc: 'Je construis des logiciels qui restent discrets.',
  about_star: 'Étoile sur GitHub',
  about_star_desc: 'Vous aimez Cluely.fr ? Soutenez-nous en mettant une étoile.',
  about_bug: 'Signaler un problème',
  about_bug_desc: 'Vous avez trouvé un bug ? Signalez-le sur GitHub.',
  about_contact: 'Nous contacter',
  about_contact_desc: 'Ouvert aux collaborations professionnelles.',
  about_contact_btn: 'Me contacter',
  about_support_title: 'Soutenir le développement',
  about_support_desc: 'Cluely.fr est un logiciel open-source indépendant.',
  about_support_btn: 'Soutenir le projet',
  about_tech: 'Technologies utilisées',
  about_how: 'Comment fonctionne Cluely.fr',
  about_privacy: 'Confidentialité & Données',

  // SupportToaster
  support_headline: 'Construit seul.\nUtilisé par des milliers.',
  support_body: "Cluely.fr est développé et maintenu par un seul développeur.\nSi c'est devenu une partie de votre quotidien, votre soutien\npermet de faire avancer le projet.",
  support_btn: 'Soutenir le projet',
  support_dismiss: 'Pas maintenant',

  // FeatureSpotlight
  feature_upcoming_headline: 'Fonctionnalités à venir',
  feature_upcoming_subtitle: 'Des réponses adaptées à vous',
  feature_upcoming_bullet1: 'Explications contextuelles du dépôt',
  feature_upcoming_bullet2: 'Réponses ancrées dans votre CV',
  feature_upcoming_footer: "Conçu pour fonctionner discrètement lors d'entretiens en direct.",
  feature_support_headline: 'Soutenir le développement',
  feature_support_subtitle: 'Construit ouvertement, soutenu par les utilisateurs',
  feature_support_bullet1: 'Développement guidé par les vrais utilisateurs',
  feature_support_bullet2: 'Itération plus rapide sur les fonctionnalités importantes',
  feature_support_action: 'Contribuer au projet',
  feature_interested: 'Intéressé',
  feature_contribute: 'Contribuer au projet',
  feature_mark_interest: "M'intéresse",

  // FollowUpEmailModal
  email_subject_prefix: 'Suivi - ',
  email_subject_label: 'Objet',
  email_subject_placeholder: 'Objet du message',
  email_recipient_placeholder: 'Email du destinataire',
  email_body_placeholder: 'Rédigez votre e-mail...',

  // GlobalChatOverlay
  chat_placeholder: "Posez-moi n'importe quelle question...",

  // TopSearchPill
  search_placeholder: 'Rechercher ou poser une question...',

  // MeetingDetails
  action_item_placeholder: 'Ajouter une action...',
  key_point_placeholder: 'Ajouter un point clé...',
  meeting_chat_placeholder: 'Poser une question sur cette réunion...',

  // SettingsOverlay
  settings_general_desc: 'Personnalisez le fonctionnement de Cluely.fr',
  settings_open_login: 'Ouvrir Cluely.fr au démarrage',
  settings_open_login_desc: "Cluely.fr s'ouvrira automatiquement à la connexion",
  settings_theme_desc: "Personnalisez l'apparence de Cluely.fr",
  settings_version: 'Vous utilisez Cluely.fr version',
  settings_disguise_desc: 'Déguisez Cluely.fr en une autre application pour éviter la détection lors du partage d\'écran.',
  settings_disguise_auto: 'Choisissez un déguisement appliqué automatiquement en mode Indétectable.',
  settings_shortcuts_desc: 'Cluely.fr fonctionne avec ces raccourcis faciles à mémoriser.',
  settings_save: 'Sauvegarder',
  settings_microphone: 'Microphone par défaut',
  settings_speakers: 'Haut-parleurs par défaut',
  settings_accent: 'Choisir un accent',
  settings_azure_region: 'ex. eastus',
  settings_azure_hint: 'ex. eastus, westeurope, westus2',

  // AIProvidersSettings
  custom_llm_name: 'Mon LLM personnalisé',
  custom_response_path: 'ex. choices[0].message.content',

  // SettingsPopup
  popup_donate: 'Soutenir',

  // Language toggle
  lang_toggle_label: "Langue de l'interface",
  lang_french: 'Français',
  lang_english: 'English',
} as const;

export type TranslationKey = keyof typeof fr;
