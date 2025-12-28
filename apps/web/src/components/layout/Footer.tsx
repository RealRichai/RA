"use client";

export function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-10 text-sm text-gray-600 md:flex-row md:items-center md:justify-between">
        <div>© {new Date().getFullYear()} RealRiches. All rights reserved.</div>
        <div className="flex gap-4">
          <span className="hover:text-gray-900">Privacy</span>
          <span className="hover:text-gray-900">Terms</span>
          <span className="hover:text-gray-900">Support</span>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
