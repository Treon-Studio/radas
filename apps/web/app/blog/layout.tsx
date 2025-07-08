import { Metadata } from "next";

export const metadata: Metadata = {
	title: "Blog - RADAS",
	description: "Latest updates, articles, and insights about RADAS,
};

interface BlogLayoutProps {
	children: React.ReactNode;
}

export default function BlogLayout({ children }: BlogLayoutProps) {
	return (
		<div className="relative flex min-h-screen flex-col">
			<main className="flex-1">{children}</main>
		</div>
	);
}
