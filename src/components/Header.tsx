// src/components/Header.tsx

import React from "react";
import Image from "next/image";
import styles from "../styles/Header.module.css";
import { appConfig } from "@/config/app.config";

const Header = () => {
  return (
    <header className={styles.header}>
      <div className={styles.container}>
        <Image
          src={appConfig.logoSrc}
          alt={`${appConfig.appName} logo`}
          width={40}
          height={40}
          className={styles.logo}
        />
        <h1 className={styles.title}>{appConfig.appName}</h1>
      </div>
    </header>
  );
};

export default Header;
