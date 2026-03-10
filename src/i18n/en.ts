import type { TranslationKey } from './fr';

export const en: Record<TranslationKey, string> = {
  // AboutSection
  about_title: 'About Cluely.fr',
  about_subtitle: 'Designed to be invisible, intelligent, and trusted.',
  about_hybrid_title: 'Hybrid Intelligence',
  about_hybrid_desc: 'Seamlessly routes queries between ultra-fast models and reasoning models (Gemini, OpenAI, Claude). Powered by enterprise-grade speech recognition from 7+ providers.',
  about_rag_title: 'Local RAG & Memory',
  about_rag_desc: 'A purely local vector memory system lets Cluely.fr recall details from past meetings. Embeddings happen on-device via SQLite for maximum privacy.',
  about_stealth_title: 'Stealth & Control',
  about_stealth_desc: '"Undetectable Mode" hides the app from the dock, "Masquerading" disguises it as a system app. You control exactly what data leaves your device.',
  about_no_record_title: 'No Recording',
  about_no_record_desc: 'Cluely.fr listens only when active. It does not record video, take screenshots without command, or perform background surveillance.',
  about_community: 'Community',
  about_repo: 'GitHub Repository',
  about_view_project: 'View project',
  about_creator: 'Creator',
  about_creator_desc: 'I build software that stays discreet.',
  about_star: 'Star on GitHub',
  about_star_desc: 'Like Cluely.fr? Support us by starring the repo.',
  about_bug: 'Report an issue',
  about_bug_desc: 'Found a bug? Report it on GitHub.',
  about_contact: 'Contact us',
  about_contact_desc: 'Open to professional collaborations.',
  about_contact_btn: 'Contact me',
  about_support_title: 'Support development',
  about_support_desc: 'Cluely.fr is an independent open-source project.',
  about_support_btn: 'Support the project',
  about_tech: 'Core Technology',
  about_how: 'How Cluely.fr works',
  about_privacy: 'Privacy & Data',

  // SupportToaster
  support_headline: 'Built by one.\nUsed by thousands.',
  support_body: "Cluely.fr is built and maintained by one developer.\nIf it's part of your daily workflow, your support keeps\nit moving forward.",
  support_btn: 'Support the project',
  support_dismiss: 'Not now',

  // FeatureSpotlight
  feature_upcoming_headline: 'Upcoming features',
  feature_upcoming_subtitle: 'Answers, tailored to you',
  feature_upcoming_bullet1: 'Repo-aware explanations',
  feature_upcoming_bullet2: 'Resume-grounded responses',
  feature_upcoming_footer: 'Designed to work silently during live interviews.',
  feature_support_headline: 'Support development',
  feature_support_subtitle: 'Built openly and sustained by users',
  feature_support_bullet1: 'Development driven by real users',
  feature_support_bullet2: 'Faster iteration on features that matter',
  feature_support_action: 'Contribute to development',
  feature_interested: 'Interested',
  feature_contribute: 'Contribute to development',
  feature_mark_interest: 'Mark interest',

  // FollowUpEmailModal
  email_subject_prefix: 'Follow up - ',
  email_subject_label: 'Subject',
  email_subject_placeholder: 'Subject line',
  email_recipient_placeholder: 'Recipient email',
  email_body_placeholder: 'Write your email...',

  // GlobalChatOverlay
  chat_placeholder: 'Ask me anything...',

  // TopSearchPill
  search_placeholder: 'Search or ask anything...',

  // MeetingDetails
  action_item_placeholder: 'Type an action item...',
  key_point_placeholder: 'Type a key point...',
  meeting_chat_placeholder: 'Ask about this meeting...',

  // SettingsOverlay
  settings_general_desc: 'Customize how Cluely.fr works for you',
  settings_open_login: 'Open Cluely.fr at login',
  settings_open_login_desc: 'Cluely.fr will open automatically when you log in',
  settings_theme_desc: 'Customize how Cluely.fr looks on your device',
  settings_version: 'You are currently using Cluely.fr version',
  settings_disguise_desc: 'Disguise Cluely.fr as another application to prevent detection during screen sharing.',
  settings_disguise_auto: 'Select a disguise applied automatically when Undetectable mode is on.',
  settings_shortcuts_desc: 'Cluely.fr works with these easy to remember commands.',
  settings_save: 'Save',
  settings_microphone: 'Default Microphone',
  settings_speakers: 'Default Speakers',
  settings_accent: 'Select Accent',
  settings_azure_region: 'e.g. eastus',
  settings_azure_hint: 'e.g. eastus, westeurope, westus2',

  // AIProvidersSettings
  custom_llm_name: 'My Custom LLM',
  custom_response_path: 'e.g. choices[0].message.content',

  // SettingsPopup
  popup_donate: 'Donate',

  // Language toggle
  lang_toggle_label: 'Interface language',
  lang_french: 'Français',
  lang_english: 'English',
};
