"use client";

import {
	Globe2Icon,
	PlugIcon,
	PlugZap2Icon,
	Plus,
	RabbitIcon,
	ShieldCheckIcon,
	Webhook,
} from "lucide-react";
import { LockClosedIcon } from "@radix-ui/react-icons";

import { TechStackDisplay } from "./display-techstack";
import { Ripple } from "./ripple";
import { GithubStat } from "./github-stat";
import { cn } from "@/lib/utils";
import { Testimonial } from "./landing/people-say";
import InstallationStep from "./installation-step";
const features = [
	{
		id: 1,
		label: "Lightning Fast",
		description:
			"Start new projects in seconds, not hours. Eliminate boilerplate and focus on building.",
		icon: RabbitIcon,
	},
	{
		id: 2,
		label: "Multi-Stack Support",
		description:
			"Frontend, Backend, DevOps, and Design tools all in one unified CLI experience.",
		icon: PlugZap2Icon,
	},
	{
		id: 3,
		label: "Production Ready",
		description:
			"Built-in best practices and configurations for enterprise-grade applications.",
		icon: ShieldCheckIcon,
	},
	{
		id: 4,
		label: "DevOps Integration",
		description:
			"Seamless deployment and container management with automated workflows.",
		icon: Globe2Icon,
	},
	{
		id: 5,
		label: "Design & Asset Tools",
		description:
			"Bridge design and development with asset management and export tools.",
		icon: Webhook,
	},
	{
		id: 6,
		label: "Exceptional DX",
		description:
			"Exceptional Developer Experience leads to exceptional products.",
		icon: PlugIcon,
	},
];

const installations = [
	{
		method: "Quick Install (curl)",
		command: "curl -fsSL https://raw.githubusercontent.com/Treon-Studio/radas/main/apps/radas-cli/install.sh | bash",
		description: "One-line installation script for Unix-like systems"
	},
	{
		method: "Using Go",
		command: "go run github.com/Radas/Radas/v3@latest create",
		description: "Run directly with Go without installation"
	},
	{
		method: "Homebrew",
		command: "brew tap Radas/tap && brew install Radas/tap/Radas",
		description: "Install via Homebrew package manager"
	}
];

export default function Features({ stars }: { stars: string | null }) {
	return (
		<div className="md:w-10/12 my-10 mx-auto font-geist relative md:border-l-0 md:border-b-0 md:border-[1.2px] rounded-none -pr-2 dark:bg-black/[0.95]">
			<div className="w-full md:mx-0">
				<div className="grid grid-cols-1 relative md:grid-rows-2 md:grid-cols-3 border-b-[1.2px]">
					<div className="hidden md:grid top-1/2 left-0 -translate-y-1/2 w-full grid-cols-3 z-10 pointer-events-none select-none absolute">
						<Plus className="w-8 h-8 text-neutral-300 translate-x-[16.5px] translate-y-[.5px] ml-auto dark:text-neutral-600" />
						<Plus className="w-8 h-8 text-neutral-300 ml-auto translate-x-[16.5px] translate-y-[.5px] dark:text-neutral-600" />
					</div>
					{features.map((feature, index) => (
						<div
							key={feature.id}
							className={cn(
								"justify-center border-l-[1.2px] md:min-h-[240px] border-t-[1.2px] md:border-t-0 transform-gpu flex flex-col p-10",
								index >= 3 && "md:border-t-[1.2px]",
							)}
						>
							<div className="flex items-center gap-2 my-1">
								<feature.icon className="w-4 h-4" />
								<p className="text-gray-600 dark:text-gray-400">
									{feature.label}
								</p>
							</div>
							<div className="mt-2">
								<p className="mt-2 text-sm text-left text-muted-foreground">
									{feature.description}
									<a className="ml-2 underline" href="/docs" target="_blank">
										Learn more
									</a>
								</p>
							</div>
						</div>
					))}
				</div>
				<div className="w-full border-l-2 hidden md:block">
					<Testimonial />
				</div>
				<div className="relative col-span-3 border-t-[1.2px] border-l-[1.2px] md:border-b-[1.2px] dark:border-b-0  h-full py-20">
					<div className="w-full h-full p-16 pt-10 md:px-10">
						<div className="flex flex-col items-center justify-center w-full h-full gap-3">
							<div className="flex items-center gap-2">
								<Globe2Icon className="w-4 h-4" />
								<p className="text-gray-600 dark:text-gray-400">
									RADAS — The All-in-One Platform
								</p>
							</div>
							<p className="max-w-md mx-auto mt-4 mb-8 text-4xl font-normal tracking-tighter text-center md:text-4xl">
								<strong>Ready to experience ?</strong>
							</p>


							<div className="space-y-6">
								{installations.map((installation, index) => (
									<InstallationStep key={index} {...installation} />
								))}
							</div>
							<div className="flex items-center gap-2">
								<GithubStat stars={stars} />
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
