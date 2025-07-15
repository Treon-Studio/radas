
import { Metadata } from "next";

export const metadata: Metadata = {
	title: "Tools",
	description: "Radas Tools",
	openGraph: {
		images: "https://radas.treonstudio.com/v1-og.png",
		title: "Tools",
		description: "Radas Tools",
		url: "https://radas.treonstudio.com/tools",
		type: "article",
		siteName: "RADAS",
	},
	twitter: {
		images: "https://radas.treonstudio.com/v1-og.png",
		card: "summary_large_image",
		site: "@better_auth",
		creator: "@better_auth",
		title: "Tools",
		description: "Radas Tools",
	},
};

export default function Tools() {
	return (
		<div className="min-h-screen bg-transparent overflow-hidden">
			<p>Tools</p>
		</div>
	);
}
