export default function PageContainer({ children, className = '' }) {
    return (
        <div className={`flex flex-col h-full space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300 ${className}`}>
            {children}
        </div>
    );
}