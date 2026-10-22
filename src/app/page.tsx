import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Captions, Film, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

const FEATURES = [
  { icon: Sparkles, title: "AI moment detection", text: "Transcribes speech and ranks the strongest ≤60s moments by hook, payoff and standalone context." },
  { icon: Captions, title: "Synced captions", text: "Word-level subtitles burned in with four themes, plus a downloadable SRT." },
  { icon: Film, title: "Real FFmpeg rendering", text: "9:16, 16:9 and 1:1 MP4 exports rendered by a background worker." },
];

export default function Landing() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <Image src="/assets/hero-bg.png" alt="" fill priority className="object-cover opacity-50" />
      <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/70 to-background" />
      <div className="relative mx-auto flex max-w-5xl flex-col items-center px-6 pb-20 pt-10">
        <header className="flex w-full items-center justify-between">
          <div className="flex items-center gap-2">
            <Image src="/assets/logo.png" alt="" width={36} height={36} className="rounded-lg" />
            <span className="text-lg font-semibold">ClipForge AI</span>
          </div>
          <Button asChild variant="outline">
            <Link href="/login">Sign in</Link>
          </Button>
        </header>
        <h1 className="mt-24 max-w-3xl text-center text-4xl font-bold tracking-tight sm:text-6xl">
          Turn long videos into <span className="bg-gradient-to-r from-[#7C5CFF] to-[#4F46E5] bg-clip-text text-transparent">viral clips</span>
        </h1>
        <p className="mt-6 max-w-xl text-center text-muted-foreground">
          Upload a video you own, let AI find the best moments, and export captioned short-form clips in minutes.
        </p>
        <Button asChild size="lg" className="glow mt-8">
          <Link href="/login">
            Get started <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
        <div className="mt-20 grid gap-4 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-border bg-card/70 p-5 backdrop-blur">
              <f.icon className="mb-3 h-5 w-5 text-primary" />
              <h3 className="font-medium">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
