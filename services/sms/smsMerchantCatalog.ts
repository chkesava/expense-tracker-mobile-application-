/**
 * Canonical merchant names + SMS/UPI aliases (Phase 6).
 * Matching is done on a folded alphanumeric key, not these strings directly.
 */

export type SmsMerchantEntry = {
  canonical: string;
  /** Extra folded aliases beyond the canonical name itself. */
  aliases?: string[];
};

export const SMS_MERCHANT_CATALOG: SmsMerchantEntry[] = [
  {
    canonical: "Swiggy",
    aliases: ["swiggyin", "swiggyltd", "swiggyinstamart", "swiggygenie"],
  },
  {
    canonical: "Zomato",
    aliases: ["zomatoin", "zomatoltd", "zomatopay", "runnr"],
  },
  {
    canonical: "Amazon",
    aliases: ["amazonin", "amazonpay", "amzn", "amazonretail"],
  },
  {
    canonical: "Flipkart",
    aliases: ["flipkartin", "fkrt", "flipkartinternet"],
  },
  { canonical: "Myntra", aliases: ["myntrain"] },
  { canonical: "Meesho", aliases: ["meeshoin"] },
  {
    canonical: "Uber",
    aliases: ["uberin", "uberindia", "ubertrip", "uberride"],
  },
  { canonical: "Ola", aliases: ["olacabs", "olain", "olaride"] },
  { canonical: "Rapido", aliases: ["rapidoin"] },
  {
    canonical: "BigBasket",
    aliases: ["bigbasketin", "bbnow", "bigbasket"],
  },
  { canonical: "Blinkit", aliases: ["blinkitin", "grofers"] },
  { canonical: "Zepto", aliases: ["zeptoin"] },
  { canonical: "JioMart", aliases: ["jiomartin"] },
  { canonical: "Netflix", aliases: ["netflixin"] },
  { canonical: "Spotify", aliases: ["spotifyin"] },
  { canonical: "Hotstar", aliases: ["disneyhotstar", "jiocinema"] },
  { canonical: "YouTube", aliases: ["youtubepremium"] },
  { canonical: "Apple", aliases: ["apple.com", "applestore", "itunes"] },
  { canonical: "Google", aliases: ["googleone", "googleplay"] },
  { canonical: "Paytm", aliases: ["paytmin", "paytmpayments"] },
  { canonical: "PhonePe", aliases: ["phonepein"] },
  { canonical: "Google Pay", aliases: ["gpay", "googlepay"] },
  { canonical: "IRCTC", aliases: ["irctcin"] },
  { canonical: "MakeMyTrip", aliases: ["makemytripin", "mmt"] },
  { canonical: "BookMyShow", aliases: ["bms", "bookmyshowin"] },
  { canonical: "Dominos", aliases: ["dominospizza", "dominosin"] },
  { canonical: "McDonalds", aliases: ["mcdonald", "mcd"] },
  { canonical: "Starbucks", aliases: ["starbucksin"] },
  { canonical: "DMart", aliases: ["dmartin", "avenuesupermarts"] },
  { canonical: "Reliance", aliases: ["relianceretail"] },
  { canonical: "Airtel", aliases: ["airtelin", "airtelpayments"] },
  { canonical: "Jio", aliases: ["jioin", "reliancejio"] },
  { canonical: "BESCOM", aliases: ["bescomin"] },
  { canonical: "BPCL", aliases: ["bharatpetroleum"] },
  { canonical: "HPCL", aliases: ["hindustanpetroleum"] },
  { canonical: "IOCL", aliases: ["indianoil"] },
];
