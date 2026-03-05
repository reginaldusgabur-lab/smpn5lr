'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export const AdminDashboardSkeletons = () => (
    <div className="space-y-6 animate-pulse">
        <div className="space-y-1">
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-4 w-3/4 !mt-2" />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
                <CardHeader>
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-4 w-full" />
                </CardHeader>
                <CardContent>
                    <div className="space-y-2">
                        {[...Array(3)].map((_, i) => (
                             <div key={i} className="flex items-center space-x-4 p-2 border-b">
                                <Skeleton className="h-4 w-1/3 flex-1" />
                                <Skeleton className="h-4 w-1/4" />
                                <Skeleton className="h-5 w-16 rounded-full" />
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
            <div className="space-y-6">
                 {[...Array(3)].map((_, i) => (
                    <Card key={i}>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <Skeleton className="h-4 w-1/2" />
                            <Skeleton className="h-5 w-5 rounded-full" />
                        </CardHeader>
                        <CardContent>
                            <Skeleton className="h-8 w-1/4" />
                            <Skeleton className="h-3 w-3/4 mt-1" />
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    </div>
);
