import { SVGProps } from "react";
import { cn } from "@/lib/utils";
export const Logo = (props: SVGProps<any>) => {
	return (
		<svg
  viewBox="0 0 680 680"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
  className={cn("w-5 h-5", props.className)}
>
  <g>
    <polygon points="170,340 340,510 510,340 340,170" fill="#FAF9F5" />
    <polygon points="340,170 510,340 680,340 510,170" fill="#FAF9F5" />
    <polygon points="340,510 170,340 0,340 170,510" fill="#FAF9F5" />
  </g>
</svg>
	);
};
