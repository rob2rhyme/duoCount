// src/components/Header.tsx

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import styles from "../styles/Header.module.css";
import { appConfig } from "@/config/app.config";
import { useAuth } from "@/context/AuthContext";
import { ROLE_LABELS } from "@/utils/permissions";
import ThemeToggle from "./ThemeToggle";

const Header = () => {
  const router = useRouter();
  const { isAuthenticated, role, can, signOut } = useAuth();

  const handleSignOut = () => {
    if (confirm("Confirm sign out?")) signOut();
  };

  const isActive = (path: string) => router.pathname === path;

  return (
    <header className={styles.header}>
      <div className={styles.container}>
        <Link href="/" className={styles.brand}>
          <Image
            src={appConfig.logoSrc}
            alt={`${appConfig.appName} logo`}
            width={36}
            height={36}
            className={styles.logo}
          />
          <span className={styles.title}>{appConfig.appName}</span>
        </Link>

        {isAuthenticated && (
          <nav className={styles.nav}>
            <Link
              href="/"
              className={`${styles.navLink} ${
                isActive("/") ? styles.navLinkActive : ""
              }`}
            >
              Inventory
            </Link>
            {can("viewDashboard") && (
              <Link
                href="/dashboard"
                className={`${styles.navLink} ${
                  isActive("/dashboard") ? styles.navLinkActive : ""
                }`}
              >
                Dashboard
              </Link>
            )}
            <Link
              href="/reorder"
              className={`${styles.navLink} ${
                isActive("/reorder") ? styles.navLinkActive : ""
              }`}
            >
              Reorder
            </Link>
            {can("manageSuppliers") && (
              <Link
                href="/suppliers"
                className={`${styles.navLink} ${
                  isActive("/suppliers") ? styles.navLinkActive : ""
                }`}
              >
                Suppliers
              </Link>
            )}
            {can("manageUsers") && (
              <Link
                href="/activity"
                className={`${styles.navLink} ${
                  isActive("/activity") ? styles.navLinkActive : ""
                }`}
              >
                Activity
              </Link>
            )}
            <Link
              href="/settings"
              className={`${styles.navLink} ${
                isActive("/settings") ? styles.navLinkActive : ""
              }`}
            >
              Settings
            </Link>
          </nav>
        )}

        {isAuthenticated && (
          <div className={styles.right}>
            {role && (
              <span className={styles.roleBadge} title="Your access level">
                {ROLE_LABELS[role]}
              </span>
            )}
            <ThemeToggle />
            <button className={styles.signOut} onClick={handleSignOut}>
              Sign Out
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
