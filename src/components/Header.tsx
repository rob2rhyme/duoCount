// src/components/Header.tsx

import React from "react";
import Image from "next/image";
import styles from "../styles/Header.module.css";

const Header = () => {
  return (
    <header className={styles.header}>
      <div className={styles.container}>
        <Image
          src="/logo.png"
          alt="Smokers Haven Logo"
          width={40}
          height={40}
          className={styles.logo}
        />
        <h1 className={styles.title}>Smokers Haven Inventory Tracker</h1>
      </div>
    </header>
  );
};

export default Header;
