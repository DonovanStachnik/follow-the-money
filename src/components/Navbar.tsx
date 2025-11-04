export default function Navbar() {
  return (
    <header className="sticky top-0 z-30 backdrop-blur bg-slate-900/70 border-b border-slate-800">
      <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-indigo-500" />
          <span className="font-semibold"><a href="/" className="inline-flex items-center gap-2 no-underline text-inherit"><img src="/logo.svg" alt="Follow The Money" width="26" height="26"/><span className="font-semibold">Follow The Money</span></a></span>
        </div>
        <nav className="flex items-center gap-4 text-sm text-slate-300">
          <a className="hover:text-white" href="#heatmap">Heatmap</a>
          <a className="hover:text-white" href="#flow">Activity</a>
          <a className="hover:text-white" href="#top">Trending</a>
        <a href="/disclaimer" className="text-gray-400 ml-4">Disclaimer</a></nav>
      </div>
    <a href="/disclaimer" className="text-gray-400 ml-4">Disclaimer</a></header>
  );
}

