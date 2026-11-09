"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/roblox-builder", label: "Roblox Builder" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <Image
          src="/logo.png"
          alt="LiveFieldHQ logo"
          width={36}
          height={36}
          className="brand-logo"
          priority
        />
        <span className="brand-name">LiveFieldHQ</span>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-link${active ? " active" : ""}`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-footer">v0.1.0</div>
    </aside>
  );
}
