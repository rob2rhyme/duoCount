import React from "react";
import styles from "../styles/Footer.module.css";
import { appConfig } from "@/config/app.config";

const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className={styles.footerContent}>
        <span>
          © {currentYear} {appConfig.shortName} · Built by{" "}
        </span>
        <a
          href={appConfig.author.url}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.link}
        >
          {appConfig.author.name}
        </a>
      </div>
    </footer>
  );
};

export default Footer;
