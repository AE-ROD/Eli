"use client"

import { useState, useEffect } from "react"
import { AnimatePresence, motion, useScroll } from "framer-motion"
import { EliLoader } from "@/components/landing/loader"
import { Header } from "@/components/landing/header"
import { HeroSection } from "@/components/landing/hero-section"
import { WhatIsSection } from "@/components/landing/what-is-section"
import { HowItWorksSection } from "@/components/landing/how-it-works-section"
import { TargetSection } from "@/components/landing/target-section"
import { PreciosSection } from "@/components/landing/precios-section"
import { ContactSection } from "@/components/landing/contact-section"
import { Footer } from "@/components/landing/footer"

function SectionDivider() {
  return (
    <div className="flex items-center justify-center gap-2 py-1 opacity-50">
      <div className="h-px w-20 bg-gradient-to-r from-transparent to-primary/40 rounded-full" />
      <div className="w-1 h-1 rounded-full bg-primary/40" />
      <div className="w-1.5 h-1.5 rounded-full bg-primary/60" />
      <div className="w-1 h-1 rounded-full bg-primary/40" />
      <div className="h-px w-20 bg-gradient-to-l from-transparent to-primary/40 rounded-full" />
    </div>
  )
}

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
            {/* Fondo global fijo — blobs + grid */}
            <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
              <div className="absolute -top-48 -left-48 w-[700px] h-[700px] rounded-full bg-primary/7 blur-[140px]" />
              <div className="absolute top-[30%] -right-40 w-[550px] h-[550px] rounded-full bg-primary/5 blur-[110px]" />
              <div className="absolute top-[62%] -left-24 w-[480px] h-[480px] rounded-full bg-primary/4 blur-[100px]" />
              <div className="absolute bottom-0 right-[20%] w-[500px] h-[500px] rounded-full bg-primary/5 blur-[120px]" />
              <div
                className="absolute inset-0 opacity-[0.022]"
                style={{
                  backgroundImage: "linear-gradient(var(--foreground) 1px, transparent 1px), linear-gradient(90deg, var(--foreground) 1px, transparent 1px)",
                  backgroundSize: "72px 72px",
                }}
              />
            </div>

            {/* Scroll progress — G */}
            <div className="fixed left-5 top-1/2 -translate-y-1/2 w-0.5 h-36 rounded-full bg-border/40 z-50 hidden lg:block">
              <motion.div
                className="w-full rounded-full bg-primary origin-top"
                style={{ scaleY: scrollYProgress, height: "100%" }}
              />
            </div>

            <div className="relative z-10">
              <Header />
              <main>
                <HeroSection />
                <SectionDivider />
                <WhatIsSection />
                <SectionDivider />
                <TargetSection />
                <SectionDivider />
                <HowItWorksSection />
                <SectionDivider />
                <PreciosSection />
                <SectionDivider />
                <ContactSection />
              </main>
              <Footer />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
