'use server';

import { notFound } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { firestore } from '@/firebase/server'; // Using server-side firestore instance
import { fetchUserMonthlyReportData } from '@/lib/attendance';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import ReportClientShell from './ReportClientShell';

// Helper to parse the month from searchParams
const getMonthDate = (monthParam: string | undefined): Date => {
    if (monthParam) {
        const [year, month] = monthParam.split('-').map(Number);
        // Create a date in UTC to avoid timezone issues
        return new Date(Date.UTC(year, month - 1, 15)); // Use mid-month to be safe
    }
    return new Date();
};

// This is now a React Server Component (RSC)
export default async function UserReportDetailPage({ params, searchParams }: { 
    params: { userId: string },
    searchParams: { month?: string }
}) {
    const { userId } = params;
    const currentMonth = getMonthDate(searchParams.month);

    try {
        // Fetch all required data on the server
        const userRef = doc(firestore, 'users', userId);
        const schoolConfigRef = doc(firestore, 'schoolConfig', 'default');

        const [userSnap, schoolConfigSnap] = await Promise.all([
            getDoc(userRef),
            getDoc(schoolConfigRef),
        ]);

        if (!userSnap.exists()) {
            notFound(); // Triggers 404 page if user doesn't exist
        }

        const userData = userSnap.data();
        const schoolConfigData = schoolConfigSnap.exists() ? schoolConfigSnap.data() : {};

        // Fetch the detailed report data for the given month
        const reportData = await fetchUserMonthlyReportData(firestore, userId, currentMonth, schoolConfigData);

        // Pass the pre-fetched data to a Client Component for interactivity
        return (
            <ReportClientShell 
                userId={userId}
                initialUserData={userData}
                initialReportData={reportData}
                initialMonth={currentMonth.toISOString()} // Pass date as string
                initialSchoolConfig={schoolConfigData}
            />
        );

    } catch (error) {
        console.error("Error rendering server component for user report:", error);
        return (
            <div className="p-4">
                <Alert variant="destructive">
                    <AlertTitle>Gagal Memuat Laporan</AlertTitle>
                    <AlertDescription>
                        Terjadi kesalahan saat mengambil data di server. Silakan coba lagi nanti atau hubungi administrator.
                    </AlertDescription>
                </Alert>
            </div>
        );
    }
}
