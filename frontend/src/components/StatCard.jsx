import React from 'react';

export function StatsGrid({ children, className = '' }) {
    return <div className={`stats-grid ${className}`.trim()}>{children}</div>;
}

export function StatCard({
    icon: Icon,
    iconVariant,
    iconNode,
    label,
    value,
    suffix,
    detail,
    valueClassName = '',
    onClick,
    active = false,
    children,
}) {
    const iconClass = ['stat-icon', iconVariant].filter(Boolean).join(' ');
    const cardClass = ['stat-card', active && 'active', onClick && 'stat-card--clickable']
        .filter(Boolean).join(' ');
    const Tag = onClick ? 'button' : 'div';
    return (
        <Tag
            className={cardClass}
            {...(onClick && { type: 'button', onClick, 'aria-pressed': active })}
        >
            <div className={iconClass}>
                {iconNode ?? (Icon ? <Icon size={20} /> : null)}
            </div>
            <div className="stat-content">
                <span className="stat-label">{label}</span>
                {children ?? (
                    <span className={`stat-value ${valueClassName}`.trim()}>
                        {value}
                        {suffix && <span className="stat-suffix">{suffix}</span>}
                    </span>
                )}
                {detail && <span className="stat-detail">{detail}</span>}
            </div>
        </Tag>
    );
}

export default StatCard;
