import React from "react";

interface ComingSoonSectionProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  features?: string[];
}

export function ComingSoonSection({
  icon,
  title,
  description,
  features,
}: ComingSoonSectionProps) {
  return (
    <div className="h-full flex items-center justify-center p-8">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-4 opacity-50">{icon}</div>
        <h3 className="text-xl font-semibold mb-2">{title}</h3>
        <p className="text-sm text-muted-foreground mb-4">{description}</p>

        {features && features.length > 0 && (
          <div className="mt-6">
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Planned Features:
            </p>
            <ul className="text-xs text-muted-foreground space-y-1">
              {features.map((feature, index) => (
                <li key={index}>• {feature}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6 px-4 py-2 rounded-lg bg-muted inline-block">
          <p className="text-xs font-medium text-muted-foreground">🚧 Coming Soon</p>
        </div>
      </div>
    </div>
  );
}
