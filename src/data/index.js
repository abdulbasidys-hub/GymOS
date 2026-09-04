// The single data interface.
//
// Everything in the app imports from "src/data" — never from firebase.js or
// from the Firebase SDK directly. That keeps all knowledge of *where* and *how*
// data is stored inside this one folder. Swapping to SQLite under Electron
// later means re-pointing the exports here; no screen changes.

export { auth } from "./firebase";
export { appendRecord, appendAdjustment } from "./ledger";
export {
  watchAuth,
  signInWithUsername,
  signOutUser,
  getUserRecord,
  watchUserRecord,
  changeOwnPassword,
  changePassword,
} from "./accounts";
export {
  createGym,
  listGyms,
  getGym,
  watchGym,
  updateGymName,
  suspendGym,
  reactivateGym,
  listGymsByAffiliate,
} from "./gyms";
export {
  setOwnerSubscription,
  lockOwnerSubscription,
  unlockOwnerSubscription,
} from "./subscriptions";
export {
  createOwner,
  createReceptionist,
  createAffiliate,
  listOwners,
  getOwnerForGym,
  addBranchToOwner,
  listStaff,
  listAffiliates,
  setUserActive,
  setUserPhone,
  setUserEmail,
  setAffiliateBankDetails,
} from "./users";
export {
  recordAffiliateEarning,
  listEarningsByAffiliate,
  listAllAffiliateEarnings,
  markAffiliateEarningsPaid,
} from "./affiliateEarnings";
export { getPlatformSettings, setAffiliateCommissionPercent } from "./platformSettings";
export {
  createPlan,
  listPlans,
  updatePlan,
  retirePlan,
  reactivatePlan,
} from "./plans";
export {
  createCustomField,
  listCustomFields,
  updateCustomField,
  retireCustomField,
  reactivateCustomField,
  deleteCustomField,
} from "./customFields";
// TESTING ONLY — see dangerZone.js for why this one export breaks the
// "nothing is ever hard-deleted" rule every other collection follows.
export { deleteGymAndAllData } from "./dangerZone";
export {
  createPlatformPlan,
  listPlatformPlans,
  updatePlatformPlan,
  retirePlatformPlan,
  reactivatePlatformPlan,
} from "./platformPlans";
export {
  createPlatformPayment,
  listPlatformPayments,
  listPlatformPaymentsByOwner,
} from "./platformPayments";
export { createMember, getMember, listMembers, searchMembers, updateMember } from "./members";
export { uploadMemberPhoto } from "./memberPhotos";
export { createPayment, listPaymentsByGym, listPaymentsByMember } from "./payments";
export { recordAttendance, listAttendanceByGym, listAttendanceByMember } from "./attendance";
export {
  createMembershipRecord,
  listMembershipRecords,
  listMembershipRecordsByGym,
} from "./membershipRecords";
export {
  createEquipmentRecord,
  listEquipmentRecords,
  listEquipmentRecordsByGym,
} from "./equipmentRecords";
export { logActivity, listActivityByGym } from "./activityLog";
export { logAdminActivity, listRecentAdminActivity } from "./adminActivityLog";
export {
  DOWNLOAD_KINDS,
  listDownloads,
  getDownload,
  setDownloadLink,
  uploadDownload,
  removeDownload,
} from "./downloads";
