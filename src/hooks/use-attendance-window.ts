'use client';

import { useEffect, useState, useMemo } from "react";
import { useDoc } from "../firebase/firestore/use-doc.tsx";
import { useUser, useFirestore } from "@/firebase";
import { doc } from "firebase/firestore";

/**
 * MODIFIED AND FINAL VERSION
 * This hook is now the single source of truth for the attendance window status.
 * It reads from the centralized 'schoolConfig/default' document and respects
 * the 'useTimeValidation' setting controlled by the admin.
 */

// Interface for the centralized school configuration.
export interface SchoolConfig {
  isAttendanceActive?: boolean;
  useTimeValidation?: boolean;
  checkInStartTime?: string;
  checkInEndTime?: string;
  checkOutStartTime?: string;
  checkOutEndTime?: string;
}

export type AttendanceWindowStatus =
  | "LOADING"          // Initial state, waiting for config.
  | "SESSION_INACTIVE" // Attendance system is manually disabled by admin (e.g., holiday mode).
  | "CHECK_IN_OPEN"    // Check-in window is currently open.
  | "CHECK_OUT_OPEN"   // Check-out window is currently open.
  | "CLOSED";          // Outside of any defined time windows.

export const useAttendanceWindow = () => {
  const [status, setStatus] = useState<AttendanceWindowStatus>("LOADING");
  const { user } = useUser();
  const firestore = useFirestore();

  // Point to the single, correct configuration document.
  const configRef = useMemo(() => 
    firestore ? doc(firestore, "schoolConfig/default") : null,
    [firestore]
  );

  const { data: config, isLoading: configLoading } = useDoc<SchoolConfig>(
    user,
    configRef
  );

  useEffect(() => {
    if (configLoading) {
      setStatus("LOADING");
      return;
    }

    // Case 1: Configuration document doesn't exist at all.
    if (!config) {
      // This is a permanent state until config is created. No need for an interval.
      setStatus("SESSION_INACTIVE"); 
      console.warn(
        "Dokumen '/schoolConfig/default' tidak ditemukan. Buat konfigurasi di halaman Pengaturan Admin."
      );
      return;
    }

    // Case 2: Admin has manually disabled the attendance system via 'Mode Libur'.
    if (config.isAttendanceActive === false) {
      // This is also a permanent state until re-enabled.
      setStatus("SESSION_INACTIVE");
      return;
    }

    const parseTime = (timeStr: string): Date => {
      const now = new Date();
      const [hours, minutes] = timeStr.split(":").map(Number);
      now.setHours(hours, minutes, 0, 0);
      return now;
    };

    const checkStatus = () => {
        const now = new Date();

        // Case 3: Admin has turned OFF time validation.
        // The session is considered perpetually open. The UI will decide whether to show
        // Check-In or Check-Out based on the user's attendance record for the day.
        // For the window status itself, we can default to CHECK_IN_OPEN as a general open state.
        if (config.useTimeValidation === false) {
            setStatus("CHECK_IN_OPEN"); // Or a new more general 'ALWAYS_OPEN' status if needed.
            return;
        }

        // Case 4: Time validation is ON. Check against the schedule.
        if (
            !config.checkInStartTime || !config.checkInEndTime ||
            !config.checkOutStartTime || !config.checkOutEndTime
        ) {
            setStatus("CLOSED"); // Mark as closed if time settings are incomplete.
            console.error("Konfigurasi jam absen (schoolConfig) tidak lengkap.");
            return;
        }

        const checkinStart = parseTime(config.checkInStartTime);
        const checkinEnd = parseTime(config.checkInEndTime);
        const checkoutStart = parseTime(config.checkOutStartTime);
        const checkoutEnd = parseTime(config.checkOutEndTime);

        if (now >= checkinStart && now <= checkinEnd) {
            setStatus("CHECK_IN_OPEN");
        } else if (now >= checkoutStart && now <= checkoutEnd) {
            setStatus("CHECK_OUT_OPEN");
        } else {
            setStatus("CLOSED");
        }
    };

    checkStatus(); // Run once immediately.

    // Set up an interval to re-check the status periodically.
    // This is important for transitions between check-in, closed, and check-out states.
    const intervalId = setInterval(checkStatus, 60000); // Check every minute.

    // Cleanup the interval when the component unmounts or dependencies change.
    return () => clearInterval(intervalId);
    
  }, [config, configLoading]); // Effect dependencies.

  // Return the calculated status and the original config for other components to use.
  return { status, config };
};
