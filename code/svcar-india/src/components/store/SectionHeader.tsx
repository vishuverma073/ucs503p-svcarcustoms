import Link from "next/link";
import { ArrowRight } from "lucide-react";

interface SectionHeaderProps {
    title: string;
    highlight?: string; // word within title to color with gradient
    subtitle?: string;
    viewAllHref?: string;
    viewAllLabel?: string;
    className?: string;
    /**
     * Heading level to render. Sections inside a page stay "h2"; a page whose
     * main heading IS this header (a category listing) passes "h1" so the
     * document has exactly one top-level heading for search engines.
     */
    as?: "h1" | "h2";
}

export default function SectionHeader({
    title,
    highlight,
    subtitle,
    viewAllHref,
    viewAllLabel = "View All",
    className = "",
    as: Heading = "h2",
}: SectionHeaderProps) {
    // Split title to wrap the highlight word in a span
    const renderTitle = () => {
        if (!highlight) return title;
        const parts = title.split(new RegExp(`(${highlight})`, "i"));
        return parts.map((part, i) =>
            part.toLowerCase() === highlight.toLowerCase() ? (
                <span key={i} className="highlight">
                    {part}
                </span>
            ) : (
                <span key={i}>{part}</span>
            )
        );
    };

    return (
        <div className={`section-header ${className}`}>
            <div className="section-header-accent" />
            <div className="flex items-end justify-between gap-4">
                <div>
                    <Heading className="section-title">{renderTitle()}</Heading>
                    {subtitle && <p className="section-subtitle">{subtitle}</p>}
                </div>
                {viewAllHref && (
                    <Link
                        href={viewAllHref}
                        className="flex items-center gap-1 d-label !text-[13px] text-text-primary hover:text-brand-orange transition-colors shrink-0 pb-0.5"
                    >
                        {viewAllLabel} <ArrowRight size={15} aria-hidden />
                    </Link>
                )}
            </div>
        </div>
    );
}
