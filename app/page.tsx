"use client"

import { useState, useEffect } from "react"
import { AnimatePresence, motion, useScroll } from "framer-motion"
import { EliLoader } from "@/components/landing/loader"
import { Header } from "@/components/landing/header"
import { HeroSection } from "@/components/landing/hero-section"
import { WhyEliSection } from "@/components/landing/why-eli-section"
import { LiveFeedSection } from "@/components/landing/live-feed-section"
import { HowItWorksSection } from "@/components/landing/how-it-works-section"
import { PreciosSection } from "@/components/landing/precios-section"
import { ContactSection } from "@/components/landing/contact-section"
import { Footer } from "@/components/landing/footer"

export default function HomePage() {
  const [isLoading, setIsLoading] = useState(true)
  const { scrollYProgress } = useScroll()

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
            <div className="eli-landing-dark">
              {/* Scroll progress */}
              <div className="fixed left-5 top-1/2 -translate-y-1/2 w-[1.5px] h-32 rounded-full bg-border/30 z-50 hidden lg:block">
                <motion.div
                  className="w-full rounded-full bg-primary/70 origin-top"
                  style={{ scaleY: scrollYProgress, height: "100%" }}
                />
              </div>

              <Header />
              <main>
                <HeroSection />
                <WhyEliSection />
                <LiveFeedSection />
                <HowItWorksSection />
                <PreciosSection />
                <ContactSection />
              </main>
            </div>
            <Footer />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
