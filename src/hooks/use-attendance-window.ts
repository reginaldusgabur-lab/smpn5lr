'use client';

import { useEffect, useState } from "react";
import { useCache } from "@/context/CacheContext";

/**
 * Hook useAttendanceWindow sekarang menggunakan data dari CacheContext.
 * Ini menghemat ribuan pembacaan database karena tidak lagi berlangganan ke dokumen 'schoolConfig' di setiap komponen.
 */

export interface SchoolConfig {
  isAttendanceActive?: boolean;
  useTimeValidation?: boolean;
  checkInStartTime?: string;
  checkInEndTime?: string;
  checkOutStartTime?: string;
  checkOutEndTime?: string;
  dailyCheckOutTimes?: Record<string, { start: string, end: string }>;
  offDays?: number[];
}

export type AttendanceWindowStatus =
  | "LOADING"          // Keadaan awal
  | "SESSION_INACTIVE" // Dinonaktifkan manual atau hari libur
  | "BEFORE_IN"        // Belum jam masuk
  | "CHECK_IN_OPEN"    // Jendela masuk terbuka
  | "AFTER_IN"         // Batas jam masuk berakhir (sebelum jam pulang)
  | "CHECK_OUT_OPEN"   // Jendela pulang terbuka
  | "CLOSED";          // Sesi hari ini berakhir

export const useAttendanceWindow = () => {
  const { schoolConfig: config, isCacheLoading: configLoading } = useCache();
  const [status, setStatus] = useState<AttendanceWindowStatus>("LOADING");

  useEffect(() => {
    if (configLoading) {
      setStatus("LOADING");
      return;
    }

    if (!config || config.isAttendanceActive === false) {
      setStatus("SESSION_INACTIVE"); 
      return;
    }

    const checkStatus = () => {
        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();
        const dayOfWeek = now.getDay();
        
        // Cek hari libur rutin
        const offDays = config.offDays ?? [0, 6];
        if (offDays.includes(dayOfWeek)) {
            setStatus("SESSION_INACTIVE");
            return;
        }

        if (config.useTimeValidation === false) {
            setStatus("CHECK_IN_OPEN");
            return;
        }

        const parseToMinutes = (timeStr: string) => {
            if (!timeStr) return 0;
            const [h, m] = timeStr.split(':').map(Number);
            return h * 60 + m;
        };

        const inStart = parseToMinutes(config.checkInStartTime || "00:00");
        const inEnd = parseToMinutes(config.checkInEndTime || "23:59");
        
        const dailyOut = config.dailyCheckOutTimes?.[dayOfWeek.toString()];
        const outStart = parseToMinutes(dailyOut?.start || config.checkOutStartTime || "14:00");
        const outEnd = parseToMinutes(dailyOut?.end || config.checkOutEndTime || "16:00");

        if (currentTime < inStart) {
            setStatus("BEFORE_IN");
        } else if (currentTime >= inStart && currentTime <= inEnd) {
            setStatus("CHECK_IN_OPEN");
        } else if (currentTime > inEnd && currentTime < outStart) {
            setStatus("AFTER_IN");
        } else if (currentTime >= outStart && currentTime <= outEnd) {
            setStatus("CHECK_OUT_OPEN");
        } else {
            setStatus("CLOSED");
        }
    };

    checkStatus();
    const intervalId = setInterval(checkStatus, 30000); 

    return () => clearInterval(intervalId);
    
  }, [config, configLoading]);

  return { status, config: config as SchoolConfig | null };
};
