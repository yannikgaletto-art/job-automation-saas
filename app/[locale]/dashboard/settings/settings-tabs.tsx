"use client";

import { useState } from "react";
import { Shield, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import SecurityPage from "@/app/[locale]/dashboard/security/page";

interface SettingsTabsProps {
  /** Pre-rendered server-side Konto content (Credits, Language, Tours, Docs) */
  children: React.ReactNode;
}

const TABS = [
  { id: "account" as const, icon: Sparkles },
  { id: "privacy" as const, icon: Shield },
] as const;

type TabId = (typeof TABS)[number]["id"];

/**
 * Client-side tab wrapper for Settings.
 * Preserves server-side rendering for Konto content (passed as children)
 * while lazily rendering SecurityPage in the privacy tab.
 */
export function SettingsTabs({ children }: SettingsTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>("account");
  const t = useTranslations("settings");

  return (
    <>
      {/* Tab Bar */}
      <div className="flex gap-1 bg-[#F7F7F5] p-1 rounded-lg mb-8">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                relative flex items-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-colors flex-1 justify-center
                ${isActive ? "text-[#37352F]" : "text-[#73726E] hover:text-[#37352F]"}
              `}
            >
              {isActive && (
                <motion.div
                  layoutId="settings-tab-bg"
                  className="absolute inset-0 bg-white rounded-md shadow-sm"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-2">
                <Icon className="h-4 w-4" />
                {t(`tabs.${tab.id}`)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === "account" && children}
      {activeTab === "privacy" && <SecurityPage />}
    </>
  );
}
