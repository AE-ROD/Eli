"use client"

import { useState, useEffect } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { EliLoader } from "@/components/landing/loader"
import { Header } from "@/components/landing/header"
import { HeroSection } from "@/components/landing/hero-section"
import { WhatIsSection } from "@/components/landing/what-is-section"
import { HowItWorksSection } from "@/components/landing/how-it-works-section"
import { TargetSection } from "@/components/landing/target-section"
import { DashboardPreviewSection } from "@/components/landing/dashboard-preview-section"
import { PreciosSection } from "@/components/landing/precios-section"
import { ContactSection } from "@/components/landing/contact-section"
import { Footer } from "@/components/landing/footer"

export default function HomePage() {
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const alreadyLoaded = sessionStorage.getItem("eli_loaded")
    if (alreadyLoaded) {
      setIsLoading(false)
      return
    }
    const timer = setTimeout(() => {
      setIsLoading(false)
      sessionStorage.setItem("eli_loaded", "1")
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
              <PreciosSection />
              <ContactSection />
            </main>
            <Footer />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
