"use client"

import { useState, useEffect } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { EliLoader } from "@/components/eli/loader"
import { Header } from "@/components/eli/header"
import { HeroSection } from "@/components/eli/hero-section"
import { WhatIsSection } from "@/components/eli/what-is-section"
import { HowItWorksSection } from "@/components/eli/how-it-works-section"
import { TargetSection } from "@/components/eli/target-section"
import { DashboardPreviewSection } from "@/components/eli/dashboard-preview-section"
import { ContactSection } from "@/components/eli/contact-section"
import { Footer } from "@/components/eli/footer"

export default function HomePage() {
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Simulate loading time for smooth transition
    const timer = setTimeout(() => {
      setIsLoading(false)
    }, 1200)

    return () => clearTimeout(timer)
  }, [])

  return (
    <>
      <AnimatePresence mode="wait">
        {isLoading && <EliLoader key="loader" />}
      </AnimatePresence>

      <AnimatePresence>
        {!isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            <Header />
            <main>
              <HeroSection />
              <WhatIsSection />
              <HowItWorksSection />
              <TargetSection />
              <DashboardPreviewSection />
              <ContactSection />
            </main>
            <Footer />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
