
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();

/**
 * Sets a custom user claim (role) whenever a user's document in
 * Firestore is created or updated.
 */
export const onUserRoleChange = functions.region("asia-southeast1").firestore
    .document("users/{userId}")
    .onWrite(async (change, context) => {
      const { userId } = context.params;
      const newRole = change.after.exists ? change.after.data()?.role : null;
      const oldRole = change.before.exists ? change.before.data()?.role : null;

      // If the role hasn't changed, do nothing.
      if (newRole === oldRole) {
        functions.logger.log(`Role for user ${userId} is unchanged. Exiting.`);
        return null;
      }

      try {
        // Set the custom claim on the user's authentication token.
        await admin.auth().setCustomUserClaims(userId, { role: newRole });
        functions.logger.log(
            `SUCCESS: Custom claim set for user ${userId}. New role: ${newRole}`
        );
        return null;
      } catch (error) {
        functions.logger.error(
            `ERROR setting custom claim for user ${userId}:`,
            error
        );
        return null;
      }
    });
