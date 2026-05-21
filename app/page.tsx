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
    <div className="flex items-center justify-center py-3">
      <div className="w-px h-12 bg-gradient-to-b from-transparent via-border/70 to-transparent" />
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
              <div className="absolute -top-48 -left-48 w-[700px] h-[700px] rounded-full bg-primary/10 blur-[160px]" />
              <div className="absolute top-[28%] -right-40 w-[580px] h-[580px] rounded-full bg-primary/7 blur-[130px]" />
              <div className="absolute top-[60%] -left-24 w-[500px] h-[500px] rounded-full bg-primary/6 blur-[110px]" />
              <div className="absolute bottom-0 right-[18%] w-[520px] h-[520px] rounded-full bg-primary/7 blur-[140px]" />
              {/* Acento ámbar cálido */}
              <div className="absolute top-[42%] right-[12%] w-[340px] h-[340px] rounded-full blur-[100px]" style={{ background: 'oklch(0.76 0.155 72 / 0.06)' }} />
              <div className="absolute top-[18%] left-[38%] w-[260px] h-[260px] rounded-full blur-[80px]" style={{ background: 'oklch(0.76 0.155 72 / 0.04)' }} />
              <div
                className="absolute inset-0 opacity-[0.016]"
                style={{
                  backgroundImage: "linear-gradient(var(--foreground) 1px, transparent 1px), linear-gradient(90deg, var(--foreground) 1px, transparent 1px)",
                  backgroundSize: "64px 64px",
                }}
              />
            </div>

            {/* Scroll progress */}
            <div className="fixed left-5 top-1/2 -translate-y-1/2 w-[1.5px] h-32 rounded-full bg-border/30 z-50 hidden lg:block">
              <motion.div
                className="w-full rounded-full bg-primary/70 origin-top"
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
