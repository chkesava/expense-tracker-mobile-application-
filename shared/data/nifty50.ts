/**
 * NIFTY 50 constituents, the universe the Markets tab ranks movers in
 * (SPENDLY-622, story SPENDLY-643).
 *
 * Source: NSE Indices, ind_nifty50list.csv
 * (https://www.niftyindices.com/IndexConstituent/ind_nifty50list.csv),
 * Last-Modified 2026-10-30. Names are NSE's company names; symbols are the
 * NSE symbol plus Yahoo's ".NS" suffix.
 *
 * NSE rebalances the index twice a year (March and September). Re-download the
 * CSV after each rebalance, regenerate this list and move NIFTY50_AS_OF,
 * which the API reports as `movers.universeAsOf`.
 */

export const NIFTY50_AS_OF = "2026-10-30";

export interface Nifty50Constituent {
  symbol: string;
  name: string;
}

export const NIFTY50: readonly Nifty50Constituent[] = [
  { symbol: "ADANIENT.NS", name: "Adani Enterprises Ltd." },
  { symbol: "ADANIPORTS.NS", name: "Adani Ports and Special Economic Zone Ltd." },
  { symbol: "APOLLOHOSP.NS", name: "Apollo Hospitals Enterprise Ltd." },
  { symbol: "ASIANPAINT.NS", name: "Asian Paints Ltd." },
  { symbol: "AXISBANK.NS", name: "Axis Bank Ltd." },
  { symbol: "BSE.NS", name: "BSE Ltd." },
  { symbol: "BAJAJ-AUTO.NS", name: "Bajaj Auto Ltd." },
  { symbol: "BAJFINANCE.NS", name: "Bajaj Finance Ltd." },
  { symbol: "BAJAJFINSV.NS", name: "Bajaj Finserv Ltd." },
  { symbol: "BEL.NS", name: "Bharat Electronics Ltd." },
  { symbol: "BHARTIARTL.NS", name: "Bharti Airtel Ltd." },
  { symbol: "CIPLA.NS", name: "Cipla Ltd." },
  { symbol: "COALINDIA.NS", name: "Coal India Ltd." },
  { symbol: "DRREDDY.NS", name: "Dr. Reddy's Laboratories Ltd." },
  { symbol: "EICHERMOT.NS", name: "Eicher Motors Ltd." },
  { symbol: "ETERNAL.NS", name: "Eternal Ltd." },
  { symbol: "GRASIM.NS", name: "Grasim Industries Ltd." },
  { symbol: "HCLTECH.NS", name: "HCL Technologies Ltd." },
  { symbol: "HDFCBANK.NS", name: "HDFC Bank Ltd." },
  { symbol: "HDFCLIFE.NS", name: "HDFC Life Insurance Company Ltd." },
  { symbol: "HINDALCO.NS", name: "Hindalco Industries Ltd." },
  { symbol: "HINDUNILVR.NS", name: "Hindustan Unilever Ltd." },
  { symbol: "ICICIBANK.NS", name: "ICICI Bank Ltd." },
  { symbol: "ITC.NS", name: "ITC Ltd." },
  { symbol: "INFY.NS", name: "Infosys Ltd." },
  { symbol: "INDIGO.NS", name: "InterGlobe Aviation Ltd." },
  { symbol: "JSWSTEEL.NS", name: "JSW Steel Ltd." },
  { symbol: "JIOFIN.NS", name: "Jio Financial Services Ltd." },
  { symbol: "KOTAKBANK.NS", name: "Kotak Mahindra Bank Ltd." },
  { symbol: "LT.NS", name: "Larsen & Toubro Ltd." },
  { symbol: "M&M.NS", name: "Mahindra & Mahindra Ltd." },
  { symbol: "MARUTI.NS", name: "Maruti Suzuki India Ltd." },
  { symbol: "MAXHEALTH.NS", name: "Max Healthcare Institute Ltd." },
  { symbol: "NTPC.NS", name: "NTPC Ltd." },
  { symbol: "NESTLEIND.NS", name: "Nestle India Ltd." },
  { symbol: "ONGC.NS", name: "Oil & Natural Gas Corporation Ltd." },
  { symbol: "POWERGRID.NS", name: "Power Grid Corporation of India Ltd." },
  { symbol: "RELIANCE.NS", name: "Reliance Industries Ltd." },
  { symbol: "SBILIFE.NS", name: "SBI Life Insurance Company Ltd." },
  { symbol: "SHRIRAMFIN.NS", name: "Shriram Finance Ltd." },
  { symbol: "SBIN.NS", name: "State Bank of India" },
  { symbol: "SUNPHARMA.NS", name: "Sun Pharmaceutical Industries Ltd." },
  { symbol: "TCS.NS", name: "Tata Consultancy Services Ltd." },
  { symbol: "TATACONSUM.NS", name: "Tata Consumer Products Ltd." },
  { symbol: "TMPV.NS", name: "Tata Motors Passenger Vehicles Ltd." },
  { symbol: "TATASTEEL.NS", name: "Tata Steel Ltd." },
  { symbol: "TECHM.NS", name: "Tech Mahindra Ltd." },
  { symbol: "TITAN.NS", name: "Titan Company Ltd." },
  { symbol: "TRENT.NS", name: "Trent Ltd." },
  { symbol: "ULTRACEMCO.NS", name: "UltraTech Cement Ltd." },
];
