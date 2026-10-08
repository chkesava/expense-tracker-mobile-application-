import { initializeApp, applicationDefault, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function loadCredential() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw) return cert(JSON.parse(raw));
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return applicationDefault();
  throw new Error(
    "Set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON path, or FIREBASE_SERVICE_ACCOUNT to its contents."
  );
}

const app = initializeApp({ credential: loadCredential() });
const db = getFirestore(app);

async function rebuildDomainSummaries() {
  const usersResult = await getAuth(app).listUsers();
  
  for (const user of usersResult.users) {
    const uid = user.uid;
    console.log(`Rebuilding for ${uid}...`);

    // 1. Rebuild Investments
    const holdingsSnap = await db.collection(`users/${uid}/holdings`).get();
    let investmentCash = 0;
    const settingsSnap = await db.collection(`users/${uid}/portfolioSettings`).doc("settings").get();
    if (settingsSnap.exists) {
      investmentCash = settingsSnap.data()?.cashBalance || 0;
    }

    let holdingsMarketValue = 0;
    let investedValue = 0;
    let holdingCount = 0;
    
    holdingsSnap.forEach((doc) => {
      const data = doc.data();
      const qty = data.quantity || 0;
      if (qty > 0) {
        holdingCount++;
        const avg = data.averageBuyPrice || 0;
        investedValue += qty * avg;
        holdingsMarketValue += qty * avg; // Fallback
      }
    });

    const fdSnap = await db.collection(`users/${uid}/accounts`).where("kind", "==", "fixed_deposit").get();
    let fdPrincipalTotal = 0;
    let fdCurrentValue = 0;
    fdSnap.forEach((doc) => {
      const data = doc.data();
      fdPrincipalTotal += data.principal || 0;
      fdCurrentValue += data.currentBalance || data.principal || 0;
    });

    await db.collection(`users/${uid}/financialSummaries`).doc("investments").set({
      investmentCash,
      holdingsMarketValue,
      investedValue,
      unrealisedPnL: 0,
      realisedPnL: 0,
      holdingCount,
      fdPrincipalTotal,
      fdCurrentValue,
      calculatedAt: new Date().toISOString(),
      summaryVersion: 1,
    }, { merge: true });

    // 2. Rebuild EPF
    const epfSnap = await db.collection(`users/${uid}/epfContributions`).get();
    let employee = 0;
    let employer = 0;
    epfSnap.forEach((doc) => {
      const data = doc.data();
      if (["credited", "overdue"].includes(data.status)) {
         employee += data.employeeShare || 0;
         employer += data.employerEpfShare || 0;
      }
    });
    
    let interest = 0;
    const intSnap = await db.collection(`users/${uid}/epfInterestEntries`).get();
    intSnap.forEach((doc) => {
       interest += doc.data().interest || 0;
    });

    let adjustmentsTotal = 0;
    const recSnap = await db.collection(`users/${uid}/epfReconciliations`).get();
    recSnap.forEach((doc) => {
       adjustmentsTotal += doc.data().adjustmentAmount || 0;
    });

    await db.collection(`users/${uid}/financialSummaries`).doc("epf").set({
      currentBalance: employee + employer + interest + adjustmentsTotal,
      employeeContributionTotal: employee,
      employerContributionTotal: employer,
      interestTotal: interest,
      adjustmentsTotal,
      lastCreditPeriod: null,
      calculatedAt: new Date().toISOString(),
      summaryVersion: 1,
    }, { merge: true });

    console.log(`Finished ${uid}`);
  }
}

if (require.main === module) {
  rebuildDomainSummaries().then(() => process.exit(0)).catch(console.error);
}
