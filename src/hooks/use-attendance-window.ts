
'use client';

import { useEffect, useState, useMemo } from "react";
import { useDoc } from "../firebase/firestore/use-doc.tsx";
import { useUser, useFirestore } from "@/firebase";
import { doc } from "firebase/firestore";

/**
 * Hook ini adalah sumber kebenaran tunggal untuk status jendela absensi.
 * Membaca dari dokumen 'schoolConfig/default' dan menghormati pengaturan
 * 'useTimeValidation' yang dikendalikan oleh admin.
 */

export interface SchoolConfig {
  isAttendanceActive?: boolean;
  useTimeValidation?: boolean;
  checkInStartTime?: string;
  checkInEndTime?: string;
  checkOutStartTime?: string;
  checkOutEndTime?: string;
  dailyCheckOutTimes?: Record<string, { start: string, end: string }>;
}

export type AttendanceWindowStatus =
  | "LOADING"          // Keadaan awal, menunggu konfigurasi.
  | "SESSION_INACTIVE" // Sistem absensi dinonaktifkan secara manual oleh admin.
  | "CHECK_IN_OPEN"    // Jendela absen masuk sedang terbuka.
  | "CHECK_OUT_OPEN"   // Jendela absen pulang sedang terbuka.
  | "CLOSED";          // Di luar jendela waktu yang ditentukan.

export const useAttendanceWindow = () => {
  const [status, setStatus] = useState<AttendanceWindowStatus>("LOADING");
  const { user } = useUser();
  const firestore = useFirestore();

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

    // Kasus 1: Dokumen konfigurasi tidak ada sama sekali.
    if (!config) {
      setStatus("SESSION_INACTIVE"); 
      return;
    }

    // Kasus 2: Admin telah menonaktifkan sistem absensi secara manual.
    if (config.isAttendanceActive === false) {
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
        const dayOfWeek = now.getDay().toString();

        // Kasus 3: Admin mematikan validasi waktu. Sesi dianggap selalu terbuka.
        if (config.useTimeValidation === false) {
            setStatus("CHECK_IN_OPEN");
            return;
        }

        // Kasus 4: Validasi waktu aktif. Periksa jadwal.
        // Pick daily check-out time if available, otherwise global default
        const dailyOut = config.dailyCheckOutTimes?.[dayOfWeek];
        const checkinStartStr = config.checkInStartTime;
        const checkinEndStr = config.checkInEndTime;
        const checkoutStartStr = dailyOut?.start || config.checkOutStartTime;
        const checkoutEndStr = dailyOut?.end || config.checkOutEndTime;

        if (
            !checkinStartStr || !checkinEndStr ||
            !checkoutStartStr || !checkoutEndStr
        ) {
            setStatus("CLOSED");
            console.warn("Konfigurasi jam absen (schoolConfig) belum lengkap di database.");
            return;
        }

        const checkinStart = parseTime(checkinStartStr);
        const checkinEnd = parseTime(checkinEndStr);
        const checkoutStart = parseTime(checkoutStartStr);
        const checkoutEnd = parseTime(checkoutEndStr);

        if (now >= checkinStart && now <= checkinEnd) {
            setStatus("CHECK_IN_OPEN");
        } else if (now >= checkoutStart && now <= checkoutEnd) {
            setStatus("CHECK_OUT_OPEN");
        } else {
            setStatus("CLOSED");
        }
    };

    checkStatus();
    const intervalId = setInterval(checkStatus, 60000); // Periksa setiap menit.

    return () => clearInterval(intervalId);
    
  }, [config, configLoading]);

  return { status, config };
};
