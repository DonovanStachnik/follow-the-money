import Link from "next/link";
import Image from "next/image";

export default function Header() {
  return (
    <header style={{borderBottom: "1px solid rgba(255,255,255,0.08)"}} className="w-full bg-[#0b1220]">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/" aria-label="Follow The Money - Home" className="flex items-center gap-3">
          <Image src="/logo.svg" alt="Follow The Money" width={32} height={32} priority />
          <span className="text-white font-semibold text-lg tracking-wide">Follow The Money</span>
        </Link>
        <nav className="flex items-center gap-6">
          <Link href="/disclaimer" className="text-slate-300 hover:text-white transition-colors">Disclaimer</Link>
        </nav>
      </div>
    </header>
  );
}



