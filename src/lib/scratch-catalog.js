// Bundled reference catalog: Pennsylvania Lottery instant (scratch-off) games.
// Keyed by the 4-digit GAME NUMBER -> { name, price, perPack (tickets per book) }.
// Source: PA Lottery "Scratch Games UPC Listing", 2026-08-11 new-game release.
//
// This is a CONVENIENCE lookup only. When a scanned or typed pack's game number
// is known, the Game name + Ticket price fill in automatically, so a brand-new
// book needs no manual typing (the barcode itself carries no name/price text).
// It NEVER supplies or overrides the audited ticket numbers — start/end come
// only from the signed, countersigned counts the theft audit is built on, and
// every filled field stays editable and is reviewed before the signed save.
//
// State-specific: other lotteries number games and lay out barcodes differently,
// so this table (and CATALOG_META) is the one place to swap in another state or,
// later, a per-vendor uploaded listing. A game number not in the table simply
// declines to auto-fill rather than inventing a wrong game.

export const CATALOG_META = Object.freeze({
  state: "PA",
  source: "PA Lottery Scratch Games UPC Listing",
  updated: "2026-08-11",
});

export const SCRATCH_CATALOG = Object.freeze({
  "1801": { name: "THE WIZARD OF OZ™ GLINDA THE GOOD WITCH", price: 1, perPack: 100 },
  "1800": { name: "Winner Winner Chicken Dinner", price: 2, perPack: 100 },
  "1799": { name: "THE WIZARD OF OZ™ YELLOW BRICK ROAD", price: 5, perPack: 60 },
  "1798": { name: "THE WIZARD OF OZ™ THE GREAT AND POWERFUL OZ", price: 10, perPack: 60 },
  "1797": { name: "Snake, Rattle and Roll", price: 20, perPack: 30 },
  "1796": { name: "Ca$h Money", price: 50, perPack: 50 },
  "1795": { name: "Bright Buck$", price: 1, perPack: 100 },
  "1794": { name: "$20 Frenzy", price: 2, perPack: 100 },
  "1793": { name: "Crossword Deluxe", price: 5, perPack: 60 },
  "1792": { name: "Wild Side", price: 5, perPack: 60 },
  "1791": { name: "VIP Bonus Cash", price: 10, perPack: 60 },
  "1790": { name: "$1,500,000 Super Star", price: 30, perPack: 30 },
  "1789": { name: "Super 7s", price: 2, perPack: 100 },
  "1788": { name: "Lights, Camera, Crossword", price: 3, perPack: 100 },
  "1787": { name: "Fever Doubler", price: 5, perPack: 60 },
  "1786": { name: "Ruby Rich3s", price: 10, perPack: 60 },
  "1785": { name: "THE GAME OF LIFE™", price: 20, perPack: 30 },
  "1784": { name: "Million Dollar Win It All", price: 50, perPack: 50 },
  "1783": { name: "Gold Fish", price: 1, perPack: 100 },
  "1782": { name: "Gus", price: 5, perPack: 60 },
  "1781": { name: "Win Win Win", price: 10, perPack: 60 },
  "1780": { name: "Triple Red 777", price: 30, perPack: 30 },
  "1779": { name: "A Latte Money", price: 1, perPack: 100 },
  "1778": { name: "Money Rush", price: 2, perPack: 100 },
  "1777": { name: "Money Box Bingo", price: 5, perPack: 60 },
  "1776": { name: "$100 Blowout", price: 5, perPack: 60 },
  "1775": { name: "$250 Blowout", price: 10, perPack: 60 },
  "1774": { name: "$500 Blowout", price: 20, perPack: 30 },
  "1773": { name: "5 Star Wins", price: 1, perPack: 100 },
  "1772": { name: "Find the Leprechaun", price: 2, perPack: 100 },
  "1771": { name: "Big Bonus Triple Play", price: 5, perPack: 60 },
  "1770": { name: "PHILADELPHIA 76ERS", price: 5, perPack: 60 },
  "1769": { name: "Code Word Crossword", price: 10, perPack: 60 },
  "1768": { name: "$120,000,000 Payout", price: 30, perPack: 30 },
  "1767": { name: "$500 a Week for Life", price: 1, perPack: 100 },
  "1766": { name: "LOVE IS BLIND", price: 2, perPack: 100 },
  "1765": { name: "$10,000 a Month for Life", price: 5, perPack: 60 },
  "1764": { name: "$20,000 a Month for Life", price: 10, perPack: 60 },
  "1763": { name: "$500,000 a Year for Life", price: 20, perPack: 30 },
  "1762": { name: "$1,000,000 a Year for Life", price: 50, perPack: 50 },
  "1761": { name: "Ho Ho Ho", price: 1, perPack: 100 },
  "1760": { name: "Snow Place Like Home", price: 2, perPack: 150 },
  "1759": { name: "Trim the Tree X-word", price: 3, perPack: 100 },
  "1758": { name: "ELF", price: 5, perPack: 60 },
  "1757": { name: "$2,500 Festive Frenzy", price: 10, perPack: 60 },
  "1756": { name: "Fro$ted Fortune", price: 20, perPack: 30 },
  "1755": { name: "Merry Money Match", price: 30, perPack: 30 },
  "1754": { name: "Mini Monsters $100 Blowout", price: 2, perPack: 150 },
  "1753": { name: "Crossword Extra", price: 3, perPack: 100 },
  "1752": { name: "Winning 7s", price: 5, perPack: 60 },
  "1751": { name: "Extreme Green", price: 10, perPack: 60 },
  "1750": { name: "Cash Spectacular", price: 30, perPack: 30 },
  "1749": { name: "Simply a Buck", price: 1, perPack: 100 },
  "1748": { name: "Money Maker", price: 5, perPack: 60 },
  "1747": { name: "JURASSIC PARK", price: 10, perPack: 60 },
  "1746": { name: "Millionaire Loading", price: 20, perPack: 30 },
  "1745": { name: "Win Pigs Fly", price: 2, perPack: 150 },
  "1744": { name: "Goat Load of Cash Crossword", price: 5, perPack: 60 },
  "1743": { name: "$50, $100 or $500", price: 10, perPack: 60 },
  "1742": { name: "$3 Million Mega Moolah Multiplier", price: 30, perPack: 30 },
  "1741": { name: "Win It All", price: 1, perPack: 100 },
  "1740": { name: "Bonus Ball Bingo", price: 3, perPack: 100 },
  "1739": { name: "MONOPOLY® SECRET VAULT", price: 5, perPack: 60 },
  "1738": { name: "Jackpot", price: 20, perPack: 30 },
  "1737": { name: "Neon 9s", price: 2, perPack: 150 },
  "1736": { name: "High 5", price: 5, perPack: 60 },
  "1735": { name: "Six Figures", price: 10, perPack: 60 },
  "1734": { name: "3s a Charm", price: 30, perPack: 30 },
  "1733": { name: "20X the Cash", price: 1, perPack: 100 },
  "1732": { name: "50X the Cash", price: 2, perPack: 150 },
  "1731": { name: "Blingo", price: 5, perPack: 60 },
  "1730": { name: "100X the Cash", price: 5, perPack: 60 },
  "1729": { name: "200X the Cash", price: 20, perPack: 30 },
  "1728": { name: "Sham-rockin' Surprize", price: 1, perPack: 100 },
  "1727": { name: "Four Leaf Frenzy", price: 2, perPack: 150 },
  "1725": { name: "All About Money", price: 5, perPack: 60 },
  "1724": { name: "Lady Luck", price: 10, perPack: 60 },
  "1723": { name: "The Hunt for $3,000,000", price: 30, perPack: 30 },
  "1719": { name: "Fast $1,000", price: 10, perPack: 60 },
  "1718": { name: "$1,000,000 Winnings", price: 20, perPack: 30 },
  "1717": { name: "$5,000,000 Lion's Share", price: 50, perPack: 50 },
  "1707": { name: "Lucky 13", price: 5, perPack: 60 },
  "1706": { name: "GAME OF THRONES™", price: 10, perPack: 60 },
  "1705": { name: "$3,000,000 Golden Ticket", price: 30, perPack: 30 },
  "1703": { name: "S'more Crossword", price: 3, perPack: 100 },
  "1702": { name: "Power $500", price: 5, perPack: 60 },
  "1701": { name: "$500,000 Bonus Crossword", price: 10, perPack: 60 },
  "1700": { name: "All Cash", price: 20, perPack: 30 },
  "1696": { name: "Mega Bucks", price: 30, perPack: 30 },
  "1693": { name: "Keys and Cash", price: 5, perPack: 60 },
  "1690": { name: "Crossword Bonus Cash", price: 3, perPack: 100 },
  "1682": { name: "$160 Million Cash Blowout", price: 30, perPack: 30 },
  "1671": { name: "Bonus Star Bingo", price: 3, perPack: 100 },
  "1669": { name: "$1 Million Moneybag Crossword", price: 20, perPack: 30 },
  "1668": { name: "MONOPOLY™ Own It All", price: 50, perPack: 50 },
});

// The digits a PA game number can appear as inside a scanned code:
//   - a per-ticket / pack barcode LEADS with the 4-digit game number
//     (game + book + 3-digit ticket), so the first 4 digits are the game;
//   - the 12-digit retail UPC is 6-44018-1GGGG-C, so the game number sits in the
//     product portion at digits [7,11).
// We try each layout and accept ONLY a value that is a known game, so an
// unrecognized format quietly declines instead of guessing a wrong game.
export function resolveCatalogGame(raw, catalog = SCRATCH_CATALOG) {
  const s = String(raw ?? "").replace(/\D/g, "");
  if (!s) return null;
  const candidates = [];
  if (s.length >= 7) candidates.push(s.slice(0, 4));      // per-ticket barcode
  if (s.length === 12) candidates.push(s.slice(7, 11));   // retail UPC embed
  for (const c of candidates) {
    if (!/^\d+$/.test(c)) continue;
    const key = String(Number(c)); // normalize any leading zeros ("01801" -> "1801")
    if (catalog[key]) return { game: key, ...catalog[key] };
  }
  return null;
}
