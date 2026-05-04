import React, { useState, useEffect } from "react"
import { QueryClient, QueryClientProvider } from "react-query"
import { ToastProvider, ToastViewport } from "./components/ui/toast"
import NativelyInterface from "./components/NativelyInterface"
import SettingsPopup from "./components/SettingsPopup"
import Launcher from "./components/Launcher"
import ModelSelectorWindow from "./components/ModelSelectorWindow"
import SettingsOverlay from "./components/SettingsOverlay"
import StartupSequence from "./components/StartupSequence"
import { AnimatePresence, motion } from "framer-motion"
import UpdateBanner from "./components/UpdateBanner"
import { SupportToaster } from "./components/SupportToaster"
import { analytics } from "./lib/analytics/analytics.service"
import { LanguageProvider } from "./i18n"
import { TranscriptSearchOverlay } from "./components/TranscriptSearchOverlay"
import { ProactiveNudgeToast } from "./components/ProactiveNudgeToast"
import { ProjectContextPalette } from "./components/ProjectContextPalette"

const queryClient = new QueryClient()

const App: React.FC = () => {
  const windowParam = new URLSearchParams(window.location.search).get('window');
  const isSettingsWindow = windowParam === 'settings';
  const isLauncherWindow = windowParam === 'launcher';
  const isOverlayWindow = windowParam === 'overlay';
  const isModelSelectorWindow = windowParam === 'model-selector';

  const isDefault = !isSettingsWindow && !isOverlayWindow && !isModelSelectorWindow;

  // Initialize Analytics
  useEffect(() => {
    analytics.initAnalytics();

    if (isLauncherWindow || isDefault) {
      analytics.trackAppOpen();
    }

    if (isOverlayWindow) {
      analytics.trackAssistantStart();
    }

    const handleUnload = () => {
      if (isOverlayWindow) {
        analytics.trackAssistantStop();
      }
      if (isLauncherWindow || isDefault) {
        analytics.trackAppClose();
      }
    };

    window.addEventListener('beforeunload', handleUnload);
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, [isLauncherWindow, isOverlayWindow, isDefault]);

  const [showStartup, setShowStartup] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const handleStartMeeting = async () => {
    try {
      const inputDeviceId = localStorage.getItem('preferredInputDeviceId');
      let outputDeviceId = localStorage.getItem('preferredOutputDeviceId');
      const useLegacyAudio = localStorage.getItem('useLegacyAudioBackend') === 'true';

      if (!useLegacyAudio) {
        outputDeviceId = "sck";
      }

      const result = await window.electronAPI.startMeeting({
        audio: { inputDeviceId, outputDeviceId }
      });
      if (result.success) {
        analytics.trackMeetingStarted();
        await window.electronAPI.setWindowMode('overlay');
      } else {
        console.error("Failed to start meeting:", result.error);
      }
    } catch (err) {
      console.error("Failed to start meeting:", err);
    }
  };

  const handleEndMeeting = async () => {
    analytics.trackMeetingEnded();
    try {
      await window.electronAPI.endMeeting();
      await window.electronAPI.setWindowMode('launcher');
    } catch (err) {
      console.error("Failed to end meeting:", err);
      window.electronAPI.setWindowMode('launcher');
    }
  };

  if (isSettingsWindow) {
    return (
      <LanguageProvider>
        <div className="h-full min-h-0 w-full">
          <QueryClientProvider client={queryClient}>
            <ToastProvider>
              <SettingsPopup />
              <ToastViewport />
            </ToastProvider>
          </QueryClientProvider>
        </div>
      </LanguageProvider>
    );
  }

  if (isModelSelectorWindow) {
    return (
      <LanguageProvider>
        <div className="h-full min-h-0 w-full overflow-hidden">
          <QueryClientProvider client={queryClient}>
            <ToastProvider>
              <ModelSelectorWindow />
              <ToastViewport />
            </ToastProvider>
          </QueryClientProvider>
        </div>
      </LanguageProvider>
    );
  }

  if (isOverlayWindow) {
    return (
      <LanguageProvider>
        <div className="w-full relative bg-transparent">
          <QueryClientProvider client={queryClient}>
            <ToastProvider>
              <NativelyInterface
                onEndMeeting={handleEndMeeting}
              />
              <TranscriptSearchOverlay />
              <ProjectContextPalette />
              <ProactiveNudgeToast />
              <ToastViewport />
            </ToastProvider>
          </QueryClientProvider>
        </div>
      </LanguageProvider>
    );
  }

  return (
    <LanguageProvider>
    <div className="h-full min-h-0 w-full relative">
      <AnimatePresence>
        {showStartup ? (
          <motion.div
            key="startup"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.1, pointerEvents: "none", transition: { duration: 0.6, ease: "easeInOut" } }}
          >
            <StartupSequence onComplete={() => setShowStartup(false)} />
          </motion.div>
        ) : (
          <motion.div
            key="main"
            className="h-full w-full"
            initial={{ opacity: 0, scale: 0.98, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{
              duration: 0.8,
              ease: [0.19, 1, 0.22, 1],
              delay: 0.1
            }}
          >
            <QueryClientProvider client={queryClient}>
              <ToastProvider>
                <Launcher
                  onStartMeeting={handleStartMeeting}
                  onOpenSettings={() => setIsSettingsOpen(true)}
                />
                <SettingsOverlay
                  isOpen={isSettingsOpen}
                  onClose={() => setIsSettingsOpen(false)}
                />
                <ProjectContextPalette />
                <ToastViewport />
              </ToastProvider>
            </QueryClientProvider>
          </motion.div>
        )}
      </AnimatePresence>
      <UpdateBanner />
      <SupportToaster />
    </div>
    </LanguageProvider>
  )
}

export default App
