import { cn } from "@/lib/utils";

export const PageWrapper = ({ children, className }: { children: React.ReactNode, className?: string }) => {
    return (
        <div className={cn("w-full max-w-2xl mx-auto", className)}>
            {children}
        </div>
    );
}