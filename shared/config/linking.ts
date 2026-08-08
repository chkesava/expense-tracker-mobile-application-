import * as Linking from "expo-linking";

/**
 * Deep linking configuration for Android & iOS
 * Schemes: expensetrackermobile://
 */
export const linkingConfig = {
  prefixes: [
    Linking.createURL("/"),
    "expensetrackermobile://",
    "https://vault.kesava.dev",
  ],
  config: {
    screens: {
      "(app)": {
        screens: {
          dashboard: "dashboard",
          ledger: "ledger",
          vaults: "vaults",
          insights: "insights",
          settings: "settings",
          "app-selector": "app-selector",
          "accounts/[id]": "accounts/:id",
          add: "add",
        },
      },
      "(auth)": {
        screens: {
          login: "login",
        },
      },
      "(nutrition)": {
        screens: {
          index: "nutrition",
          profile: "nutrition/profile",
          scanner: "nutrition/scanner",
          log: "nutrition/log",
        },
      },
      "google-auth": "google-auth",
      "+not-found": "*",
    },
  },
};
