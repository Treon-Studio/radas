"use client";

import Link from "next/link";

import { Builder } from "../builder";
import { Spotlight } from "./spotlight";

import GlitchText from "@/components/ui/glitch-text";


export default function Hero() {
    return (
        <section className="max-h-[40rem] relative w-full flex md:items-center md:justify-center dark:bg-black/[0.96] antialiased bg-grid-white/[0.02] overflow-hidden px-8 md:min-h-[40rem]">
            <Spotlight />
            <div className="overflow-hidden bg-transparent md:px-10 dark:-mb-32 dark:mt-[-4.75rem] dark:pb-32 dark:pt-[4.75rem] flex flex-col items-center text-center">
                <div className="mb-8">
                    <h1 className="text-6xl md:text-8xl font-bold mb-6 bg-gradient-to-r from-white via-gray-300 to-white bg-clip-text text-transparent" style={{ fontFamily: 'Geist, sans-serif' }}>
                        <GlitchText text="RADAS" delay={500} />
                    </h1>
                    <p className="text-xl md:text-2xl text-gray-400 font-mono max-w-3xl mx-auto leading-relaxed">
                        <GlitchText
                            text="Revolutionizing workflows for Frontend, Backend, DevOps, and Design teams. Build production-ready applications in minutes, not hours."
                            delay={2500}
                            speed={20}
                        />
                    </p>
                </div>

                <div className="mt-4 flex w-fit flex-col gap-4 font-sans md:flex-row md:justify-center lg:justify-start items-center">
                    <Link
                        href="/docs"
                        className="hover:shadow-sm dark:border-stone-100 dark:hover:shadow-sm border-2 border-black bg-white px-4 py-1.5 text-sm uppercase text-black shadow-[1px_1px_rgba(0,0,0),2px_2px_rgba(0,0,0),3px_3px_rgba(0,0,0),4px_4px_rgba(0,0,0),5px_5px_0px_0px_rgba(0,0,0)] transition duration-200 md:px-8 dark:shadow-[1px_1px_rgba(255,255,255),2px_2px_rgba(255,255,255),3px_3px_rgba(255,255,255),4px_4px_rgba(255,255,255),5px_5px_0px_0px_rgba(255,255,255)]"
                    >
                        Get Started
                    </Link>
                    <Builder />
                </div>

            </div>
        </section>
    );
}
